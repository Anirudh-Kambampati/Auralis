// End-to-end check of the wall layer, driven through the same socket messages the browser sends and
// asserted on the state the server sends back. A wall piece (`wall: true`) hangs in the two wall tiles
// above its room's floor row and only collides with other wall pieces.
//
// buy: the air conditioner (the one wall piece) leaves the shop and lands in storage.
// place on the floor: refused — a wall piece never stands on the floor.
// place on the wall band: accepted at y = -1 and y = -2, and the state carries the negative y.
// place on another wall piece: refused.
// a floor piece underneath: accepted (wall pieces block nothing on the floor, and are not swapped away).
// move onto the floor / above the two wall tiles: refused.
// move between wall tiles: accepted.
// pickup: the wall piece comes back into storage.
// restart: the hung piece is still on the wall after the server is reopened.
//
// The air conditioner costs 210 coins, which a test cannot earn, so the purse is seeded from disk while
// the server is stopped — the same way scripts/e2e-domains.js seeds a pet.
//
// Usage: node scripts/e2e-wall.js   (it starts and stops its own servers on port 8798)
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import WebSocket from 'ws';

const port = Number(process.env.E2E_PORT ?? 8798);
const base = `http://localhost:${port}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-wall-'));
const dbFile = path.join(dir, 'wall.db');
const ok = (label, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`); if (!cond) process.exitCode = 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let server = null;

async function start() {
  server = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, DB_FILE: dbFile, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', () => {});
  server.stderr.on('data', (d) => process.stderr.write(d));
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch {}
    await sleep(100);
  }
  throw new Error('server never became ready');
}

async function stop() {
  if (!server) return;
  server.kill();
  await new Promise((r) => server.on('exit', r));
  server = null;
}

// Waits for the effect rather than a fixed delay: a broadcast can land a few ticks after the send.
async function until(fn, ms = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(50); }
  return false;
}

async function signup(name) {
  const username = `wall_${name}_${crypto.randomBytes(3).toString('hex')}`, password = crypto.randomBytes(12).toString('base64url');
  const res = await fetch(`${base}/api/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password, email: `${username}@example.test` }) });
  const { token } = await res.json();
  if (!token) throw new Error(`signup failed for ${name}`);
  return { name, username, password, token, state: null, infos: [] };
}

async function connect(p) {
  p.state = null;
  p.infos = [];
  p.ws = new WebSocket(`ws://localhost:${port}/ws`);
  await new Promise((r, j) => { p.ws.on('open', r); p.ws.on('error', j); });
  p.errors = [];
  p.ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.t === 'state') {
      // Rooms travel by revision: `{ r }` means "keep the one you have", so keep it exactly as the client does.
      for (const mem of m.house.members) {
        const had = p.state?.house.members.find((x) => x.id === mem.id)?.rooms ?? [];
        mem.rooms = (mem.rooms ?? []).map((r, i) => (r && r.furniture ? r : { ...(had[i] ?? {}), ...r }));
      }
      p.state = m;
    }
    if (m.t === 'info') p.infos.push(m);
    if (m.t === 'error') p.errors.push(m.text);
  });
  p.ws.send(JSON.stringify({ t: 'hello', token: p.token }));
  if (!(await until(() => p.state, 6000))) throw new Error(`${p.name} never got a state: is the server up?`);
  p.id = p.state.me.id;
  p.send = (m) => p.ws.send(JSON.stringify(m));
  p.me = () => p.state.me;
  p.member = () => p.state.house.members.find((m) => m.id === p.id);
  return p;
}

// A new socket gets a full house (rooms are otherwise sent by revision: `{ r }` means "keep yours").
async function fresh(p) {
  p.ws.close();
  await sleep(200);
  await connect(p);
}

setTimeout(() => { console.log('FAIL  the run timed out'); process.exit(1); }, 90_000).unref();

await start();
const A = await signup('ana');
await connect(A);

// The purse, seeded while the server is stopped: two air conditioners (210 each) and a chair (10).
A.ws.close();
await sleep(300);
await stop();
{
  const raw = new DatabaseSync(dbFile);
  try { raw.prepare('update accounts set coins = ? where player_id = ?').run(1000, A.id); } finally { raw.close(); }
}
await start();
await connect(A);
ok('the seeded purse is picked up', A.me().coins === 1000, `coins ${A.me().coins}`);

A.send({ t: 'buy', item: 'aircon' });
A.send({ t: 'buy', item: 'aircon' });
A.send({ t: 'buy', item: 'chair' });
ok('two air conditioners and a chair are in storage',
  await until(() => A.me().inventory.aircon === 2 && A.me().inventory.chair === 1), JSON.stringify(A.me().inventory));

const room = () => A.member().rooms?.[0];
const wallPieces = () => (room()?.furniture ?? []).filter((f) => f.item === 'aircon');
const at = (x, y) => (room()?.furniture ?? []).some((f) => f.item === 'aircon' && f.x === x && f.y === y);

// A wall piece never stands on the floor.
A.send({ t: 'place', item: 'aircon', r: 0, x: 2, y: 0 });
await sleep(400);
ok('a wall piece is refused on the floor', wallPieces().length === 0 && A.me().inventory.aircon === 2,
  JSON.stringify(room()?.furniture));

// It hangs on the wall band instead, one and two tiles above the floor row.
A.send({ t: 'place', item: 'aircon', r: 0, x: 2, y: -1 });
ok('a wall piece hangs on the wall tile against the floor', await until(() => at(2, -1)), JSON.stringify(room()?.furniture));
ok('and leaves storage', A.me().inventory.aircon === 1, JSON.stringify(A.me().inventory));

A.send({ t: 'place', item: 'aircon', r: 0, x: 2, y: -1 });
await sleep(400);
ok('a second piece cannot hang on the same tiles', wallPieces().length === 1 && A.me().inventory.aircon === 1,
  JSON.stringify(room()?.furniture));

A.send({ t: 'place', item: 'aircon', r: 0, x: 2, y: -2 });
ok('the wall tile above it takes one', await until(() => at(2, -2)), JSON.stringify(room()?.furniture));

A.send({ t: 'place', item: 'aircon', r: 0, x: 2, y: -3 });
await sleep(400);
ok('above the two wall tiles nothing hangs', wallPieces().length === 2 && A.me().inventory.aircon === 0,
  JSON.stringify(room()?.furniture));

// A floor piece still goes under a hanging one: the wall layer and the floor never fight over a tile.
A.send({ t: 'place', item: 'chair', r: 0, x: 2, y: 0 });
ok('a chair stands under the air conditioner', await until(() => (room()?.furniture ?? []).some((f) => f.item === 'chair' && f.x === 2 && f.y === 0)),
  JSON.stringify(room()?.furniture));
ok('and the piece above it stays', at(2, -1) && at(2, -2));

await fresh(A);
const low = () => (room()?.furniture ?? []).findIndex((f) => f.item === 'aircon' && f.x === 2 && f.y === -1);
ok('the hung piece is sent with its negative y', low() >= 0, JSON.stringify(room()?.furniture));

// Moving a wall piece is held to the same band as placing it.
A.send({ t: 'move', r: 0, index: low(), x: 2, y: 3 });
await sleep(400);
ok('a wall piece cannot be moved onto the floor', low() >= 0, JSON.stringify(room()?.furniture));

A.send({ t: 'move', r: 0, index: low(), x: 6, y: -3 });
await sleep(400);
ok('a wall piece cannot be moved above the wall', low() >= 0);

A.send({ t: 'move', r: 0, index: low(), x: 6, y: -1 });
ok('a wall piece moves along the wall', await until(() => (room()?.furniture ?? []).some((f) => f.item === 'aircon' && f.x === 6 && f.y === -1)),
  JSON.stringify(room()?.furniture));
ok('and the other one is where it was', at(2, -2));

// Pickup puts it back in storage, so hanging is never a one-way trip.
A.send({ t: 'pickup', r: 0, index: (room()?.furniture ?? []).findIndex((f) => f.item === 'aircon' && f.x === 6 && f.y === -1) });
ok('a hung piece can be put away', await until(() => A.me().inventory.aircon === 1 && !(room()?.furniture ?? []).some((f) => f.x === 6 && f.y === -1)),
  JSON.stringify({ inv: A.me().inventory, furniture: room()?.furniture }));

// Reopening the server keeps the piece on the wall. Saves are debounced by half a second, so give the last
// write time to land before the process goes away.
A.ws.close();
await sleep(900);
await stop();
await start();
await connect(A);
ok('the wall piece survives a restart', at(2, -2) && A.me().inventory.aircon === 1,
  JSON.stringify({ furniture: room()?.furniture, inv: A.me().inventory }));

A.ws.close();
await sleep(300);
await stop();
console.log(process.exitCode ? 'wall end-to-end: FAILED' : 'wall end-to-end: OK');
