import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { openStore, checkPassword } from './store.js';
import { openPgStore } from './store-pg.js';
import { files, isPng, isJpeg } from './files.js';
import {
  ITEMS, WALLPAPERS, FLOORS, SKINS, HAIRS, SHIRTS, STYLES, FACES, OUTFITS, BODIES, ACCESSORIES, isFocusLength, canPlace, placeSwaps, focusReward, quitReward, quitMinutes, focusEnd, streakDays, streakBonus,
  WALL_PATTERNS, FLOOR_STYLES, PETS, MAX_PETS, EXPAND_COST, colorsFor, USES, PET_ACCS, MAX_ROOMS, ROOM_COST,
  isPlant, TASK_COINS, TASK_REWARDS_PER_DAY, discounted, GIFT_COINS, GIFTS_PER_DAY, nextRot, sellPrice,
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
// Plants placed before watering existed start out freshly watered.
for (const p of Object.values(db.players)) for (const r of p.rooms) for (const f of r.furniture) if (isPlant(f.item)) f.wateredAt ??= Date.now();
let saveTimer = null;
const save = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(store.saveAll, 500);
};

// Pick up coins edited by hand in the accounts table. Only while someone's online, so an idle Neon database can still sleep.
setInterval(async () => {
  if (!sockets.size) return;
  const changed = await store.syncCoins();
  for (const code of new Set(changed.map((id) => db.players[id].house))) broadcastHouse(code);
}, 3000);

const sockets = new Map(); // playerId -> ws
const positions = new Map(); // playerId -> { x, y }
const lastChat = new Map(); // playerId -> ms, simple flood guard
// house code -> the video it is watching together: { src, by, byName, playing, pos, at }. Not saved: a restart ends it.
const watches = new Map();
const lastDm = new Map(); // playerId -> ms, same guard for private messages
const lastCheer = new Map(); // playerId -> ms, so cheers and high fives can't be spammed
const lastInvite = new Map(); // 'from>to' -> ms: one study invite per pair every 30 s
const MAX_EVENTS = 100; // per calendar; the earliest dates drop off first
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
  else { settleTodos(h); broadcastHouse(h.code); }
  p.house = null;
}

// "Everyone" to-dos are done once everybody in the house right now has ticked them. The first time one is finished
// with two or more people, each of them gets coins and money off their next shop buy (capped per day, so it can't be farmed).
function settleTodos(h) {
  for (const t of h.todos ?? []) {
    if (!t.all) continue;
    t.done = h.members.every((id) => t.ticks?.includes(id));
    if (!t.done || t.rewarded || h.members.length < 2) continue;
    t.rewarded = true;
    const day = new Date().toDateString();
    for (const id of h.members) {
      const q = db.players[id];
      if (q.taskDay !== day) { q.taskDay = day; q.taskRewards = 0; }
      if (q.taskRewards >= TASK_REWARDS_PER_DAY) continue;
      q.taskRewards++;
      q.coins += TASK_COINS;
      q.discount = true;
      send(sockets.get(id), { t: 'reward', text: `Everyone finished "${t.text}"! +${TASK_COINS} coins and 10% off your next shop buy.` });
    }
  }
}

const pick = (list, v, fallback) => (list.includes(v) ? v : fallback);
// Keys that come from a client must name something we actually ship. `ITEMS['__proto__']` (or 'constructor')
// is truthy, so an unchecked lookup slips past `if (!it)` and leaves the player's coins NaN.
const has = (table, key) => typeof key === 'string' && Object.hasOwn(table, key);
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
    totalMinutes: p.totalMinutes, online: sockets.has(p.id), pos: positions.get(p.id) ?? null, fedAt: p.fedAt ?? 0,
    exams: p.exams ?? [],
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
    members: h.members.map((id) => publicPlayer(db.players[id])), todos: h.todos ?? [], chat: h.chat ?? [],
    events: h.events ?? [], watch: w ? { ...w, now: Date.now() } : null,
  };
  for (const id of h.members) {
    const p = db.players[id];
    // Personal to-dos ride along in `me`, which only this player receives.
    send(sockets.get(id), { t: 'state', house, me: { id: p.id, home: p.home, ...houseLists(p), coins: p.coins, discount: !!p.discount, notes: p.notes ?? [], events: p.events ?? [], inventory: p.inventory, petAccs: p.petAccs ?? [], sessions: p.sessions ?? [], subjects: p.subjects ?? [], hiddenSubjects: p.hiddenSubjects ?? [], todos: p.todos ?? [], dm: p.dm ?? {} } });
  }
}

// The room a message is about: m.r picks one of the player's rooms (the first when missing).
const setTz = (p, tz) => { if (Number.isFinite(tz)) p.tz = Math.max(-840, Math.min(840, Math.round(tz))); };
const roomOf = (p, m) => (Number.isInteger(m.r ?? 0) ? p.rooms[m.r ?? 0] ?? null : null);
// Housemates studying now (not paused), or who finished in the last two minutes (so whoever ends first isn't counted out).
const buddiesOf = (p, now) => db.houses[p.house].members.filter((id) => {
  const o = db.players[id];
  return id !== p.id && ((o.focus && !o.focus.pausedAt) || now - (o.lastDoneAt ?? 0) < 120_000);
}).length;
function newRoom() { return { wallpaper: WALLPAPERS[0], floor: FLOORS[0], furniture: [] }; }

function handle(p, m) {
  const room = roomOf(p, m);
  if (['place', 'move', 'pickup', 'room', 'flip', 'restyle', 'shape', 'expand', 'curtains', 'light', 'turn'].includes(m.t) && !room) return;
  // Furniture is addressed by position. Anything but a real integer fetches a built-in
  // (`furniture['toString']`) or nothing, so those messages only run for real indices.
  if (['move', 'pickup', 'turn', 'flip', 'restyle', 'shape', 'light', 'water'].includes(m.t) && !Number.isInteger(m.index)) return;
  if (m.t === 'water' && !Number.isInteger(m.r)) return;
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
        body: pick(BODIES, m.look?.body, p.look.body ?? BODIES[0]),
        acc: pick(ACCESSORIES, m.look?.acc, p.look.acc ?? ACCESSORIES[0]),
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
      settleTodos(db.houses[code]);
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
      if (!isFocusLength(m.minutes) || p.focus) return;
      setTz(p, m.tz);
      p.focus = { minutes: m.minutes, endsAt: Date.now() + m.minutes * 60_000, tag: cleanText(m.tag, 24) || 'Study' };
      p.hiddenSubjects = (p.hiddenSubjects ?? []).filter((t) => t !== p.focus.tag); // using a subject again brings it back
      break;
    case 'focus_join': { // join a housemate's running session: same subject, and the timer ends when theirs does
      const o = db.houses[p.house].members.includes(m.id) ? db.players[m.id] : null;
      const endsAt = o?.focus && !o.focus.pausedAt ? o.focus.endsAt : 0, left = endsAt - Date.now();
      if (p.focus || left < 60_000) return;
      setTz(p, m.tz);
      p.focus = { minutes: Math.round(left / 60_000), endsAt, tag: o.focus.tag };
      break;
    }
    case 'focus_pause':
      if (!p.focus || p.focus.pausedAt) return;
      p.focus.pausedAt = Date.now();
      break;
    case 'focus_resume':
      if (!p.focus?.pausedAt) return;
      p.focus.endsAt = focusEnd(p.focus);
      p.focus.pausedAt = null;
      break;
    case 'focus_cancel': {
      if (!p.focus) return;
      const now = Date.now();
      const elapsed = now - (focusEnd(p.focus, now) - p.focus.minutes * 60_000); // paused time doesn't count
      const reward = quitReward(p.focus.minutes, buddiesOf(p, now), elapsed);
      const minutes = quitMinutes(p.focus.minutes, elapsed);
      p.coins += reward;
      if (minutes) {
        p.totalMinutes += minutes;
        p.sessions ??= [];
        // early: counts toward stats and the leaderboard, not toward tomatoes or the long break
        p.sessions.push({ at: now, minutes, tag: p.focus.tag ?? 'Study', early: true });
        if (p.sessions.length > 3000) p.sessions.splice(0, p.sessions.length - 3000);
      }
      p.focus = null;
      if (reward) send(sockets.get(p.id), { t: 'reward', coins: reward, text: `Ended early: +${reward} coins and ${minutes} focus min for the time you put in.` });
      else send(sockets.get(p.id), { t: 'error', text: 'Ended too early to earn anything. Stay a quarter of the way for a reward.' });
      break;
    }
    case 'focus_done': {
      if (!p.focus || Date.now() < focusEnd(p.focus) - 2000) return;
      const now = Date.now();
      const buddies = buddiesOf(p, now);
      p.totalMinutes += p.focus.minutes;
      p.lastDoneAt = now;
      p.sessions ??= [];
      p.sessions.push({ at: now, minutes: p.focus.minutes, tag: p.focus.tag ?? 'Study' });
      if (p.sessions.length > 3000) p.sessions.splice(0, p.sessions.length - 3000);
      const streak = streakDays(p.sessions, now, p.tz); // includes today, now that this session counts
      const reward = focusReward(p.focus.minutes, buddies) + Math.ceil(p.focus.minutes * streakBonus(streak));
      p.coins += reward;
      p.focus = null;
      send(sockets.get(p.id), { t: 'reward', coins: reward, buddies, streak });
      break;
    }
    case 'buy': {
      if (!has(ITEMS, m.item)) return;
      const it = ITEMS[m.item];
      const price = discounted(it.price, p.discount);
      if (p.coins < price) return;

      p.coins -= price;
      p.discount = false;
      p.inventory[m.item] = (p.inventory[m.item] ?? 0) + 1;
      break;
    }
    case 'sell': { // from storage only: placed pieces have to be put away first
      if (!has(ITEMS, m.item)) return;
      const gain = sellPrice(m.item);
      if (!(p.inventory[m.item] > 0) || gain < 1) return;
      p.inventory[m.item]--;
      p.coins += gain;
      break;
    }
    case 'place': {
      if (!has(ITEMS, m.item) || !(p.inventory[m.item] > 0)) return;
      const out = placeSwaps(room, m.item, m.x, m.y);
      if (!out) return;
      p.inventory[m.item]--;
      for (const f of room.furniture.filter((_, i) => out.includes(i))) p.inventory[f.item] = (p.inventory[f.item] ?? 0) + 1;
      room.furniture = room.furniture.filter((_, i) => !out.includes(i));
      room.furniture.push({ item: m.item, x: m.x, y: m.y, ...(isPlant(m.item) ? { wateredAt: Date.now() } : {}) });
      break;
    }
    case 'move': {
      const f = room.furniture[m.index];
      const rest = { ...room, furniture: room.furniture.filter((_, i) => i !== m.index) };
      if (!f || !canPlace(rest, f.item, m.x, m.y, f.rot)) return;
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
    case 'gift': { // send a housemate some coins, a few times a day
      const them = db.houses[p.house].members.includes(m.to) && m.to !== p.id ? db.players[m.to] : null;
      if (!them || p.coins < GIFT_COINS) return;
      const day = new Date().toDateString();
      if (p.giftDay !== day) { p.giftDay = day; p.giftsSent = 0; }
      if (p.giftsSent >= GIFTS_PER_DAY) return send(sockets.get(p.id), { t: 'error', text: `You can send ${GIFTS_PER_DAY} gifts a day. Try again tomorrow!` });
      p.giftsSent++;
      p.coins -= GIFT_COINS;
      them.coins += GIFT_COINS;
      send(sockets.get(p.id), { t: 'reward', text: `🎁 Sent ${them.name} ${GIFT_COINS} coins.` });
      send(sockets.get(them.id), { t: 'reward', text: `🎁 ${p.name} sent you ${GIFT_COINS} coins!` });
      break;
    }
    case 'feed': { // anyone in the house can fill a pet bowl; it feeds that room owner's pets (hearts float over them)
      const owner = db.houses[p.house].members.includes(m.owner) ? db.players[m.owner] : null;
      if (owner?.rooms[m.r]?.furniture[m.index]?.item !== 'foodBowl' || !owner.pets?.length) return;
      owner.fedAt = Date.now();
      if (owner.id !== p.id) send(sockets.get(owner.id), { t: 'reward', text: `🐾 ${p.name} fed your pets.` });
      break;
    }
    case 'note': { // leave a note on a housemate's desk; they see it now, or next time they log in
      const them = db.houses[p.house].members.includes(m.to) && m.to !== p.id ? db.players[m.to] : null;
      const text = cleanText(m.text, 140);
      if (!them || !text) return;
      them.notes = [...(them.notes ?? []), { from: p.name, text, at: Date.now() }].slice(-10);
      send(sockets.get(p.id), { t: 'reward', text: `📝 Left a note on ${them.name}'s desk.` });
      break;
    }
    case 'cheer': { // a little 👏 over a housemate who's studying, at most every few seconds
      const h = db.houses[p.house], them = h.members.includes(m.to) && m.to !== p.id ? db.players[m.to] : null;
      if (!them?.focus || Date.now() - (lastCheer.get(p.id) ?? 0) < 5000) return;
      lastCheer.set(p.id, Date.now());
      for (const id of h.members) send(sockets.get(id), { t: 'cheer', from: p.name, to: them.id });
      return; // nothing saved, nothing to rebroadcast
    }
    case 'invite': { // I'm studying and a housemate isn't: ask them along (they can join and end when I do)
      const h = db.houses[p.house], them = h.members.includes(m.to) && m.to !== p.id ? db.players[m.to] : null;
      if (!them || them.focus || !p.focus || p.focus.pausedAt) return;
      const key = `${p.id}>${them.id}`, now = Date.now();
      if (now - (lastInvite.get(key) ?? 0) < 30_000) return send(sockets.get(p.id), { t: 'info', text: `You just invited ${them.name}. Give them a moment!` });
      lastInvite.set(key, now);
      send(sockets.get(them.id), { t: 'invite', from: p.id, by: p.name, tag: p.focus.tag ?? 'Study' });
      send(sockets.get(p.id), { t: 'info', text: `Invited ${them.name} to study with you. 📚` });
      return; // nothing saved
    }
    case 'highfive': { // both of us idle: a high five the whole house sees
      const h = db.houses[p.house], them = h.members.includes(m.to) && m.to !== p.id ? db.players[m.to] : null;
      if (!them || p.focus || them.focus || Date.now() - (lastCheer.get(p.id) ?? 0) < 3000) return;
      lastCheer.set(p.id, Date.now());
      for (const id of h.members) send(sockets.get(id), { t: 'highfive', from: p.id, to: them.id, by: p.name });
      return;
    }
    case 'exam_add': { // an exam date to count down to; housemates see it on your desk calendar
      const subject = cleanText(m.subject, 24), at = Date.parse(`${m.date}T00:00:00`);
      if (!subject || !/^\d{4}-\d{2}-\d{2}$/.test(m.date ?? '') || !(at > Date.now() - 86_400_000) || at > Date.now() + 2 * 365 * 86_400_000) return;
      p.exams = [...(p.exams ?? []).filter((e) => Date.parse(`${e.date}T00:00:00`) > Date.now() - 86_400_000), { subject, date: m.date }]
        .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
      break;
    }
    case 'exam_del':
      p.exams = (p.exams ?? []).filter((_, i) => i !== m.index);
      break;
    // Calendars: one shared by the house, and a private one each. scope 'house' or anything else for your own.
    case 'event_add': {
      const h = db.houses[p.house], text = cleanText(m.text, 60);
      if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(m.date ?? '') || (m.time && !/^\d{2}:\d{2}$/.test(m.time))) return;
      const ev = { id: nextId++, date: m.date, time: m.time || undefined, text, by: p.name };
      const add = (list) => [...(list ?? []), ev].sort((a, b) => `${a.date}${a.time ?? ''}`.localeCompare(`${b.date}${b.time ?? ''}`)).slice(-MAX_EVENTS);
      if (m.scope === 'house') h.events = add(h.events);
      else p.events = add(p.events);
      break;
    }
    case 'event_del': {
      const h = db.houses[p.house];
      if (m.scope === 'house') h.events = (h.events ?? []).filter((e) => e.id !== m.id);
      else p.events = (p.events ?? []).filter((e) => e.id !== m.id);
      break;
    }
    case 'notes_read':
      p.notes = [];
      break;
    case 'light': { // switch a lamp in your own room on or off
      const f = room.furniture[m.index];
      if (!f) return;
      f.off = !f.off || undefined;
      break;
    }
    case 'curtains':
      room.curtains = !room.curtains;
      break;
    case 'water': { // anyone in the house can water anyone's plants
      const owner = db.houses[p.house].members.includes(m.owner) ? db.players[m.owner] : null;
      const f = owner?.rooms[m.r]?.furniture[m.index];
      if (!f || !isPlant(f.item)) return;
      f.wateredAt = Date.now();
      break;
    }
    case 'room':
      room.wallpaper = pick(WALLPAPERS, m.wallpaper, room.wallpaper);
      room.floor = pick(FLOORS, m.floor, room.floor);
      room.pattern = pick(WALL_PATTERNS, m.pattern, room.pattern ?? WALL_PATTERNS[0]);
      room.floorStyle = pick(FLOOR_STYLES, m.floorStyle, room.floorStyle ?? FLOOR_STYLES[0]);
      break;
    case 'turn': { // face the next way (side, back, other side); sideways it has to fit where it stands
      const f = room.furniture[m.index];
      if (!f) return;
      const rot = nextRot(f), rest = { ...room, furniture: room.furniture.filter((_, i) => i !== m.index) };
      if (!canPlace(rest, f.item, f.x, f.y, rot)) return send(sockets.get(p.id), { t: 'error', text: "There isn't room to turn it here. Move it somewhere with more space first." });
      f.rot = rot || undefined;
      break;
    }
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
      if (!f || !has(ITEMS, f.item) || !Number.isInteger(m.s) || m.s < 0 || m.s >= (ITEMS[f.item].looks?.length ?? 1)) return;
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
      if (!has(PETS, m.kind)) return;
      const pet = PETS[m.kind];
      p.pets ??= [];
      if (p.coins < pet.price || p.pets.length >= MAX_PETS) return;
      p.coins -= pet.price;
      p.pets.push({ kind: m.kind });
      break;
    }
    case 'buy_acc': {
      if (!has(PET_ACCS, m.acc)) return;
      const acc = PET_ACCS[m.acc];
      p.petAccs ??= [];
      if (p.petAccs.includes(m.acc) || p.coins < acc.price) return;
      p.coins -= acc.price;
      p.petAccs.push(m.acc);
      break;
    }
    // Say goodbye to a pet for good (the client asks twice first). Accessories you bought stay yours.
    case 'pet_release': {
      if (!Number.isInteger(m.slot) || !p.pets?.[m.slot]) return;
      const [gone] = p.pets.splice(m.slot, 1);
      send(sockets.get(p.id), { t: 'info', text: `Waved goodbye to ${gone.name ?? `your ${PETS[gone.kind]?.name.toLowerCase() ?? 'pet'}`}. 💛` });
      break;
    }
    // Dress up a pet: a free coat colour, and an accessory you own (or '' for none).
    case 'pet_style': {
      const pet = p.pets?.[m.slot];
      if (!pet || !has(PETS, pet.kind)) return;
      if (Number.isInteger(m.coat) && m.coat >= 0 && m.coat < PETS[pet.kind].coats.length) pet.coat = m.coat;
      if (m.acc === '' || (p.petAccs ?? []).includes(m.acc)) pet.acc = m.acc || undefined;
      if (typeof m.name === 'string') pet.name = cleanText(m.name, 16) || undefined;
      if (typeof m.away === 'boolean') pet.away = m.away || undefined; // kept, but not out in the room
      break;
    }
    case 'todo_add': {
      const h = db.houses[p.house];
      const text = cleanText(m.text, 120);
      h.todos ??= [];
      if (!text) return;
      if (h.todos.length >= 60) return send(sockets.get(p.id), { t: 'error', text: 'The house list is full (60). Clear some done ones first.' });
      h.todos.push({ id: nextId++, text, done: false, by: p.name, ...(m.all ? { all: true, ticks: [] } : {}) });
      break;
    }
    case 'todo_toggle': {
      const h = db.houses[p.house], t = h.todos?.find((x) => x.id === m.id);
      if (!t) return;
      if (!t.all) { t.done = !t.done; break; }
      t.ticks = t.ticks.includes(p.id) ? t.ticks.filter((id) => id !== p.id) : [...t.ticks, p.id];
      settleTodos(h);
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
      const img = chatImg(p, m.img);
      if (!to || !(text || img) || to.id === p.id || !db.houses[p.house]?.members.includes(to.id)) return;
      const now = Date.now();
      if (now - (lastDm.get(p.id) ?? 0) < 600) return send(sockets.get(p.id), { t: 'error', text: 'Slow down a little — that message was not sent.' });
      lastDm.set(p.id, now);
      const msg = { id: nextId++, from: p.id, by: p.name, text, at: now, ...(img && { img }) };
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
      const text = cleanText(m.text, 200), img = chatImg(p, m.img);
      const now = Date.now();
      if (!text && !img) return;
      if (now - (lastChat.get(p.id) ?? 0) < 600) return send(sockets.get(p.id), { t: 'error', text: 'Slow down a little — that message was not sent.' });
      lastChat.set(p.id, now);
      h.chat ??= [];
      h.chat.push({ id: nextId++, from: p.id, by: p.name, text, at: now, ...(img && { img }) });
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

// Always settles, always with an object: a truncated or oversized request, a client that hangs up
// mid-body, or a JSON payload that isn't an object must not leave the caller waiting or crashing.
function readJson(req) {
  return new Promise((resolve) => {
    let body = '', settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    const fail = () => { done({}); req.destroy(); };
    req.on('data', (chunk) => { body += chunk; if (body.length > 10_000) fail(); });
    req.on('end', () => {
      let v;
      try { v = JSON.parse(body); } catch { return done({}); }
      done(v && typeof v === 'object' && !Array.isArray(v) ? v : {});
    });
    req.on('error', () => done({}));
    req.on('close', () => done({}));
  });
}

function readBytes(req, max) {
  return new Promise((resolve, reject) => {
    const parts = [];
    let size = 0, settled = false;
    const fail = (err) => { if (!settled) { settled = true; reject(err); req.destroy(); } };
    req.on('data', (c) => { size += c.length; if (size > max) fail(new Error('too big')); else parts.push(c); });
    req.on('end', () => { if (!settled) { settled = true; resolve(Buffer.concat(parts)); } });
    req.on('error', fail);
    req.on('close', () => fail(new Error('aborted')));
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

// Pictures in chat. The client shrinks and re-encodes them as JPEG first (which also drops camera metadata such as
// location), uploads here, then sends the returned key with a chat message or DM. A link to a picture is only handed
// to someone who can see a message carrying it, and it expires within the hour.
const CHAT_IMG = /^chat\/[\w-]+\/\d+-[a-f0-9]+\.jpg$/;
const chatImg = (p, key) => (typeof key === 'string' && (p.chatImgs ?? []).some((x) => x.key === key) ? key : undefined); // only your own uploads
async function chatImage(req, res) {
  const reply = (status, data) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(data));
  if (!files) return reply(503, { error: 'Pictures need file storage, which is not set up on this server.' });
  const id = await store.playerForToken(String(req.headers.authorization ?? '').replace(/^Bearer /, ''));
  const p = id && db.players[id];
  if (!p) return reply(401, { error: 'Please log in again.' });
  if (req.method === 'GET') {
    const key = new URL(req.url, 'http://x').searchParams.get('key') ?? '';
    const visible = (db.houses[p.house]?.chat ?? []).some((c) => c.img === key) || Object.values(p.dm ?? {}).some((t) => t.some((c) => c.img === key));
    if (!CHAT_IMG.test(key) || !visible) return reply(404, { error: 'Picture not found.' });
    return reply(200, { url: await files.url(key, { expiresIn: 3600 }) });
  }
  if (req.method !== 'POST') return reply(405, { error: 'GET or POST' });
  const now = Date.now();
  p.chatImgs ??= [];
  if (p.chatImgs.filter((x) => now - x.at < 3_600_000).length >= 30) return reply(429, { error: "That's a lot of pictures. Try again in a little while." });
  let body;
  try { body = await readBytes(req, 1_500_000); } catch { return reply(413, { error: 'That picture is too big.' }); }
  if (!isJpeg(body)) return reply(400, { error: 'Expected a JPEG picture.' });
  const key = `chat/${p.id}/${now}-${crypto.randomBytes(4).toString('hex')}.jpg`;
  await files.upload(key, body, { contentType: 'image/jpeg' });
  p.chatImgs.push({ key, at: now });
  save();
  return reply(200, { key });
}
// Pictures nobody can scroll back to any more (the message fell out of the last 50, or was never sent) are deleted.
setInterval(() => {
  if (!files) return;
  const live = new Set(), now = Date.now();
  for (const h of Object.values(db.houses)) for (const c of h.chat ?? []) if (c.img) live.add(c.img);
  for (const p of Object.values(db.players)) for (const t of Object.values(p.dm ?? {})) for (const c of t) if (c.img) live.add(c.img);
  let changed = false;
  for (const p of Object.values(db.players)) {
    const gone = (p.chatImgs ?? []).filter((x) => !live.has(x.key) && now - x.at > 600_000);
    if (!gone.length) continue;
    p.chatImgs = p.chatImgs.filter((x) => !gone.includes(x));
    for (const x of gone) files.delete(x.key).catch(() => {});
    changed = true;
  }
  if (changed) save();
}, 600_000).unref();

async function api(req, res, route) {
  const reply = (status, data) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(data));
  if (route === 'snapshots') return snapshots(req, res);
  if (route === 'chatimg') return chatImage(req, res);
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
  let url;
  // A bad escape ("%") or an address that isn't a URL ("//") throws; answer 400 rather than take the server down.
  try { url = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return res.writeHead(400, { 'content-type': 'text/plain' }).end('Bad request'); }
  let file = path.join(DIST, url);
  let status = 200;
  // The game lives at '/'; any other address that isn't a real file gets the 404 page.
  if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
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
  // "//" is not a URL against a base, and a bad escape is not decodable: answer 400 instead of throwing
  // out of the request listener, which would end the process for everyone.
  let path;
  try { path = new URL(req.url, 'http://x').pathname; } catch { return res.writeHead(400, { 'content-type': 'text/plain' }).end('Bad request'); }
  const origin = req.headers.origin;
  if (origin && ALLOWED.includes(origin)) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('vary', 'origin');
    res.setHeader('access-control-allow-headers', 'content-type, authorization');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.writeHead(originOk(origin) ? 204 : 403).end();
  if (path === '/api/health') return res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
  const route = path.match(/^\/api\/(signup|login|logout|snapshots|chatimg)$/)?.[1];
  if (route) api(req, res, route).catch((err) => { console.error(err); if (!res.headersSent) res.writeHead(500).end(); });
  else serveStatic(req, res);
});
// Refuse game connections from pages on domains we don't serve.
const wss = new WebSocketServer({ server, path: '/ws', verifyClient: ({ origin }) => originOk(origin) });

wss.on('connection', (ws) => {
  let p = null;
  let checking = false;
  // A socket error (a broken frame, a client that vanished) is that connection's problem alone.
  ws.on('error', () => ws.close());
  // Nothing a client sends may take the process down: every message is parsed and handled inside
  // a guard, because a throw here would be an unhandled rejection and end the server for everyone.
  ws.on('message', async (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object' || Array.isArray(m)) return;
    try {
      await onMessage(ws, m);
    } catch (err) {
      console.error('message failed', err);
    }
  });
  const onMessage = async (ws, m) => {
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
      for (const r of p.rooms) r.furniture = r.furniture.filter((f) => has(ITEMS, f.item));
      for (const k of Object.keys(p.inventory)) if (!has(ITEMS, k)) delete p.inventory[k];
      if (!STYLES.includes(p.look.style)) p.look.style = STYLES[0]; // retired hairstyles fall back to the default
      p.pets ??= hadCat ? [{ kind: 'cat' }] : [];
      p.pets = p.pets.filter((pet) => has(PETS, pet.kind)); // pet kinds that were retired
      ensureHome(p);
      if (!db.houses[p.house]?.members.includes(p.id)) goHome(p); // new player, or their house is gone
      sockets.get(p.id)?.close();
      sockets.set(p.id, ws);
      save();
      broadcastHouse(p.house);
      return;
    }
    handle(p, m);
  };
  ws.on('close', () => {
    try {
      if (p && sockets.get(p.id) === ws) {
        sockets.delete(p.id);
        broadcastHouse(p.house);
      }
    } catch (err) {
      console.error('disconnect failed', err);
    }
  });
});

// Malformed HTTP (bad headers, a half-sent request line) ends that one connection, never the process.
server.on('clientError', (err, socket) => {
  if (socket.writable && !socket.destroyed) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  else socket.destroy();
});

server.listen(PORT, () => console.log(`Auralis server on http://localhost:${PORT}`));
