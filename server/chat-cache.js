// The chat cache: the only copy of a conversation the server keeps in memory.
//
// A player or house row carries no conversation. What a client is shown is read from `messages` when
// the player connects (or the first time a thread is needed) and kept here, so a broadcast never waits
// for the database and memory stays proportional to who is online, not to how much was ever said.
//
// The seam is narrow by design: this module owns the tails, the thread list and the mute map, and
// exports read views plus the few writers index.js calls. It knows nothing about sockets, houses or
// the world; `refreshThread` is injected so a newly loaded thread can re-send state without importing
// the game server. Everything else here is a pure function of the cache and the store.

const MAX_TAIL = 50;           // lines of one thread a client is given
const MAX_TAIL_THREADS = 400;  // threads held in memory; the oldest loaded is dropped first

const tails = new Map();       // thread -> its newest MAX_TAIL messages, oldest first
const warming = new Set();     // threads being read from the archive right now
const threadIndex = new Map(); // playerId -> Map<thread, threads row>: their conversation list
const mutes = new Map();       // playerId -> Map<thread, until> (0 is forever)

// The client names a conversation the way it shows it — the house as `h:<code>`, a group as `g:<id>`, a
// person by their id — while the archive and `threads` name a private one `d:<a>|<b>`. These two turn
// either form into the other, so a mute or a read receipt arrives in one and is stored in the other.
const serverThread = (p, thread) => (typeof thread === 'string' && (thread.startsWith('h:') || thread.startsWith('g:'))
  ? thread
  : `d:${[p.id, String(thread)].sort().join('|')}`);
const clientThread = (p, thread) => (thread.startsWith('d:') ? thread.slice(2).split('|').find((id) => id !== p.id) ?? thread : thread);

const tail = (thread) => tails.get(thread) ?? [];

const muting = (p, thread) => mutes.get(p.id)?.get(thread);
// This player has muted the thread's notifications: 0 is forever, a timestamp is when the pause ends.
const threadMuted = (p, thread) => { const until = muting(p, thread); return until === 0 || (typeof until === 'number' && Date.now() < until); };

function setMute(p, thread, until) {
  if (until == null) { mutes.get(p.id)?.delete(thread); return; }
  if (!mutes.has(p.id)) mutes.set(p.id, new Map());
  mutes.get(p.id).set(thread, until);
}

function rememberTail(thread, msgs) {
  tails.set(thread, msgs);
  while (tails.size > MAX_TAIL_THREADS) tails.delete(tails.keys().next().value);
}

// A thread nothing has loaded yet is read in the background; whoever is watching it is re-sent state
// when it lands. `refreshThread` is supplied by index.js so this module stays free of game-server deps.
function warm(thread, store, refreshThread) {
  if (!thread || tails.has(thread) || warming.has(thread)) return;
  warming.add(thread);
  Promise.resolve(store.tails?.([thread], MAX_TAIL))
    .then((found) => rememberTail(thread, found?.[thread] ?? []))
    .catch((err) => { rememberTail(thread, []); console.error('chat load failed', thread, err); })
    .finally(() => { warming.delete(thread); refreshThread(thread); });
}

// A line that was just accepted, appended to the lines on screen (the archive has it either way).
function pushTail(thread, msg) {
  const msgs = tails.get(thread);
  if (!msgs) return;
  msgs.push(msg);
  if (msgs.length > MAX_TAIL) msgs.splice(0, msgs.length - MAX_TAIL);
}

// me.dm: the private threads in this player's list, each with the lines above.
function dmView(p, store, refreshThread) {
  const out = {};
  for (const thread of threadIndex.get(p.id)?.keys() ?? []) {
    if (!thread.startsWith('d:')) continue;
    const [a, b] = thread.slice(2).split('|');
    if (p.id !== a && p.id !== b) continue;
    warm(thread, store, refreshThread);
    out[a === p.id ? b : a] = tail(thread);
  }
  return out;
}

// me.groups: the name and members from the row, the lines from the archive.
function groupsView(p, store, refreshThread) {
  const out = {};
  for (const [gid, g] of Object.entries(p.groups ?? {})) { warm(`g:${gid}`, store, refreshThread); out[gid] = { ...g, msgs: tail(`g:${gid}`) }; }
  return out;
}

const mutedView = (p) => Object.fromEntries([...(mutes.get(p.id) ?? [])].map(([thread, until]) => [clientThread(p, thread), until]));

// Read receipts arrive one line at a time; the newest per thread waits here and is written once, so
// scrolling a conversation costs one UPDATE rather than one per message.
const pendingSeen = new Map(); // `playerId|thread` -> newest id read, not yet written
function noteSeen(playerId, thread, id) {
  const key = `${playerId}|${thread}`;
  if ((pendingSeen.get(key) ?? 0) >= id) return;
  pendingSeen.set(key, id);
  const row = threadIndex.get(playerId)?.get(thread);
  if (row && id > (row.seen ?? 0)) row.seen = id;
}

// Writes everything waiting. A failed write goes back on the queue for the next flush.
function flushSeen(store) {
  if (!pendingSeen.size) return Promise.resolve(0);
  const batch = [...pendingSeen];
  pendingSeen.clear();
  return Promise.all(batch.map(([key, id]) => {
    const at = key.indexOf('|'), playerId = key.slice(0, at), thread = key.slice(at + 1);
    return Promise.resolve(store.setThreadSeen?.(playerId, thread, id)).catch((err) => {
      console.error('read marker failed', err);
      if ((pendingSeen.get(key) ?? 0) < id) pendingSeen.set(key, id);
    });
  })).then(() => batch.length);
}

// me.threadSeen: how far this member has read in each conversation, from the rows loaded on connect.
function seenView(p) {
  const out = {};
  for (const [thread, row] of threadIndex.get(p.id) ?? []) if (row.seen) out[clientThread(p, thread)] = row.seen;
  return out;
}

// Which houses should see a thread change? A house's own, or the houses of the people in a dm or group.
// Supplied by index.js so this module does not import the world.
function makeRefreshThread({ broadcastHouse, refresh, db }) {
  return function refreshThread(thread) {
    if (thread.startsWith('h:')) return broadcastHouse(thread.slice(2));
    if (thread.startsWith('d:')) return refresh(...thread.slice(2).split('|'));
    const gid = thread.slice(2);
    refresh(...Object.values(db.players).filter((q) => q.groups?.[gid]).map((q) => q.id));
  };
}

// What a player's client needs when it connects: their conversation list, and the lines of each thread.
async function loadPlayerThreads(p, store) {
  const rows = (await store.threadsFor?.(p.id)) ?? [];
  const index = new Map(rows.map((r) => [r.thread, r]));
  threadIndex.set(p.id, index);
  // A receipt still waiting for the next flush (up to a couple of seconds old) is not in the rows yet:
  // keep it, or reconnecting straight after reading brings the unread badge back.
  const mine = `${p.id}|`;
  for (const [key, id] of pendingSeen) {
    if (!key.startsWith(mine)) continue;
    const row = index.get(key.slice(mine.length));
    if (row && id > (row.seen ?? 0)) row.seen = id;
  }
  const threads = [...new Set([...(p.house ? [`h:${p.house}`] : []), ...rows.map((r) => r.thread)])];
  const found = (await store.tails?.(threads, MAX_TAIL)) ?? {};
  for (const thread of threads) if (!tails.has(thread)) rememberTail(thread, found[thread] ?? []);
  return rows;
}

// Every message also moves its conversation to the top of each member's list (the `threads` table).
// Fire and forget: a lost list update is repaired by the next message in that thread.
function noteThread(thread, msg, memberIds, store) {
  const rows = memberIds.filter(Boolean).map((playerId) => ({
    playerId, thread, lastId: msg.id, lastAt: msg.at ?? Date.now(), lastBy: msg.by ?? '', lastBody: msg.text ?? '', lastImg: msg.img ?? null,
  }));
  if (!rows.length) return;
  // The list a player's `dm` view is built from has to learn about a conversation that starts while
  // they are connected; only the rows loaded on connect come from the archive.
  for (const row of rows) {
    const index = threadIndex.get(row.playerId);
    if (!index) continue;
    const known = index.get(thread);
    index.set(thread, { ...row, seen: known?.seen ?? 0, mutedUntil: known?.mutedUntil ?? null });
  }
  Promise.resolve(store.touchThreads?.(rows)).catch((err) => console.error('thread list failed', err));
}

export {
  MAX_TAIL, MAX_TAIL_THREADS, tails, warming, threadIndex, mutes,
  tail, muting, threadMuted, setMute, rememberTail, warm, pushTail,
  dmView, groupsView, mutedView, seenView, noteSeen, flushSeen, serverThread, clientThread,
  makeRefreshThread, loadPlayerThreads, noteThread,
};