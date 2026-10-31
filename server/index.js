import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { openStore, checkPassword } from './store.js';
import { openPgStore } from './store-pg.js';
import { files, isPng } from './files.js';
import {
  ITEMS, WALLPAPERS, FLOORS, SKINS, HAIRS, SHIRTS, STYLES, FACES, OUTFITS, FOCUS_LENGTHS, canPlace, placeSwaps, focusReward,
  WALL_PATTERNS, FLOOR_STYLES, PETS, MAX_PETS, EXPAND_COST, colorsFor, USES, PET_ACCS, MAX_ROOMS, ROOM_COST,
} from '../shared/game.js';
import { parseVideo } from '../shared/watch.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIST = path.join(root, 'dist');
const PORT = Number(process.env.PORT) || 8787;
// DATABASE_URL (e.g. Neon Postgres) in production; otherwise a local SQLite file for development.
const legacy = path.join(root, 'data.json');
const store = process.env.DATABASE_URL
  ? await openPgStore(process.env.DATABASE_URL, legacy)
  : openStore(process.env.DB_FILE || path.join(root, 'auralis.db'), legacy);
console.log(`Storage: ${process.env.DATABASE_URL ? 'Postgres (DATABASE_URL)' : 'local SQLite'}; files: ${files ? 'Neon Object Storage' : 'off'}`);
const { db } = store;
// Players used to have one `room`; now they have `rooms`, the first being the original.
for (const p of Object.values(db.players)) if (!p.rooms) { p.rooms = [p.room ?? newRoom()]; delete p.room; }
let saveTimer = null;
const save = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(store.saveAll, 500);
};

const sockets = new Map(); // playerId -> ws
const positions = new Map(); // playerId -> { x, y }
const lastChat = new Map(); // playerId -> ms, simple flood guard
// house code -> the video it is watching together: { src, by, byName, playing, pos, at }. Not saved: a restart ends it.
const watches = new Map();
const lastDm = new Map(); // playerId -> ms, same guard for private messages
let nextId = Date.now();

const newCode = () => {
  let code;
  do code = crypto.randomBytes(4).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 5).toUpperCase();
  while (code.length < 5 || db.houses[code]);
  return code;
};

// Every player has a home house whose code never changes: they can visit friends and always come back to it.
// A home stays (with its to-dos and chat) while its owner is out; only ownerless houses are removed when empty.
function ensureHome(p) {
  if (!p.home) { // saves from before homes: the house you founded becomes your home
    const h = db.houses[p.house];
    if (h && !h.owner && h.members[0] === p.id) { h.owner = p.id; p.home = h.code; }
  }
  if (db.houses[p.home]?.owner === p.id) return;
  // No home yet, or it was removed under the old rules: bring it back under the same code when that's still free.
  const code = p.home && !db.houses[p.home] ? p.home : newCode();
  db.houses[code] = { code, owner: p.id, members: [], todos: [], chat: [] };
  p.home = code;
}

function goHome(p) {
  ensureHome(p);
  const h = db.houses[p.home];
  if (!h.members.includes(p.id)) h.members.push(p.id);
  p.house = p.home;
}

// Houses you've visited, newest first, so you can go back with one click.
const MAX_VISITED = 8;
function remember(p, code) {
  if (code === p.home) return;
  p.visited = [code, ...(p.visited ?? []).filter((c) => c !== code)].slice(0, MAX_VISITED);
}
// What the House panel shows: recent houses that still exist and still let you in, and (for owners) who they removed.
function houseLists(p) {
  const visited = (p.visited ?? []).filter((c) => db.houses[c] && c !== p.home && !db.houses[c].banned?.includes(p.id)).map((c) => {
    const h = db.houses[c];
    return { code: c, ownerName: db.players[h.owner]?.name ?? null, online: h.members.filter((id) => sockets.has(id)).length };
  });
  const banned = (db.houses[p.home]?.banned ?? []).map((id) => ({ id, name: db.players[id]?.name ?? 'Someone' }));
  return { visited, banned };
}

function leaveHouse(p) {
  const h = db.houses[p.house];
  if (!h) return;
  h.members = h.members.filter((id) => id !== p.id);
  if (!h.members.length && !h.owner) { delete db.houses[h.code]; store.deleteHouse(h.code); }
  else broadcastHouse(h.code);
  p.house = null;
}

const pick = (list, v, fallback) => (list.includes(v) ? v : fallback);
const cleanText = (s, max) => String(s ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
const cleanName = (s) => String(s ?? '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16) || 'Studier';

// Keep private conversations bounded: forget the least recently used threads.
const MAX_DM_THREADS = 20;
function trimDmThreads(rec) {
  const keys = Object.keys(rec);
  if (keys.length <= MAX_DM_THREADS) return;
  const lastAt = (k) => rec[k].at(-1)?.at ?? 0;
  keys.sort((a, b) => lastAt(a) - lastAt(b));
  for (const k of keys.slice(0, keys.length - MAX_DM_THREADS)) delete rec[k];
}

function publicPlayer(p) {
  return {
    id: p.id, name: p.name, look: p.look, rooms: p.rooms, focus: p.focus, pets: p.pets ?? [],
    totalMinutes: p.totalMinutes, online: sockets.has(p.id), pos: positions.get(p.id) ?? null,
  };
}

function send(ws, msg) {
  if (ws?.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcastHouse(code) {
  const h = db.houses[code];
  if (!h) return;
  const w = watches.get(code);
  // now lets clients work out how far a playing video has got without trusting their own clocks.
  const house = {
    code, owner: h.owner ?? null, ownerName: db.players[h.owner]?.name ?? null,
    members: h.members.map((id) => publicPlayer(db.players[id])), todos: h.todos ?? [], chat: h.chat ?? [], watch: w ? { ...w, now: Date.now() } : null,
  };
  for (const id of h.members) {
    const p = db.players[id];
    // Personal to-dos ride along in `me`, which only this player receives.
    send(sockets.get(id), { t: 'state', house, me: { id: p.id, home: p.home, ...houseLists(p), coins: p.coins, inventory: p.inventory, petAccs: p.petAccs ?? [], sessions: p.sessions ?? [], subjects: p.subjects ?? [], hiddenSubjects: p.hiddenSubjects ?? [], todos: p.todos ?? [], dm: p.dm ?? {} } });
  }
}

// The room a message is about: m.r picks one of the player's rooms (the first when missing).
const roomOf = (p, m) => p.rooms[m.r ?? 0] ?? null;
function newRoom() { return { wallpaper: WALLPAPERS[0], floor: FLOORS[0], furniture: [] }; }

function handle(p, m) {
  const room = roomOf(p, m);
  if (['place', 'move', 'pickup', 'room', 'flip', 'restyle', 'shape', 'expand'].includes(m.t) && !room) return;
  switch (m.t) {
    case 'look':
      p.name = cleanName(m.name);
      p.look = {
        skin: pick(SKINS, m.look?.skin, p.look.skin),
        hair: pick(HAIRS, m.look?.hair, p.look.hair),
        shirt: pick(SHIRTS, m.look?.shirt, p.look.shirt),
        style: pick(STYLES, m.look?.style, p.look.style ?? STYLES[0]),
        face: pick(FACES, m.look?.face, p.look.face ?? FACES[0]),
        outfit: pick(OUTFITS, m.look?.outfit, p.look.outfit ?? OUTFITS[0]),
      };
      break;
    case 'join': {
      const code = String(m.code ?? '').toUpperCase();
      if (!db.houses[code]) return send(sockets.get(p.id), { t: 'error', text: 'No house with that code.' });
      if (code === p.house) return;
      if (db.houses[code].banned?.includes(p.id)) return send(sockets.get(p.id), { t: 'error', text: "The owner removed you from that house, so you can't join it." });
      leaveHouse(p);
      db.houses[code].members.push(p.id);
      p.house = code;
      remember(p, code);
      positions.delete(p.id);
      break;
    }
    case 'forget': // drop a house from your recent list
      p.visited = (p.visited ?? []).filter((c) => c !== m.code);
      break;
    case 'kick': { // a home's owner removes someone; they go back to their own home and can't rejoin until allowed back
      const h = db.houses[p.home], them = db.players[m.id];
      if (!h || h.owner !== p.id || !them || them.id === p.id) return;
      h.banned = [...new Set([...(h.banned ?? []), them.id])];
      them.visited = (them.visited ?? []).filter((c) => c !== h.code);
      if (them.house === h.code) {
        leaveHouse(them);
        goHome(them);
        positions.delete(them.id);
        broadcastHouse(them.house);
        send(sockets.get(them.id), { t: 'error', text: `${p.name} removed you from their house. You're back home.` });
      }
      break;
    }
    case 'unban': { // allow someone back
      const h = db.houses[p.home];
      if (!h || h.owner !== p.id) return;
      h.banned = (h.banned ?? []).filter((id) => id !== m.id);
      break;
    }
    case 'leave': // go back home
      ensureHome(p);
      if (p.house === p.home) return;
      remember(p, p.house); // also covers houses joined before history existed
      leaveHouse(p);
      goHome(p);
      positions.delete(p.id);
      break;
    case 'subject_save': {
      const tag = cleanText(m.tag, 24);
      if (!tag) return;
      p.subjects = [tag, ...(p.subjects ?? []).filter((t) => t !== tag)].slice(0, 12);
      p.hiddenSubjects = (p.hiddenSubjects ?? []).filter((t) => t !== tag);
      break;
    }
    case 'subject_remove': {
      const tag = cleanText(m.tag, 24);
      p.subjects = (p.subjects ?? []).filter((t) => t !== tag);
      p.hiddenSubjects = [tag, ...(p.hiddenSubjects ?? []).filter((t) => t !== tag)].slice(0, 50);
      break;
    }
    case 'leaderboard': {
      // Ranked by focused minutes, this week (last 7 days) or all time; house only or everyone.
      const since = m.period === 'all' ? 0 : Date.now() - 7 * 86_400_000;
      const pool = m.scope === 'all' ? Object.values(db.players) : db.houses[p.house].members.map((id) => db.players[id]);
      const rows = pool
        .map((o) => ({
          name: o.name,
          me: o.id === p.id,
          minutes: since ? (o.sessions ?? []).filter((s) => s.at >= since).reduce((n, s) => n + s.minutes, 0) : o.totalMinutes,
        }))
        .filter((r) => r.minutes > 0 || r.me)
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, 25);
      return send(sockets.get(p.id), { t: 'leaderboard', scope: m.scope, period: m.period, rows });
    }
    case 'pos':
      if (Number.isFinite(m.x) && Number.isFinite(m.y)) {
        // use: what they're doing with the furniture in front of them (watering, reading...), if anything.
        const use = USES.includes(m.use) ? m.use : undefined;
        positions.set(p.id, { x: m.x, y: m.y, use });
        for (const id of db.houses[p.house].members) {
          if (id !== p.id) send(sockets.get(id), { t: 'pos', id: p.id, x: m.x, y: m.y, use });
        }
      }
      return; // no full broadcast for movement
    case 'focus_start':
      if (!FOCUS_LENGTHS.includes(m.minutes) || p.focus) return;
      p.focus = { minutes: m.minutes, endsAt: Date.now() + m.minutes * 60_000, tag: cleanText(m.tag, 24) || 'Study' };
      p.hiddenSubjects = (p.hiddenSubjects ?? []).filter((t) => t !== p.focus.tag); // using a subject again brings it back
      break;
    case 'focus_cancel':
      p.focus = null;
      break;
    case 'focus_done': {
      if (!p.focus || Date.now() < p.focus.endsAt - 2000) return;
      const now = Date.now();
      const withFriends = db.houses[p.house].members.some((id) => {
        const o = db.players[id];
        return id !== p.id && (o.focus || now - (o.lastDoneAt ?? 0) < 120_000);
      });
      const reward = focusReward(p.focus.minutes, withFriends);
      p.coins += reward;
      p.totalMinutes += p.focus.minutes;
      p.lastDoneAt = now;
      p.sessions ??= [];
      p.sessions.push({ at: now, minutes: p.focus.minutes, tag: p.focus.tag ?? 'Study' });
      if (p.sessions.length > 3000) p.sessions.splice(0, p.sessions.length - 3000);
      p.focus = null;
      send(sockets.get(p.id), { t: 'reward', coins: reward, withFriends });
      break;
    }
    case 'buy': {
      const it = ITEMS[m.item];
      if (!it || p.coins < it.price) return;
      p.coins -= it.price;
      p.inventory[m.item] = (p.inventory[m.item] ?? 0) + 1;
      break;
    }
    case 'place': {
      const out = p.inventory[m.item] > 0 ? placeSwaps(room, m.item, m.x, m.y) : null;
      if (!out) return;
      p.inventory[m.item]--;
      for (const f of room.furniture.filter((_, i) => out.includes(i))) p.inventory[f.item] = (p.inventory[f.item] ?? 0) + 1;
      room.furniture = room.furniture.filter((_, i) => !out.includes(i));
      room.furniture.push({ item: m.item, x: m.x, y: m.y });
      break;
    }
    case 'move': {
      const f = room.furniture[m.index];
      const rest = { ...room, furniture: room.furniture.filter((_, i) => i !== m.index) };
      if (!f || !canPlace(rest, f.item, m.x, m.y)) return;
      f.x = m.x;
      f.y = m.y;
      break;
    }
    case 'pickup': {
      const f = room.furniture[m.index];
      if (!f) return;
      room.furniture.splice(m.index, 1);
      p.inventory[f.item] = (p.inventory[f.item] ?? 0) + 1;
      break;
    }
    case 'room':
      room.wallpaper = pick(WALLPAPERS, m.wallpaper, room.wallpaper);
      room.floor = pick(FLOORS, m.floor, room.floor);
      room.pattern = pick(WALL_PATTERNS, m.pattern, room.pattern ?? WALL_PATTERNS[0]);
      room.floorStyle = pick(FLOOR_STYLES, m.floorStyle, room.floorStyle ?? FLOOR_STYLES[0]);
      break;
    case 'flip': {
      const f = room.furniture[m.index];
      if (!f) return;
      f.flip = !f.flip;
      break;
    }
    case 'restyle': {
      const f = room.furniture[m.index];
      if (!f || !Number.isInteger(m.v) || m.v < 0 || m.v >= colorsFor(f.item).length) return;
      f.v = m.v;
      break;
    }
    case 'shape': {
      const f = room.furniture[m.index];
      if (!f || !Number.isInteger(m.s) || m.s < 0 || m.s >= (ITEMS[f.item].looks?.length ?? 1)) return;
      f.s = m.s;
      break;
    }
    case 'expand': {
      const next = (room.level ?? 0) + 1;
      if (next >= EXPAND_COST.length || p.coins < EXPAND_COST[next]) return;
      p.coins -= EXPAND_COST[next];
      room.level = next;
      break;
    }
    case 'add_room': {
      const n = p.rooms.length;
      if (n >= MAX_ROOMS || p.coins < ROOM_COST[n]) return;
      p.coins -= ROOM_COST[n];
      p.rooms.push(newRoom());
      break;
    }
    case 'adopt': {
      const pet = PETS[m.kind];
      p.pets ??= [];
      if (!pet || p.coins < pet.price || p.pets.length >= MAX_PETS) return;
      p.coins -= pet.price;
      p.pets.push({ kind: m.kind });
      break;
    }
    case 'buy_acc': {
      const acc = PET_ACCS[m.acc];
      p.petAccs ??= [];
      if (!acc || p.petAccs.includes(m.acc) || p.coins < acc.price) return;
      p.coins -= acc.price;
      p.petAccs.push(m.acc);
      break;
    }
    // Dress up a pet: a free coat colour, and an accessory you own (or '' for none).
    case 'pet_style': {
      const pet = p.pets?.[m.slot];
      if (!pet) return;
      if (Number.isInteger(m.coat) && m.coat >= 0 && m.coat < PETS[pet.kind].coats.length) pet.coat = m.coat;
      if (m.acc === '' || (p.petAccs ?? []).includes(m.acc)) pet.acc = m.acc || undefined;
      break;
    }
    case 'todo_add': {
      const h = db.houses[p.house];
      const text = cleanText(m.text, 120);
      h.todos ??= [];
      if (!text) return;
      if (h.todos.length >= 60) return send(sockets.get(p.id), { t: 'error', text: 'The house list is full (60). Clear some done ones first.' });
      h.todos.push({ id: nextId++, text, done: false, by: p.name });
      break;
    }
    case 'todo_toggle': {
      const t = db.houses[p.house].todos?.find((x) => x.id === m.id);
      if (!t) return;
      t.done = !t.done;
      break;
    }
    case 'todo_del': {
      const h = db.houses[p.house];
      h.todos = (h.todos ?? []).filter((x) => x.id !== m.id);
      break;
    }
    // Personal to-dos: private to one player, never shared with the house.
    case 'ptodo_add': {
      const text = cleanText(m.text, 120);
      p.todos ??= [];
      if (!text) return;
      if (p.todos.length >= 60) return send(sockets.get(p.id), { t: 'error', text: 'Your list is full (60). Clear some done ones first.' });
      p.todos.push({ id: nextId++, text, done: false });
      break;
    }
    case 'ptodo_toggle': {
      const t = p.todos?.find((x) => x.id === m.id);
      if (!t) return;
      t.done = !t.done;
      break;
    }
    case 'ptodo_del': {
      p.todos = (p.todos ?? []).filter((x) => x.id !== m.id);
      break;
    }
    // Private messages: stored on both players' records, so each keeps the thread
    // even after leaving the house. Only housemates can be messaged.
    case 'dm': {
      const to = db.players[m.to];
      const text = cleanText(m.text, 200);
      if (!to || !text || to.id === p.id || !db.houses[p.house]?.members.includes(to.id)) return;
      const now = Date.now();
      if (now - (lastDm.get(p.id) ?? 0) < 600) return send(sockets.get(p.id), { t: 'error', text: 'Slow down a little — that message was not sent.' });
      lastDm.set(p.id, now);
      const msg = { id: nextId++, from: p.id, by: p.name, text, at: now };
      p.dm ??= {};
      to.dm ??= {};
      p.dm[to.id] = [...(p.dm[to.id] ?? []), msg].slice(-50);
      to.dm[p.id] = [...(to.dm[p.id] ?? []), msg].slice(-50);
      trimDmThreads(p.dm);
      trimDmThreads(to.dm);
      break;
    }
    case 'chat': {
      const h = db.houses[p.house];
      const text = cleanText(m.text, 200);
      const now = Date.now();
      if (!text) return;
      if (now - (lastChat.get(p.id) ?? 0) < 600) return send(sockets.get(p.id), { t: 'error', text: 'Slow down a little — that message was not sent.' });
      lastChat.set(p.id, now);
      h.chat ??= [];
      h.chat.push({ id: nextId++, from: p.id, by: p.name, text, at: now });
      h.chat = h.chat.slice(-50);
      break;
    }
    case 'watch': { // /watch <link> starts a watch party for the whole house; /watch stop ends it
      const h = db.houses[p.house];
      const stop = String(m.url ?? '').trim().toLowerCase() === 'stop';
      const src = stop ? null : parseVideo(String(m.url ?? '').slice(0, 600));
      if (!stop && !src) return send(sockets.get(p.id), { t: 'error', text: "Can't play that link. Try YouTube, Vimeo, Twitch, Dailymotion or a direct .mp4/.webm link." });
      if (stop && !watches.has(p.house)) return;
      if (stop) watches.delete(p.house);
      else watches.set(p.house, { src, by: p.id, byName: p.name, playing: true, pos: src.start, at: Date.now() });
      h.chat ??= [];
      h.chat.push({ id: nextId++, from: p.id, by: p.name, text: stop ? '⏹ ended the watch party' : '🎬 started a watch party', at: Date.now() });
      h.chat = h.chat.slice(-50);
      break;
    }
    case 'watchCtl': { // someone pressed play/pause or seeked: everyone follows
      const w = watches.get(p.house);
      if (!w || !Number.isFinite(m.pos) || m.pos < 0 || m.pos > 1e6) return;
      w.playing = !!m.playing;
      w.pos = m.pos;
      w.at = Date.now();
      broadcastHouse(p.house);
      return;
    }
    default:
      return;
  }
  save();
  broadcastHouse(p.house);
}

function newPlayer(id, name) {
  return {
    id, name: cleanName(name), coins: 30, totalMinutes: 0, focus: null,
    look: { skin: SKINS[0], hair: HAIRS[0], shirt: SHIRTS[0], style: STYLES[0], face: FACES[0], outfit: OUTFITS[0] },
    inventory: {}, pets: [],
    rooms: [{ wallpaper: WALLPAPERS[0], floor: FLOORS[0], furniture: [{ item: 'chair', x: 4, y: 3 }, { item: 'desk', x: 4, y: 4 }] }],
  };
}

// ---------- accounts (HTTP JSON API) ----------
const USERNAME = /^[A-Za-z0-9_.-]{3,20}$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const attempts = new Map(); // ip -> { n, since }: slows down password guessing
function tooMany(ip, limit) {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || now - a.since > 10 * 60_000) { attempts.set(ip, { n: 1, since: now }); return false; }
  return ++a.n > limit;
}

function readJson(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; if (body.length > 10_000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
  });
}

function readBytes(req, max) {
  return new Promise((resolve, reject) => {
    const parts = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size > max) { reject(new Error('too big')); req.destroy(); } else parts.push(c); });
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });
}

// Room snapshots: a logged-in player uploads a PNG of their room to object storage and gets share links back.
// The object key is stored on the player; links are short-lived presigned URLs made on each request.
async function snapshots(req, res) {
  const reply = (status, data) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(data));
  if (!files) return reply(503, { error: 'File storage is not set up on this server.' });
  const id = await store.playerForToken(String(req.headers.authorization ?? '').replace(/^Bearer /, ''));
  const p = id && db.players[id];
  if (!p) return reply(401, { error: 'Please log in again.' });
  const links = async () => Promise.all((p.snapshots ?? []).map(async (key) => ({ key, url: await files.url(key, { expiresIn: 3600 }) })));
  if (req.method === 'GET') return reply(200, { snapshots: await links() });
  if (req.method !== 'POST') return reply(405, { error: 'GET or POST' });
  let body;
  try { body = await readBytes(req, 2_000_000); } catch { return reply(413, { error: 'Image is too big (2 MB max).' }); }
  if (!isPng(body)) return reply(400, { error: 'Expected a PNG image.' });
  const key = `snapshots/${p.id}/${Date.now()}.png`;
  await files.upload(key, body, { contentType: 'image/png' });
  const old = (p.snapshots ?? []).slice(5);
  p.snapshots = [key, ...(p.snapshots ?? [])].slice(0, 6);
  await Promise.all(old.map((k) => files.delete(k).catch(() => {}))); // keep the newest 6
  save();
  return reply(200, { snapshots: await links() });
}

async function api(req, res, route) {
  const reply = (status, data) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(data));
  if (route === 'snapshots') return snapshots(req, res);
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });
  const body = await readJson(req);
  const ip = req.socket.remoteAddress ?? '?';
  if (route === 'logout') { await store.revokeToken(body.token); return reply(200, { ok: true }); }
  if (tooMany(ip, 20)) return reply(429, { error: 'Too many tries. Wait a few minutes and try again.' });
  const username = String(body.username ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  if (route === 'signup') {
    if (!USERNAME.test(username)) return reply(400, { error: 'Username: 3–20 letters, numbers, _ . or -' });
    if (password.length < 8 || password.length > 200) return reply(400, { error: 'Password needs at least 8 characters.' });
    if (!EMAIL.test(email) || email.length > 254) return reply(400, { error: 'Please enter a valid email address.' });
    if (await store.findAccount(username)) return reply(409, { error: 'That username is taken.' });
    if (await store.emailTaken(email)) return reply(409, { error: 'That email already has an account. Try logging in.' });
    // A guest from before accounts existed can claim their old progress once.
    const claim = typeof body.legacyId === 'string' && db.players[body.legacyId] && !(await store.hasAccount(body.legacyId)) ? body.legacyId : null;
    const id = claim ?? crypto.randomBytes(12).toString('hex');
    try {
      await store.createAccount(id, username, password, email);
    } catch {
      return reply(409, { error: 'That username or email is taken.' }); // lost a race with another sign-up
    }
    if (!claim) db.players[id] = newPlayer(id, username);
    else if (db.players[id].name === 'Studier') db.players[id].name = cleanName(username);
    await store.saveAll();
    return reply(200, { token: await store.issueToken(id), username });
  }
  if (route === 'login') {
    const acct = await store.findAccount(username);
    if (!acct || !checkPassword(password, acct.pass)) return reply(401, { error: 'Wrong username, email or password.' });
    return reply(200, { token: await store.issueToken(acct.player_id), username: acct.username });
  }
  return reply(404, { error: 'Not found' });
}

function serveStatic(req, res) {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.join(DIST, url);
  let status = 200;
  // The game lives at '/'; any other address that isn't a real file gets the 404 page.
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const home = url === '/' || url === '/index.html';
    file = path.join(DIST, home ? 'index.html' : '404.html');
    if (!home) status = 404;
    if (!fs.existsSync(file)) file = path.join(DIST, 'index.html');
  }
  if (!fs.existsSync(file)) return res.writeHead(200, { 'content-type': 'text/plain' }).end('Auralis game server is running. Open the game from its website.');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon' };
  res.writeHead(status, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

// When the frontend lives on another domain (e.g. Vercel), list it in ALLOWED_ORIGINS (comma-separated).
// Unset means same-origin only for browsers, which is how local dev and a single-host deploy work.
const ALLOWED = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
const originOk = (origin) => !origin || !ALLOWED.length || ALLOWED.includes(origin);

const server = http.createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  const origin = req.headers.origin;
  if (origin && ALLOWED.includes(origin)) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('vary', 'origin');
    res.setHeader('access-control-allow-headers', 'content-type, authorization');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.writeHead(originOk(origin) ? 204 : 403).end();
  if (path === '/api/health') return res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
  const route = path.match(/^\/api\/(signup|login|logout|snapshots)$/)?.[1];
  if (route) api(req, res, route).catch((err) => { console.error(err); if (!res.headersSent) res.writeHead(500).end(); });
  else serveStatic(req, res);
});
// Refuse game connections from pages on domains we don't serve.
const wss = new WebSocketServer({ server, path: '/ws', verifyClient: ({ origin }) => originOk(origin) });

wss.on('connection', (ws) => {
  let p = null;
  let checking = false;
  ws.on('message', async (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!p) {
      if (m.t !== 'hello' || checking) return;
      // The secret login token, not the public player id, says who you are.
      checking = true;
      const id = await Promise.resolve().then(() => store.playerForToken(m.token)).catch(() => null);
      checking = false;
      if (!id || !db.players[id]) { send(ws, { t: 'auth', ok: false }); ws.close(); return; }
      p = db.players[id];
      // Old saves: drop furniture types that no longer exist; the old cat decoration becomes a real pet.
      const hadCat = p.rooms.some((r) => r.furniture.some((f) => f.item === 'cat')) || p.inventory.cat > 0;
      for (const r of p.rooms) r.furniture = r.furniture.filter((f) => ITEMS[f.item]);
      for (const k of Object.keys(p.inventory)) if (!ITEMS[k]) delete p.inventory[k];
      if (!STYLES.includes(p.look.style)) p.look.style = STYLES[0]; // retired hairstyles fall back to the default
      p.pets ??= hadCat ? [{ kind: 'cat' }] : [];
      ensureHome(p);
      if (!db.houses[p.house]?.members.includes(p.id)) goHome(p); // new player, or their house is gone
      sockets.get(p.id)?.close();
      sockets.set(p.id, ws);
      save();
      broadcastHouse(p.house);
      return;
    }
    handle(p, m);
  });
  ws.on('close', () => {
    if (p && sockets.get(p.id) === ws) {
      sockets.delete(p.id);
      broadcastHouse(p.house);
    }
  });
});

server.listen(PORT, () => console.log(`Auralis server on http://localhost:${PORT}`));
