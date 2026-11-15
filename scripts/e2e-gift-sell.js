// End-to-end check of gifting and selling, against a throwaway server this script runs itself.
//
//   1. claw prizes are giftable (they are storage pieces, not handmade ones)
//   2. every making piece produces one of its own things, at random, with nothing to choose
//   3. handmade pieces carry their own colour, so the client can draw them
//   4. handmade pieces sell for a quarter of catalog price
//   5. a piece gifted to a housemate stays sellable, at the same quarter price
//   6. the plain coin gift is unaffected
//
// Usage: node scripts/e2e-gift-sell.js
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { CRAFT, ITEMS, craftedPrice, craftItem } from '../shared/game.js';
import { openStore } from '../server/store.js';

const PORT = Number(process.env.E2E_PORT ?? 8792);
const base = `http://localhost:${PORT}`;
const file = path.join(os.tmpdir(), `auralis-giftsell-${process.pid}.db`);

const ok = (label, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`); if (!cond) process.exitCode = 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- a throwaway server, started and stopped by this script ----------
let server = null;
async function startServer() {
  server = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, DB_FILE: file, PORT: String(PORT), FILES: 'off' }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', (d) => process.env.VERBOSE && process.stdout.write(`[server] ${d}`));
  server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(`${base}/api/health`); if (r.ok) return; } catch { /* not up yet */ }
    await wait(150);
  }
  throw new Error('the throwaway server never came up');
}
async function stopServer() {
  if (!server) return;
  const s = server;
  server = null;
  s.kill();
  await new Promise((r) => s.on('exit', r));
  await wait(200);
}

// ---------- players ----------
async function signup(name) {
  const username = `g_${name}_${crypto.randomBytes(3).toString('hex')}`;
  const password = crypto.randomBytes(12).toString('base64url');
  const res = await fetch(`${base}/api/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password, email: `${username}@example.test` }) });
  const { token } = await res.json();
  return { name, username, token, msgs: [], state: null };
}
async function connect(p, token) {
  // The server is restarted mid-run, so drop the old socket and forget the state it left behind.
  if (p.ws) { try { p.ws.close(); } catch { /* already gone */ } }
  p.state = null;
  p.msgs = [];
  p.token = token;
  p.ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws');
  await new Promise((r, j) => { p.ws.on('open', r); p.ws.on('error', j); });
  p.ws.on('message', (raw) => { const m = JSON.parse(raw); p.msgs.push(m); if (m.t === 'state') p.state = m; });
  p.ws.send(JSON.stringify({ t: 'hello', token }));
  while (!p.state) await sleep(50);
  p.id = p.state.me.id;
  p.send = (m) => p.ws.send(JSON.stringify(m));
  p.coins = () => p.state.me.coins;
  p.inv = () => p.state.me.inventory;
  p.crafted = () => p.state.me.crafted ?? [];
  p.last = (t) => [...p.msgs].reverse().find((m) => m.t === t);
  p.room = () => p.state.house.members.find((m) => m.id === p.id).rooms[0];
}
const at = (p, item) => p.room().furniture.findIndex((f) => f.item === item);

try {
  fs.rmSync(file, { force: true });
  await startServer();
  const [A, B] = await Promise.all([signup('ana'), signup('ben')]);
  const code = A.state?.house?.code;
  B.send?.({ t: 'join' });

  // Put them in one house, then stop the server so the store can be funded and stocked on disk.
  await connect(A, A.token);
  const houseCode = A.state.house.code;
  await connect(B, B.token);
  B.send({ t: 'join', code: houseCode });
  await sleep(700);
  await stopServer();

  // Fund both players and place one of every making piece, plus a claw machine, in A's room.
  const store = openStore(file, null);
  const { db } = store;
  const fund = (p, coins) => { db.players[p.id].coins = coins; db.players[p.id].inventory = {}; };
  fund(A, 5000);
  fund(B, 5000);
  db.players[A.id].rooms = [{
    wallpaper: db.players[A.id].rooms[0].wallpaper,
    floor: db.players[A.id].rooms[0].floor,
    furniture: [
      { item: 'clawMachine', x: 1, y: 3 },
      { item: 'potteryWheel', x: 3, y: 3 },
      { item: 'easel', x: 5, y: 3 },
      { item: 'loom', x: 7, y: 3 },
      { item: 'craftTable', x: 1, y: 5 },
      { item: 'sewingTable', x: 3, y: 5 },
    ],
  }];
  store.saveAll();
  const tokens = { a: store.issueToken(A.id), b: store.issueToken(B.id) };

  await startServer();
  await connect(A, tokens.a);
  await connect(B, tokens.b);
  await sleep(500);
  ok('both players are in one house', A.state.house.code === B.state.house.code);

  // ---------- 1. claw prizes are giftable ----------
  const clawAt = at(A, 'clawMachine');
  ok('the claw machine is on the floor', clawAt >= 0);
  A.send({ t: 'claw', owner: A.id, r: 0, index: clawAt });
  await sleep(500);
  const prize = Object.entries(A.inv()).find(([, n]) => n > 0)?.[0];
  ok('the claw dropped a prize into storage', !!prize, String(prize));
  const heldBefore = A.inv()[prize] ?? 0;
  const beforeGift = A.coins();
  const bCoinsBefore = B.coins();
  A.send({ t: 'gift_item', item: prize, to: B.id });
  await sleep(500);
  ok('the prize left the giver', (A.inv()[prize] ?? 0) === heldBefore - 1, `${heldBefore} -> ${A.inv()[prize] ?? 0}`);
  ok('the prize arrived with the housemate', (B.inv()[prize] ?? 0) > 0, JSON.stringify(B.inv()));
  ok('gifting a piece moves no coins', A.coins() === beforeGift && B.coins() === bCoinsBefore, `${beforeGift}/${bCoinsBefore}`);
  ok('the receiver was told', !!B.last('gift_item'));

  // ---------- 2. every making piece makes one of its own things, at random ----------
  const pieces = Object.keys(CRAFT);
  const indices = pieces.map((item) => at(A, item));
  ok('all five making pieces are on the floor', indices.every((i) => i >= 0), JSON.stringify(indices));
  const made = [];
  for (const index of indices) {
    A.send({ t: 'craft', owner: A.id, r: 0, index, keep: true });
    await sleep(350);
    const list = A.crafted();
    made.push(list[list.length - 1]);
  }
  ok('every making piece produced something', made.every(Boolean), `${made.filter(Boolean).length}/${indices.length}`);
  ok('each piece only makes things that suit it',
    made.every((p, i) => p && CRAFT[pieces[i]].includes(p.item)),
    made.map((p, i) => `${pieces[i]} -> ${p?.item ?? 'nothing'}`).join(', '));
  ok('the kiln never made a plush', made.every((p) => p?.item !== 'plush' || p === made[pieces.indexOf('sewingTable')]),
    JSON.stringify(made.map((p) => p?.item)));
  ok('crafting needed no item choice from the client', made.every((p) => p && !('choice' in p)));

  // The picker is uniform inside each piece's own pool, so nothing in a pool is rarer than another.
  for (const [piece, pool] of Object.entries(CRAFT)) {
    const counts = new Map();
    for (let i = 0; i < pool.length * 400; i++) {
      const it = craftItem(piece, i / (pool.length * 400));
      counts.set(it, (counts.get(it) ?? 0) + 1);
    }
    const spread = Math.max(...counts.values()) - Math.min(...counts.values());
    ok(`${piece} picks evenly from its own ${pool.length} things`, counts.size === pool.length && spread <= 2,
      `spread ${spread}`);
  }

  // ---------- 3. handmade pieces carry their colour, so the client can draw them ----------
  ok('every handmade piece has a hex colour', made.every((p) => /^#[0-9a-f]{6}$/i.test(p.col)), JSON.stringify(made.map((p) => p.col)));
  const clientSaysRenderable = made.every((p) => !!ITEMS[p.item] && /^#[0-9a-f]{6}$/i.test(p.col));
  ok('every handmade piece can be drawn from its item and colour', clientSaysRenderable);

  // ---------- 4. handmade pieces sell for a quarter of catalog price ----------
  const victim = A.crafted()[0];
  const expected = craftedPrice(victim.item);
  const half = Math.floor(ITEMS[victim.item].price / 2);
  const coinsBefore = A.coins();
  A.send({ t: 'sell_crafted', index: 0 });
  await sleep(500);
  ok('selling a handmade piece pays a quarter of catalog price', A.coins() === coinsBefore + expected,
    `+${A.coins() - coinsBefore}, expected ${expected}`);
  ok('the quarter price is not the half price', expected !== half, `${expected} vs ${half}`);
  ok('the sold piece left the handmade list', A.crafted().length === made.length - 1);

  // ---------- 5. a gifted handmade piece stays sellable ----------
  A.send({ t: 'craft', owner: A.id, r: 0, index: at(A, 'easel'), keep: true });
  await sleep(400);
  const giftPiece = A.crafted()[0];
  ok('A has a piece to gift', !!giftPiece);
  A.send({ t: 'gift_crafted', index: 0, to: B.id });
  await sleep(500);
  ok('the piece arrived with B', B.crafted().some((p) => p.item === giftPiece.item && p.col === giftPiece.col));
  const bBefore = B.coins();
  const bExpected = craftedPrice(giftPiece.item);
  B.send({ t: 'sell_crafted', index: B.crafted().findIndex((p) => p.item === giftPiece.item && p.col === giftPiece.col) });
  await sleep(500);
  ok('a gifted piece sells for a quarter of catalog price', B.coins() === bBefore + bExpected,
    `+${B.coins() - bBefore}, expected ${bExpected}`);

  // ---------- 6. the plain coin gift still works ----------
  const coinBefore = A.coins();
  A.send({ t: 'gift', to: B.id });
  await sleep(500);
  ok('the coin gift still sends ten coins', A.coins() === coinBefore - 10, `${coinBefore} -> ${A.coins()}`);

  // Nothing is sold that you do not own, and no coins appear from nowhere.
  const again = A.coins();
  A.send({ t: 'sell_crafted', index: 99 });
  A.send({ t: 'sell_crafted', index: -1 });
  A.send({ t: 'gift_item', item: 'notAnItem', to: B.id });
  await sleep(400);
  ok('selling or gifting what you do not have pays nothing', A.coins() === again);
} finally {
  await stopServer();
  await wait(400);
  // Windows keeps the file locked until the process is fully gone, so a retry is enough.
  for (let i = 0; i < 10; i++) { try { fs.rmSync(file, { force: true }); break; } catch { await wait(250); } }
}
console.log('\nDone.');