import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import webpush from 'web-push';
import { openStore, checkPassword, dmThread } from './store.js';
import { openPgStore } from './store-pg.js';
import { files, isPng, isJpeg } from './files.js';
import { focus as focusHandlers, chat as chatHandlers } from './handlers.js';
import { world as worldHandlers } from './world.js';
import { social as socialHandlers } from './social.js';
import {
  tail, pushTail, warm, dmView as dmViewInCache, groupsView as groupsViewInCache, mutedView, seenView, threadMuted, setMute, muting, serverThread,
  noteSeen, flushSeen, makeRefreshThread, loadPlayerThreads, noteThread as noteThreadInCache,
} from './chat-cache.js';
import {
  ITEMS, WALLPAPERS, FLOORS, SKINS, HAIRS, SHIRTS, STYLES, FACES, OUTFITS, BODIES, ACCESSORIES, isFocusLength, canPlace, placeSwaps, focusReward, quitReward, quitMinutes, focusEnd, streakDays, streakBonus,
  WALL_PATTERNS, FLOOR_STYLES, PETS, MAX_PETS, SIZES, bondLevel, NOTIFY, wantsNotify, EXPAND_COST, colorsFor, USES, PET_ACCS, MAX_ROOMS, ROOM_COST,
  GUEST_BOND_STEP, addGuestBond, guestBond, guestBondLevel, favouriteGuest,
  isPlant, TASK_COINS, TASK_REWARDS_PER_DAY, discounted, GIFT_COINS, GIFTS_PER_DAY, nextRot, canRotate, sellPrice,
  SCAR_ACCS, SCAR_COLOURS, LIGHTS, DRINKS, focusStart, caffeineOverlap, caffeineMinutes,
  CLAW_COST, CLAW_COOLDOWN_MS, clawPrize, readyKey, pieceReadyAt, setPieceReady,
  CRAFT, CRAFT_COOLDOWN_MS, craftColour, craftItem, craftedPrice, craftedProblem,
} from '../shared/game.js';
import { parseVideo } from '../shared/watch.js';
import { CHAT_KEY, DOC_TYPES, safeDocName, attachLabel, docName, usernameProblem, emailProblem, passwordProblem } from '../shared/game.js';
// The two scars are the only accessories kept to a wound palette: black, dark red, or one of the skin tones.
const SCAR_KEYS = new Set(SCAR_ACCS.map((a) => `acc:${a}`));

// Calculate next occurrence for recurring tasks
function nextOccurrence(from, repeat) {
  const d = new Date(from);
  if (repeat === 'daily') d.setDate(d.getDate() + 1);
  else if (repeat === 'weekly') d.setDate(d.getDate() + 7);
  else if (repeat === 'monthly') d.setMonth(d.getMonth() + 1);
  return d.getTime();
}

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIST = path.join(root, 'dist');
const PORT = Number(process.env.PORT) || 8787;
// DATABASE_URL (e.g. Neon Postgres) in production; otherwise a local SQLite file for development.
const legacy = path.join(root, 'data.json');
// LAZY_PLAYERS=1 boots with a stub per player and reads the full row on demand (see
// docs/superpowers/specs/2026-11-19-lazy-player-loading.md). Off by default until it has had a release.
const LAZY_PLAYERS = process.env.LAZY_PLAYERS === '1';
const store = process.env.DATABASE_URL
  ? await openPgStore(process.env.DATABASE_URL, legacy, { lazy: LAZY_PLAYERS })
  : openStore(process.env.DB_FILE || path.join(root, 'auralis.db'), legacy, { lazy: LAZY_PLAYERS });
console.log(`Storage: ${process.env.DATABASE_URL ? 'Postgres (DATABASE_URL)' : 'local SQLite'}; files: ${files ? 'Neon Object Storage' : 'off'}${LAZY_PLAYERS ? '; players loaded on demand' : ''}`);
const { db } = store;

// A lazy boot keeps a stub per player (id, name, house, home) and reads the full row when it is needed.
// Hydration replaces the stub in place, so every later `db.players[id]` finds the real row.
async function hydrate(idOrPlayer) {
  const id = typeof idOrPlayer === 'string' ? idOrPlayer : idOrPlayer?.id;
  const current = id ? db.players[id] : null;
  if (!current || !current.__stub) return current;
  try {
    const row = await Promise.resolve(store.player?.(id));
    if (row) { db.players[id] = row; return row; }
  } catch (err) { console.error('player load failed', id, err); }
  return current; // keep the stub: a thin state beats none, and the next read tries again
}
// Everyone whose data a player's screen renders: themselves, their house, and their friends.
async function hydrateFor(id) {
  const stub = db.players[id];
  await hydrate(id);
  await Promise.all((db.houses[db.players[id]?.house ?? stub?.house]?.members ?? []).map((mid) => hydrate(mid)));
  await Promise.all([...friends.values()].filter((f) => f.a === id || f.b === id)
    .map((f) => hydrate(f.a === id ? f.b : f.a)));
  return db.players[id];
}

// A lazy boot cannot migrate rows it has not read: the one-time moves (rooms, chat, sessions) need the
// full JSON. If any row still carries pre-split data, load everything for this boot; the next is lazy.
if (LAZY_PLAYERS) {
  const legacyRows = await Promise.resolve(store.legacyRows?.()).catch(() => 0);
  if (legacyRows) {
    await Promise.all(Object.keys(db.players).map(async (id) => {
      const row = await Promise.resolve(store.player?.(id)).catch(() => null);
      if (row) db.players[id] = row;
    }));
    console.log(`Players: ${legacyRows} rows still carry pre-split data; loaded them all for the one-time move`);
  }
}

// The chat cache (tails, thread list, mutes, and the state views) lives in chat-cache.js. index.js
// keeps only the glue: it builds `refreshThread` from the live world and passes `store` to the cache
// functions that read or write the archive.

// ---------- study sessions: an append-only log, rolled up after 90 days ----------
// The newest 3000 sessions used to ride on the player row, rewritten on every save. They are a table of
// their own now: the stats panel shows the last 90 days in detail plus one entry per earlier day and
// subject, and the leaderboard sums minutes from the log and the roll-up.
const SESSION_DAYS = 90;
const sessionCutoff = () => Date.now() - SESSION_DAYS * 86_400_000;
const sessionCache = new Map(); // playerId -> their sessions, oldest first (connected players only)
const mySessions = (p) => sessionCache.get(p.id) ?? [];

// What the panel needs on connect: the detail window, and the days already folded up.
async function loadSessions(p) {
  const [recent = [], days = []] = await Promise.all([store.sessionsFor?.(p.id, sessionCutoff()), store.sessionDaysFor?.(p.id)]);
  const all = [...days, ...recent].sort((a, b) => a.at - b.at);
  sessionCache.set(p.id, all);
  return all;
}

// A finished session is appended to the log. A failed append is queued and retried, because losing the
// row while `totalMinutes` still counts it makes the panel and the leaderboard disagree forever.
const pendingSessions = new Map(); // `${playerId}|${at}|${tag}` -> [playerId, session]
const queueSession = (playerId, session) => pendingSessions.set(`${playerId}|${session.at}|${session.tag}`, [playerId, session]);
function recordSession(p, session) {
  Promise.resolve(store.addSession?.(p.id, session))
    .then(() => boardCache.clear()) // the boards are stale from this moment
    .catch((err) => { queueSession(p.id, session); console.error('session not saved; will retry', err); });
  const list = sessionCache.get(p.id) ?? [];
  list.push(session);
  sessionCache.set(p.id, list);
}
setInterval(async () => {
  for (const [key, [playerId, session]] of [...pendingSessions]) {
    try { await store.addSession?.(playerId, session); pendingSessions.delete(key); boardCache.clear(); }
    catch { return; } // still unreachable: try again next round
  }
}, 60_000).unref();

// The leaderboard sums two tables across everyone who could appear on it, and the same board is asked
// for by everyone looking at it. A short memo, dropped whenever a session is appended, is enough.
const boardCache = new Map(); // scope|period|ids -> { at, minutes }
const BOARD_MS = 30_000;
async function boardMinutes(since, ids, key) {
  const hit = boardCache.get(key);
  if (hit && Date.now() - hit.at < BOARD_MS) return hit.minutes;
  let minutes = {};
  try { minutes = (await store.sessionTotals?.(since, ids)) ?? {}; } catch (err) { console.error('leaderboard totals failed', err); }
  boardCache.set(key, { at: Date.now(), minutes });
  if (boardCache.size > 200) boardCache.clear();
  return minutes;
}

// First boot after the `threads` table exists: build everyone's conversation list from the chat the
// player and house rows still carry. Later boots find it already seeded and do nothing.
const seededThreads = await store.seedThreads?.();
if (seededThreads) console.log(`Threads: seeded ${seededThreads} conversation rows`);
// Friends, by pair key "a|b" (sorted ids). Saved straight to the friends table on every change.
const friends = new Map((await store.friends()).map((f) => [`${f.a}|${f.b}`, f]));
const pairKey = (x, y) => [x, y].sort().join('|');
const isFriend = (x, y) => friends.get(pairKey(x, y))?.status === 'accepted';
// "Can I visit?" asks, as "host|guest". shortcut: in memory only, so a restart drops open asks; save them if that matters.
const visitAsks = new Set();
const sentSessions = new Map(); // playerId -> how many sessions their client has
// Players used to have one `room`; now they have `rooms`, the first being the original.
for (const p of Object.values(db.players)) if (!p.__stub && !p.rooms) { p.rooms = [p.room ?? newRoom()]; delete p.room; }
// Plants placed before watering existed start out freshly watered.
for (const p of Object.values(db.players)) { if (p.__stub) continue; for (const r of p.rooms) for (const f of r.furniture) if (isPlant(f.item)) f.wateredAt ??= Date.now(); }
// Already rotated old objects only face forward now (except for bed).
let cleanedRot = false;
for (const p of Object.values(db.players)) {
  if (p.__stub) continue; // not loaded: nothing here to migrate, and a save never writes it back
  for (const r of p.rooms ?? []) {
    for (const f of r.furniture ?? []) {
      if (!canRotate(f.item) && f.rot !== undefined) {
        delete f.rot;
        cleanedRot = true;
      }
    }
  }
}
if (cleanedRot) store.saveAll();
// Skin is only ever one of the presets now, so a custom skin tint saved by an older build is dropped from every account.
let cleanedSkin = false;
for (const p of Object.values(db.players)) {
  if (p.__stub) continue; // not loaded: nothing here to migrate, and a save never writes it back
  if (!p.look?.color || !('skin' in p.look.color)) continue;
  delete p.look.color.skin;
  if (!Object.keys(p.look.color).length) delete p.look.color;
  cleanedSkin = true;
}
if (cleanedSkin) store.saveAll();
// The single accessory an older save stored becomes a list of one, and its single tint key goes with it.
let cleanedAcc = false;
for (const p of Object.values(db.players)) {
  if (p.__stub) continue; // not loaded: nothing here to migrate, and a save never writes it back
  if (p.look?.color && 'acc' in p.look.color) {
    delete p.look.color.acc;
    if (!Object.keys(p.look.color).length) delete p.look.color;
    cleanedAcc = true;
  }
  // A scar saved before it had its own wound palette may hold any colour; it falls back to the default instead.
  for (const k of SCAR_KEYS) {
    const v = p.look?.color?.[k];
    if (v === undefined || SCAR_COLOURS.includes(v) || SKINS.includes(v)) continue;
    delete p.look.color[k];
    cleanedAcc = true;
  }
  if (!('acc' in (p.look ?? {}))) continue;
  p.look.accs = p.look.acc === 'none' ? [] : [p.look.acc];
  delete p.look.acc;
  cleanedAcc = true;
}
if (cleanedAcc) store.saveAll();
let saveTimer = null;
const save = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(store.saveAll, 500);
};

// Chat used to ride on the player and house rows. It lives only in `messages`/`threads` now, so the rows
// are cleaned once: mutes move onto `threads`, and the arrays go, which is what makes the next save stop
// writing them. Idempotent — a second boot finds nothing left to move.
for (const row of (await store.threadMutes?.()) ?? []) setMute({ id: row.playerId }, row.thread, row.until);
let movedMutes = 0;
for (const p of Object.values(db.players)) {
  if (p.__stub) continue; // not loaded: nothing here to migrate, and a save never writes it back
  for (const [thread, until] of Object.entries(p.mutedThreads ?? {})) {
    const key = serverThread(p, thread); // rows from before the split name a DM by the person
    if (muting(p, key) !== undefined) continue;
    setMute(p, key, until);
    Promise.resolve(store.setThreadMute?.(p.id, key, until)).catch((err) => console.error('mute move failed', err));
    movedMutes++;
  }
  delete p.mutedThreads;
}
if (movedMutes) console.log(`Chat: ${movedMutes} mutes moved onto the conversation list`);
store.clearMutedThreads?.(); // the old table is migrated; stop reading it back into rows

// Chat themes used to be written into the player row on every pick (and Postgres never read them back,
// so they did not survive a restart there). They are a table now: read once, kept in memory, and the
// copy on the row is dropped so saves stop writing it. Entries only on a row are moved across first.
const storedThemes = (await store.chatThemes?.()) ?? [];
const themeKeys = new Set(storedThemes.map((t) => `${t.playerId}|${t.thread}`));
for (const t of storedThemes) {
  const p = db.players[t.playerId];
  if (p) { p.chatThemes = p.chatThemes ?? {}; p.chatThemes[t.thread] = t.color; }
}
let movedThemes = 0;
for (const p of Object.values(db.players)) {
  if (p.__stub) continue; // not loaded: nothing here to migrate, and a save never writes it back
  for (const [thread, color] of Object.entries(p.chatThemes ?? {})) {
    if (themeKeys.has(`${p.id}|${thread}`)) continue;
    Promise.resolve(store.setChatTheme?.(p.id, thread, color)).catch((err) => console.error('theme move failed', err));
    movedThemes++;
  }
  delete p.chatThemes;
}
if (movedThemes) { save(); console.log(`Chat: ${movedThemes} themes moved into their own table`); }
let droppedChat = false;
for (const h of Object.values(db.houses)) if ('chat' in h) { delete h.chat; droppedChat = true; }
for (const p of Object.values(db.players)) {
  if (p.__stub) continue; // not loaded: nothing here to migrate, and a save never writes it back
  if ('dm' in p) { delete p.dm; droppedChat = true; }
  for (const g of Object.values(p.groups ?? {})) if ('msgs' in g) { delete g.msgs; droppedChat = true; }
}
if (droppedChat) { save(); console.log('Chat: conversations moved into the archive; the rows no longer carry them'); }

// Study sessions used to ride on the player row (the newest 3000 of them). They are a log in their own
// table now: move what is still on the rows across once, wait for it, then drop it so saves stop writing it.
const movingSessions = [];
let movedSessions = 0;
for (const p of Object.values(db.players)) {
  if (p.__stub) continue; // not loaded: nothing here to migrate, and a save never writes it back
  if (!Array.isArray(p.sessions)) continue;
  for (const s of p.sessions) {
    if (!Number.isFinite(s?.at) || !Number.isFinite(s?.minutes)) continue;
    movingSessions.push(Promise.resolve(store.addSession?.(p.id, s)).catch((err) => console.error('session move failed', err)));
    movedSessions++;
  }
  delete p.sessions;
}
if (movedSessions) {
  await Promise.all(movingSessions);
  save();
  console.log(`Sessions: ${movedSessions} moved into their own table`);
}
// Anything past the detail window folds into the day roll-up: once at boot, then every six hours.
const rollUp = () => Promise.resolve(store.rollUpSessions?.(sessionCutoff()))
  .then((n) => n && console.log(`Sessions: rolled up ${n} day rows`))
  .catch((err) => console.error('session roll-up failed', err));
await rollUp();
setInterval(rollUp, 6 * 3600_000).unref();
// The log is the source of truth, so a total that is behind it was a write that never landed: raise it
// (never lower it, which would erase history older than the log window).
const sessionTotals = (await Promise.resolve(store.sessionTotals?.(0)).catch(() => ({}))) ?? {};
let fixedTotals = 0;
for (const [id, minutes] of Object.entries(sessionTotals)) {
  const p = db.players[id];
  if (p && minutes > (p.totalMinutes ?? 0)) { p.totalMinutes = minutes; fixedTotals++; }
}
if (fixedTotals) { save(); console.log(`Sessions: reconciled ${fixedTotals} totals with the log`); }

// Chat history is kept two years, then pruned daily: the archive is a feature, not a promise to keep
// every byte forever. Pictures the deleted messages carried are swept up by the upload cleaner, which
// deletes any file no message refers to.
const CHAT_RETENTION_DAYS = 730;
async function pruneChat() {
  const before = Date.now() - CHAT_RETENTION_DAYS * 86_400_000;
  try {
    // The pictures go with their messages: after the delete nothing refers to them any more.
    if (files) {
      for (const key of (await Promise.resolve(store.messageImages?.(before))) ?? []) {
        await files.delete(key).catch((err) => console.error('pruned picture not deleted', key, err));
      }
    }
    const n = await Promise.resolve(store.pruneMessages?.(before));
    if (n) console.log(`Chat: pruned ${n} messages older than two years`);
  } catch (err) {
    console.error('chat prune failed', err);
  }
}
await pruneChat();
setInterval(pruneChat, 24 * 3600_000).unref();

// Read receipts are held for a moment and written once per thread (see chat-cache.js).
setInterval(() => flushSeen(store), 2000).unref();

// Pick up coins edited by hand in the accounts table. Only while someone's online, so an idle Neon database can still sleep.
setInterval(async () => {
  if (!sockets.size) return;
  const changed = await store.syncCoins();
  for (const code of new Set(changed.map((id) => db.players[id].house))) broadcastHouse(code);
}, 3000);

// Web Push: reminders reach people with Auralis closed. Off unless the VAPID keys are set (npx web-push generate-vapid-keys).
const PUSH_KEY = process.env.VAPID_PUBLIC_KEY ?? '', pushOn = !!(PUSH_KEY && process.env.VAPID_PRIVATE_KEY);
if (pushOn) webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:hello@auralis.app', PUSH_KEY, process.env.VAPID_PRIVATE_KEY);
// The server POSTs to a subscription's URL, so only the browsers' own push services are accepted.
const PUSH_HOSTS = ['.googleapis.com', '.mozilla.com', '.push.apple.com', '.notify.windows.com'];
function okPushSub(s) {
  try {
    const u = new URL(s?.endpoint);
    return u.protocol === 'https:' && PUSH_HOSTS.some((h) => u.hostname.endsWith(h)) && s.endpoint.length < 1000
      && typeof s.keys?.p256dh === 'string' && s.keys.p256dh.length < 200 && typeof s.keys?.auth === 'string' && s.keys.auth.length < 100;
  } catch { return false; }
}
function push(p, body, kind) {
  if (!pushOn || (kind && !wantsNotify(p.notify, kind))) return;
  for (const sub of p.pushSubs ?? []) webpush.sendNotification(sub, JSON.stringify(body), { TTL: 6 * 3600 }).catch((err) => {
    if (err.statusCode === 404 || err.statusCode === 410) { p.pushSubs = p.pushSubs.filter((x) => x.endpoint !== sub.endpoint); save(); } // unsubscribed or expired
  });
}

const sockets = new Map(); // playerId -> ws
const positions = new Map(); // playerId -> { x, y }
const lastChat = new Map(); // playerId -> ms, simple flood guard
// Coalesce full-house broadcasts: rapid minor updates to one house collapse into a single
// payload after the house goes quiet for BROADCAST_MS. Targeted messages (pos, cheer, pat,
// fetch, ...) still go out immediately, so nothing visible is delayed by more than a frame.
const BROADCAST_MS = 100;
const broadcastTimers = new Map(); // house code -> pending broadcast timeout
// house code -> the video the house is watching together: { src, by, byName, playing, pos, at }. Not saved: a restart ends it.
const watches = new Map();
// Private watch parties between two users (can be in different houses). key = pairKey(a,b) -> { src, by, byName, playing, pos, at }
const dmWatches = new Map();
// Group watch parties. key = group id -> { src, by, byName, playing, pos, at }
const groupWatches = new Map();
const houseDmWatch = (p) => {
  for (const [key, w] of dmWatches) if (key.split('|').includes(p.id)) return [key, w];
  return null;
};
const houseGroupWatch = (p) => {
  for (const gid of Object.keys(p.groups ?? {})) { const w = groupWatches.get(gid); if (w) return [gid, w]; }
  return null;
};
const dmWatchPayload = (key, w, meId) => {
  const [a, b] = key.split('|');
  const other = meId === a ? b : a;
  return { ...w, now: Date.now(), scope: 'dm', with: other, withName: db.players[other]?.name ?? null };
};
const groupWatchPayload = (gid, w) => ({ ...w, now: Date.now(), scope: 'group', g: gid, groupName: db.players[w.by]?.groups?.[gid]?.name ?? w.groupName ?? null });
const endDmWatch = (key, byId) => {
  const w = dmWatches.get(key);
  if (!w) return;
  dmWatches.delete(key);
  const [a, b] = key.split('|');
  const by = db.players[byId ?? w.by]?.name ?? 'Someone';
  const msg = { id: nextId++, from: byId ?? w.by, by, text: 'ended the watch party', at: Date.now() };
  if (db.players[a] && db.players[b]) {
    const thread = dmThread(a, b);
    store.addMessage(thread, msg);
    pushTail(thread, msg);
    noteThread(thread, msg, [a, b]);
  }
  for (const id of [a, b]) send(sockets.get(id), { t: 'watch_ended', scope: 'dm' });
  refresh(a, b);
  save();
};
const endGroupWatch = (gid, byId) => {
  const w = groupWatches.get(gid);
  if (!w) return;
  groupWatches.delete(gid);
  const by = db.players[byId ?? w.by]?.name ?? 'Someone';
  const msg = { id: nextId++, from: byId ?? w.by, by, text: 'ended the watch party', at: Date.now() };
  const g = db.players[w.by]?.groups?.[gid] ?? Object.values(db.players).map((q) => q.groups?.[gid]).find(Boolean);
  const members = g?.members ?? [];
  store.addMessage(`g:${gid}`, msg);
  noteThread(`g:${gid}`, msg, members);
  pushTail(`g:${gid}`, msg);
  for (const id of members) send(sockets.get(id), { t: 'watch_ended', scope: 'group' });
  refresh(...members);
  save();
};
const lastDm = new Map(); // playerId -> ms, same guard for private messages
  const lastCheer = new Map(); // playerId -> ms, so cheers and high fives can't be spammed
  const cheerCount = new Map(); // playerId -> number of cheers received in current focus session
  const lastInvite = new Map(); // 'from>to' -> ms: one study invite per pair every 30 s
  const MAX_EVENTS = 100; // per calendar; the earliest dates drop off first
  // A message id must never repeat: the archive ignores a duplicate and history is paged by
  // `id < before`, so a restart has to resume after the newest stored message, not at Date.now().
  let nextId = Math.max(Date.now(), (Number(await store.lastMessageId?.()) || 0) + 1);
  // A message someone is replying to, by id: history lives in the archive, so that is where the quote is read.
  const findMsg = async (thread, id) => {
    if (!Number.isFinite(id)) return null;
    try { return (await store.messageIn?.(thread, id)) ?? null; } catch (err) { console.error('reply lookup failed', err); return null; }
  };

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
// Who a to-do is for: everyone (an "everyone" one, or one made before assigning existed), or its assignees still in the house.
// Only they and whoever made it can see it.
const todoFor = (t, h) => (t.all || !t.to ? h.members : t.to.filter((id) => h.members.includes(id)));
const canSee = (t, h, id) => t.byId === id || todoFor(t, h).includes(id);

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

// How a pet answers being fussed over, read from its bond with you. The words change with the bond; the number
// itself never appears anywhere.
const PET_LINES = ['looks up at you, curious', 'is happy to see you', 'leans into your hand', 'trots over and does a little spin', 'flops against your legs, delighted'];
const petWord = (pet) => pet?.name ?? `the ${PETS[pet?.kind]?.name?.toLowerCase() ?? 'pet'}`;
const petLine = (pet, bond) => `🐾 ${petWord(pet)} ${PET_LINES[Math.min(PET_LINES.length - 1, guestBondLevel(bond))]}.`;

function publicPlayer(p, viewer = null) {
  for (const r of p.rooms ?? []) for (const f of r.furniture ?? []) if (!canRotate(f.item) && f.rot !== undefined) delete f.rot;
  // Bonds never ride along as numbers: a guest gets their own bond with a pet (enough to decide whether it comes
  // over), and everyone gets the guest the pet likes most among its housemates, so its walks agree on every screen
  // and a favourite who moved out does not leave the pet waiting for someone who will never come back.
  const pets = (p.pets ?? []).map((pet) => {
    const { visitorBonds, ...rest } = pet;
    const mine = viewer && viewer !== p.id ? guestBond(pet, viewer) : undefined;
    const fav = favouriteGuest(pet, (id) => id !== p.id && db.players[id]?.house === p.house);
    return { ...rest, ...(mine !== undefined && { myBond: mine }), ...(fav && { fav }) };
  });
  return {
    id: p.id, name: p.name, look: p.look, rooms: p.rooms, focus: p.focus, pets,
    totalMinutes: p.totalMinutes, online: sockets.has(p.id), pos: positions.get(p.id) ?? null, fedAt: p.fedAt ?? 0,
    exams: p.exams ?? [],
    caffeineSince: p.caffeineSince, caffeineUntil: p.caffeineUntil, tipsyUntil: p.tipsyUntil,
    presence: p.presence ?? null,
  };
}

// My friends and friend requests, as the client shows them.
// shortcut: scans every friendship per state message; index by player if there are ever many thousands.
function friendList(p) {
  const out = [];
  for (const f of friends.values()) {
    if (f.a !== p.id && f.b !== p.id) continue;
    const q = db.players[f.a === p.id ? f.b : f.a];
    if (!q) continue;
    out.push({ id: q.id, name: q.name, look: q.look, online: sockets.has(q.id), focus: !!q.focus,
      status: f.status === 'accepted' ? 'friend' : f.asked_by === p.id ? 'outgoing' : 'incoming',
      presence: q.presence ?? null,
      here: !!p.house && q.house === p.house, visit: visitAsks.has(`${p.id}|${q.id}`), asked: visitAsks.has(`${q.id}|${p.id}`) });
  }
  return out;
}
// Re-send state to each of these players' houses (friends and DMs reach across houses).
const refresh = (...ids) => { for (const code of new Set(ids.map((id) => db.players[id]?.house))) if (code) broadcastHouse(code); };
// Which houses should see a thread change? A house's own, or the houses of the people in a dm or group.
// Built here because it needs the live world; the cache itself knows nothing about houses.
const refreshThread = makeRefreshThread({ broadcastHouse, refresh, db });
// The bell: things that happened to a player, kept (newest 30) so whatever they missed while away is there later.
// The same thing from the same person within 10 minutes (petting, say) folds into one entry with a count.
function inbox(q, kind, from, text) {
  const now = Date.now(), last = q.inbox?.at(-1);
  if (last?.kind === kind && last.from === from?.id && last.text === text && now - last.at < 600_000) { last.at = now; last.n = (last.n ?? 1) + 1; }
  else q.inbox = [...(q.inbox ?? []), { kind, from: from?.id, by: from?.name, text, at: now }].slice(-30);
  send(sockets.get(q.id), { t: 'inbox', inbox: q.inbox });
  save();
}

// A client that stopped reading (a phone that lost signal) would otherwise keep every broadcast
// queued inside its socket - the usual way a WebSocket server runs out of memory. Past a couple of
// megabytes, drop the socket instead: it reconnects and gets a fresh state.
const MAX_BUFFERED = 2 * 1024 * 1024;
// The cache writers, bound to the live store. Thin wrappers so call sites read the same as before.
const noteThread = (thread, msg, memberIds) => noteThreadInCache(thread, msg, memberIds, store);
const loadPlayerThreadsIn = (p) => loadPlayerThreads(p, store);
const dmView = (p) => dmViewInCache(p, store, refreshThread);
const groupsView = (p) => groupsViewInCache(p, store, refreshThread);

function send(ws, msg) {
  if (ws?.readyState !== 1) return;
  if (ws.bufferedAmount > MAX_BUFFERED) { ws.terminate(); return; }
  ws.send(JSON.stringify(msg));
}

function broadcastHouseNow(code) {
  const h = db.houses[code];
  if (!h) return;
  const w = watches.get(code);
  const thread = `h:${code}`;
  warm(thread, store, refreshThread); // the first state may carry no lines; the load sends another one when it lands
  // now lets clients work out how far a playing video has got without trusting their own clocks.
  const house = {
    code, owner: h.owner ?? null, ownerName: db.players[h.owner]?.name ?? null,
    todos: h.todos ?? [], chat: tail(thread),
    events: h.events ?? [], announcements: h.announcements ?? [], watch: w ? { ...w, now: Date.now(), scope: 'house' } : null,
  };
  for (const id of h.members) {
    const ws = sockets.get(id);
    const p = db.players[id];
    if (!ws) continue; // nobody to send to: their state is not built
    // Personal to-dos ride along in `me`, which only this player receives.
    const dmw = houseDmWatch(p);
    const gw = houseGroupWatch(p);
    const privateWatch = gw ? groupWatchPayload(gw[0], gw[1]) : dmw ? dmWatchPayload(dmw[0], dmw[1], id) : null;
    send(ws, { t: 'state', house: { ...house, members: h.members.map((mid) => publicPlayer(db.players[mid], id)), todos: house.todos.filter((t) => canSee(t, h, id)) }, me: { id: p.id, home: p.home, ...houseLists(p), coins: p.coins, discount: !!p.discount, notes: p.notes ?? [], inbox: p.inbox ?? [], inboxSeen: p.inboxSeen ?? 0, tipsSeen: p.tipsSeen ?? [], events: p.events ?? [], inventory: p.inventory, crafted: p.crafted ?? [], ready: p.ready ?? {}, petAccs: p.petAccs ?? [], ...(sentSessions.get(id) !== mySessions(p).length && { sessions: mySessions(p) }), subjects: p.subjects ?? [], hiddenSubjects: p.hiddenSubjects ?? [], todos: p.todos ?? [], dm: dmView(p), groups: groupsView(p), friends: friendList(p), notify: p.notify ?? {}, mutedThreads: mutedView(p), threadSeen: seenView(p), chatThemes: p.chatThemes ?? {}, pushKey: pushOn ? PUSH_KEY : undefined, watch: privateWatch } });
    sentSessions.set(id, mySessions(p).length);
  }
}
// Throttled full-house broadcast: repeated updates to the same house within BROADCAST_MS
// collapse into a single payload, cutting WebSocket traffic on bursts of minor changes.
function broadcastHouse(code) {
  const h = db.houses[code];
  if (!h) return;
  const existing = broadcastTimers.get(code);
  if (existing) clearTimeout(existing);
  broadcastTimers.set(code, setTimeout(() => {
    broadcastTimers.delete(code);
    broadcastHouseNow(code);
  }, BROADCAST_MS));
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

// One message budget per connection: a burst of 40, then 8 a second. The per-intent cooldowns (chat,
// pats, cheers) are separate rules; this is the backstop against a script doing something legal at
// full speed. Over budget the message is dropped and the client is told, rather than disconnected.
const RATE_BURST = 40, RATE_PER_MS = 8 / 1000;
function takeTurn(ws) {
  const now = Date.now();
  ws.tokens = Math.min(RATE_BURST, (ws.tokens ?? RATE_BURST) + (now - (ws.lastTurn ?? now)) * RATE_PER_MS);
  ws.lastTurn = now;
  if (ws.tokens < 1) return false;
  ws.tokens -= 1;
  return true;
}

async function handle(p, m) {
  const ws = sockets.get(p.id);
  if (ws && !takeTurn(ws)) {
    if (Date.now() - (ws.rateTold ?? 0) > 1000) { ws.rateTold = Date.now(); send(ws, { t: 'error', text: 'Slow down a little — too many actions at once.' }); }
    return;
  }
  const room = roomOf(p, m);
  if (['place', 'move', 'pickup', 'room', 'flip', 'restyle', 'shape', 'expand', 'curtains', 'turn'].includes(m.t) && !room) return;
  // Furniture is addressed by position. Anything but a real integer fetches a built-in
  // (`furniture['toString']`) or nothing, so those messages only run for real indices.
  if (['move', 'pickup', 'turn', 'flip', 'restyle', 'shape', 'light', 'paint', 'water', 'brew', 'claw', 'craft'].includes(m.t) && !Number.isInteger(m.index)) return;
  if (m.t === 'water' && !Number.isInteger(m.r)) return;
  // Focus and chat live in handlers.js. Each domain is a plain object of methods with the same cases
  // the switch had, called with one context object; the switch keeps its guards, its default and its
  // save()/broadcastHouse() tail, so a domain move is byte-for-byte.
    // Every intent is handled by a domain module: focus and chat in handlers.js, the room and the
  // house in world.js and social.js. Each method returns true where its case had `break` — the
  // dispatcher then saves and rebroadcasts the house — and skips both where it returned early.
  const domain = focusHandlers[m.t] ? focusHandlers : chatHandlers[m.t] ? chatHandlers
    : worldHandlers[m.t] ? worldHandlers : socialHandlers[m.t] ? socialHandlers : null;
  if (!domain) return;
  const ctx = {
    ACCESSORIES, BODIES, CLAW_COOLDOWN_MS, CLAW_COST,
    CRAFT, CRAFT_COOLDOWN_MS, DRINKS, EXPAND_COST,
    FACES, FLOORS, FLOOR_STYLES, GIFTS_PER_DAY,
    GIFT_COINS, GUEST_BOND_STEP, HAIRS, ITEMS,
    LIGHTS, MAX_EVENTS, MAX_PETS, MAX_ROOMS,
    NOTIFY, OUTFITS, PETS, PET_ACCS,
    ROOM_COST, SCAR_COLOURS, SCAR_KEYS, SHIRTS,
    SIZES, SKINS, STYLES, USES,
    WALLPAPERS, WALL_PATTERNS, addGuestBond, attachLabel,
    boardMinutes, bondLevel, broadcastHouse, buddiesOf,
    caffeineMinutes, caffeineOverlap, canPlace, canRotate,
    canSee, chatImg, cheerCount, clawPrize,
    cleanText, colorsFor, craftColour, craftItem,
    craftedPrice, db, discounted, dmThread,
    dmWatches, endDmWatch, ensureHome, findMsg,
    focusEnd, focusReward, focusStart, friendList,
    friends, goHome, groupWatches, handle,
    has, houseDmWatch, houseGroupWatch, inbox,
    isFocusLength, isFriend, isPlant, lastChat,
    lastCheer, lastDm, lastInvite, leaveHouse,
    m, mySessions, newId: () => nextId++, newRoom,
    nextId, nextOccurrence, nextRot, noteSeen,
    noteThread, okPushSub, p, pairKey,
    parseVideo, petLine, petWord, pick,
    pieceReadyAt, placeSwaps, positions, push,
    pushTail, quitMinutes, quitReward, readyKey,
    recordSession, refresh, remember, room,
    save, sellPrice, send, serverThread,
    setMute, setPieceReady, setTz, settleTodos,
    sockets, store, streakBonus, streakDays,
    threadMuted, todoFor, usernameProblem, visitAsks,
    wantsNotify, watches,
  };
  if (await domain[m.t](ctx)) { save(); broadcastHouse(p.house); }
  
  
}

function newPlayer(id, name) {
  return {
    id, name: cleanName(name), coins: 30, totalMinutes: 0, focus: null,
    look: { skin: SKINS[0], hair: HAIRS[0], shirt: SHIRTS[0], style: STYLES[0], face: FACES[0], outfit: OUTFITS[0], size: SIZES[1] },
    inventory: {}, pets: [],
    rooms: [{ wallpaper: WALLPAPERS[0], floor: FLOORS[0], furniture: [{ item: 'chair', x: 4, y: 3 }, { item: 'desk', x: 4, y: 4 }] }],
  };
}

// ---------- accounts (HTTP JSON API) ----------
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
const chatImg = (p, key) => (typeof key === 'string' && (p.chatImgs ?? []).some((x) => x.key === key) ? key : undefined); // only your own uploads
// The bytes must match the extension: PDF header, zip (docx/pptx/xlsx), old Office (doc/ppt/xls), or plain UTF-8 text.
function looksLike(name, buf) {
  const ext = name.split('.').pop(), head = (sig) => sig.every((b, i) => buf[i] === b);
  if (ext === 'pdf') return head([0x25, 0x50, 0x44, 0x46]);
  if (['docx', 'pptx', 'xlsx'].includes(ext)) return head([0x50, 0x4b, 0x03, 0x04]);
  if (['doc', 'ppt', 'xls'].includes(ext)) return head([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  try { new TextDecoder('utf-8', { fatal: true }).decode(buf); return !buf.includes(0); } catch { return false; }
}
async function chatImage(req, res) {
  const reply = (status, data) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(data));
  if (!files) return reply(503, { error: 'Pictures need file storage, which is not set up on this server.' });
  const id = await store.playerForToken(String(req.headers.authorization ?? '').replace(/^Bearer /, ''));
  const p = id && db.players[id];
  if (!p) return reply(401, { error: 'Please log in again.' });
  if (req.method === 'GET') {
    const q = new URL(req.url, 'http://x').searchParams, key = q.get('key') ?? '';
    // Visible if it was sent in any conversation I can read the history of, however long ago.
    const mine = (th) => th === `h:${p.house}` || (th.startsWith('d:') && th.slice(2).split('|').includes(p.id)) || (th.startsWith('g:') && !!p.groups?.[th.slice(2)]);
    if (!CHAT_KEY.test(key) || !(await store.threadsWithImg(key)).some(mine)) return reply(404, { error: 'File not found.' });
    // ?download=1: a link that saves the file under its name instead of opening it.
    const name = docName(key) ?? 'auralis-photo.jpg';
    const disposition = q.has('download') ? { responseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(name)}` } : {};
    return reply(200, { url: await files.url(key, { expiresIn: 3600, ...disposition }) });
  }
  if (req.method !== 'POST') return reply(405, { error: 'GET or POST' });
  const now = Date.now();
  p.chatImgs ??= [];
  if (p.chatImgs.filter((x) => now - x.at < 3_600_000).length >= 30) return reply(429, { error: "That's a lot of files. Try again in a little while." });
  // A document comes with its name in x-file-name; without one it's a picture.
  const rawName = req.headers['x-file-name'] ? decodeURIComponent(String(req.headers['x-file-name'])) : null;
  const name = rawName && safeDocName(rawName);
  if (rawName && !name) return reply(400, { error: 'You can send PDFs, Word, PowerPoint, Excel, CSV and text files.' });
  let body;
  try { body = await readBytes(req, name ? 10_000_000 : 1_500_000); } catch { return reply(413, { error: name ? 'That file is too big (10 MB max).' : 'That picture is too big.' }); }
  if (name ? !looksLike(name, body) : !isJpeg(body)) return reply(400, { error: name ? "That file doesn't look like what its name says." : 'Expected a JPEG picture.' });
  const key = `chat/${p.id}/${now}-${crypto.randomBytes(4).toString('hex')}${name ? `/${name}` : '.jpg'}`;
  await files.upload(key, body, { contentType: name ? DOC_TYPES[name.split('.').pop()] : 'image/jpeg' });
  p.chatImgs.push({ key, at: now });
  save();
  return reply(200, { key });
}
// Reminders: when a to-do's time comes, everyone it's for who hasn't ticked it yet and is online gets a nudge.
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const h of Object.values(db.houses)) for (const t of h.todos ?? []) {
    if (!t.at || t.reminded || t.done || t.at > now) continue;
    t.reminded = true;
    changed = true;
    for (const id of todoFor(t, h)) {
      if (t.ticks?.includes(id)) continue;
      const q = db.players[id];
      inbox(q, 'remind', null, t.text);
      if (sockets.has(id)) { send(sockets.get(id), { t: 'remind', text: t.text, by: t.by }); continue; }
      // Away: a push notification now, and the reminder waits for them in the app next time they log in.
      q.missed = [...(q.missed ?? []), { text: t.text, by: t.by }].slice(-10);
      push(q, { title: '⏰ Auralis reminder', body: t.text, tag: `todo-${t.id}` }, 'todo');
    }
  }
  if (changed) save();
}, 30_000).unref();

// Uploads are kept as long as a message carries them. An hour after upload (the window for sending it, and for the
// upload rate limit) each one is settled: sent → kept, and dropped from my pending list; never sent → deleted.
setInterval(async () => {
  if (!files) return;
  const now = Date.now();
  let changed = false;
  for (const p of Object.values(db.players)) {
    if (p.__stub) continue;
  if (p.__stub) continue; // not loaded: nothing here to migrate, and a save never writes it back
    for (const x of (p.chatImgs ?? []).filter((x) => now - x.at > 3_600_000)) {
      try {
        if (!(await store.threadsWithImg(x.key)).length) await files.delete(x.key);
        p.chatImgs = p.chatImgs.filter((y) => y !== x);
        changed = true;
      } catch (err) { console.error('upload cleanup failed', x.key, err); } // try again next round
    }
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
  if (route === 'delete') {
    // The password is the proof: a stolen token can log out, but only the person can erase the account.
    const acct = await store.findAccount(String(body.username ?? '').trim());
    if (!acct || !checkPassword(String(body.password ?? ''), acct.pass)) return reply(401, { error: 'Wrong username or password.' });
    const id = acct.player_id;
    await store.deleteAccount(id);
    const gone = db.players[id];
    if (gone) {
      for (const h of Object.values(db.houses)) h.members = h.members.filter((x) => x !== id);
      for (const [code, h] of Object.entries(db.houses)) if (h.owner === id) delete db.houses[code];
      sockets.get(id)?.close(1000, 'account deleted');
      sockets.delete(id);
      sessionCache.delete(id);
      delete db.players[id];
      save();
    }
    return reply(200, { ok: true });
  }
  if (tooMany(ip, 20)) return reply(429, { error: 'Too many tries. Wait a few minutes and try again.' });
  const username = String(body.username ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  if (route === 'signup') {
    const problem = usernameProblem(username) ?? emailProblem(email) ?? passwordProblem(password);
    if (problem) return reply(400, { error: problem });
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
    if (!username) return reply(400, { error: 'Enter your username or email.' });
    if (!password) return reply(400, { error: 'Enter your password.' });
    // Which of the two was wrong stays unsaid, so nobody can use this to find out who has an account.
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

// Render's free plan sleeps after 15 minutes without a visitor, and waking takes about a minute. A request to our
// own public address every 10 minutes counts as a visitor. Uses ~744 of the 750 free hours a month: one service only.
if (process.env.RENDER_EXTERNAL_URL) setInterval(() => fetch(`${process.env.RENDER_EXTERNAL_URL}/api/health`).catch(() => {}), 10 * 60_000).unref();

// Readiness, not liveness: a process whose database is unreachable is not ready to take traffic, and
// answering `ok` from a constant is how a host keeps sending requests to a server that cannot serve them.
const HEALTH_TIMEOUT_MS = 2000;
async function health(res) {
  let timer;
  const ok = await Promise.race([
    Promise.resolve().then(() => store.ping?.()).catch(() => false),
    new Promise((resolve) => { timer = setTimeout(() => resolve(false), HEALTH_TIMEOUT_MS); }),
  ]).finally(() => clearTimeout(timer));
  res.writeHead(ok ? 200 : 503, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    .end(JSON.stringify(ok ? { ok: true, storage: 'ok' } : { ok: false, storage: 'down' }));
}

const server = http.createServer((req, res) => {
  // "//" is not a URL against a base, and a bad escape is not decodable: answer 400 instead of throwing
  // out of the request listener, which would end the process for everyone.
  let path;
  try { path = new URL(req.url, 'http://x').pathname; } catch { return res.writeHead(400, { 'content-type': 'text/plain' }).end('Bad request'); }
  const origin = req.headers.origin;
  if (origin && ALLOWED.includes(origin)) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('vary', 'origin');
    res.setHeader('access-control-allow-headers', 'content-type, authorization, x-file-name'); // x-file-name: document uploads
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.writeHead(originOk(origin) ? 204 : 403).end();
  if (path === '/api/health') return health(res);
  const route = path.match(/^\/api\/(signup|login|logout|delete|snapshots|chatimg)$/)?.[1];
  if (route) api(req, res, route).catch((err) => { console.error(err); if (!res.headersSent) res.writeHead(500).end(); });
  else serveStatic(req, res);
});
// Refuse game connections from pages on domains we don't serve.
// Game messages are a few hundred bytes (pictures and files go over HTTP); anything over 64 KB closes the socket.
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024, verifyClient: ({ origin }) => originOk(origin) });

wss.on('connection', (ws) => {
  let p = null;
  let checking = false;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
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
      // A known database outage is answered at once, so a reconnect loop does not hold the pool waiting.
      if (store.unavailable?.()) { ws.close(1011, 'storage unavailable'); return; }
      checking = true;
      let id = null;
      try {
        id = await store.playerForToken(m.token);
      } catch (err) {
        // The token was never checked: storage is unreachable, not the login wrong. Closing with 1011
        // (instead of `auth ok:false`) makes the client keep its token and retry, rather than sign out.
        console.error('sign-in lookup failed', err);
        ws.close(1011, 'storage unavailable');
        return;
      } finally {
        checking = false;
      }
      if (!id || !db.players[id]) { send(ws, { t: 'auth', ok: false }); ws.close(); return; }
      // The full row, their house's and their friends': a lazy boot kept only a stub for each. If the
      // read fails, storage is unreachable — same answer as a failed token lookup, so they retry.
      p = await hydrateFor(id);
      if (!p || p.__stub) { ws.close(1011, 'storage unavailable'); return; }
      // Old saves: drop furniture types that no longer exist; the old cat decoration becomes a real pet.
      const hadCat = p.rooms.some((r) => r.furniture.some((f) => f.item === 'cat')) || p.inventory.cat > 0;
      for (const r of p.rooms) {
        r.furniture = r.furniture.filter((f) => has(ITEMS, f.item));
        for (const f of r.furniture) if (!canRotate(f.item) && f.rot !== undefined) delete f.rot;
      }
      for (const k of Object.keys(p.inventory)) if (!has(ITEMS, k)) delete p.inventory[k];
      // Handmade pieces: drop anything that is not a real catalog item in a real colour, rather than trust the save.
      if (!Array.isArray(p.crafted)) delete p.crafted;
      else {
        const kept = p.crafted.filter((e) => !craftedProblem(e));
        if (kept.length) p.crafted = kept; else delete p.crafted;
      }
      if (!STYLES.includes(p.look.style)) p.look.style = STYLES[0]; // retired hairstyles fall back to the default
      p.pets ??= hadCat ? [{ kind: 'cat' }] : [];
      p.pets = p.pets.filter((pet) => has(PETS, pet.kind)); // pet kinds that were retired
      ensureHome(p);
      if (!db.houses[p.house]?.members.includes(p.id)) goHome(p); // new player, or their house is gone
      // Their conversations come from the archive, not from the row: two queries for the whole list.
      try { await loadPlayerThreadsIn(p); } catch (err) { console.error('chat load failed', err); }
      // Their study history too: the detail window and the days already rolled up.
      try { await loadSessions(p); } catch (err) { console.error('sessions load failed', err); }
      sockets.get(p.id)?.close();
      sockets.set(p.id, ws);
      sentSessions.delete(p.id); // a new connection gets the full history once
      save();
      broadcastHouse(p.house);
      for (const r of p.missed ?? []) send(ws, { t: 'remind', ...r, missed: true }); // reminders that came due while away
      delete p.missed;
      return;
    }
    void handle(p, m).catch((err) => console.error('message handler failed', err));
  };
  ws.on('close', () => {
    try {
      if (p && sockets.get(p.id) === ws) {
        sockets.delete(p.id);
        sessionCache.delete(p.id);
        broadcastHouse(p.house);
      }
    } catch (err) {
      console.error('disconnect failed', err);
    }
  });
});

// A half-open connection (a phone that changed network) looks open to us forever, so its send buffer
// and its place in the house would pile up. A ping every 30 s finds those sockets and ends them.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30_000);
heartbeat.unref();
wss.on('close', () => clearInterval(heartbeat));

// Malformed HTTP (bad headers, a half-sent request line) ends that one connection, never the process.
server.on('clientError', (err, socket) => {
  if (socket.writable && !socket.destroyed) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  else socket.destroy();
});

server.listen(PORT, () => console.log(`Auralis server on http://localhost:${PORT}`));

// A restart (a deploy, a Render cycle) stops taking connections, closes the sockets, writes the save
// that is still on its timer and closes the pool, then exits. Ten seconds is the cap: a host that
// waits longer than that kills the process anyway, and a hung close should not hold the deploy.
let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal}: shutting down`);
  const done = (async () => {
    server.close();
    for (const ws of wss.clients) ws.close(1001, 'restarting');
    wss.close();
    await flushSeen(store).catch(() => {});
    await Promise.resolve(store.saveAll?.()).catch(() => {});
    await Promise.resolve(store.idle?.()).catch(() => {});
    await Promise.resolve(store.close?.()).catch(() => {});
  })();
  await Promise.race([done, new Promise((resolve) => setTimeout(resolve, 10_000))]);
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
