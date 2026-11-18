// End-to-end check of the messages that moved out of the switch in handle(): a few from the room and
// shop domain (world.js) and a few from the house domain (social.js), each asserted by its effect on
// the state the server sends back — so a verb that compiles but does nothing fails here.
//
// sell: a bought piece leaves storage and pays its price back.
// restyle: a placed piece takes a swatch and drops any custom colour.
// todo_add: a house list line shows up for both housemates, with its author.
// event_add: a house event shows up with its date, time and text.
// pet_release: a pet taken out of the room is gone, and the owner is told.
//
// The pet needs 300 coins to adopt, which a test cannot earn, so that one row is seeded from disk while
// the server is stopped — the same way scripts/e2e-sessions.js writes sessions it wants to read back.
//
// Usage: node scripts/e2e-domains.js   (it starts and stops its own servers on port 8797)
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import { openStore } from '../server/store.js';

const port = Number(process.env.E2E_PORT ?? 8797);
const base = `http://localhost:${port}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-domains-'));
const dbFile = path.join(dir, 'domains.db');
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

// A plain account (no socket), so the pet seed can be stopped between signup and the first hello.
async function signup(name) {
  const username = `dom_${name}_${crypto.randomBytes(3).toString('hex')}`, password = crypto.randomBytes(12).toString('base64url');
  const res = await fetch(`${base}/api/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password, email: `${username}@example.test` }) });
  const { token } = await res.json();
  if (!token) throw new Error(`signup failed for ${name}`);
  return { name, username, password, token, state: null, infos: [] };
}

async function connect(p) {
  p.state = null;
  p.ws = new WebSocket(`ws://localhost:${port}/ws`);
  await new Promise((r, j) => { p.ws.on('open', r); p.ws.on('error', j); });
  p.ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.t === 'state') p.state = m;
    if (m.t === 'info') p.infos.push(m);
  });
  p.ws.send(JSON.stringify({ t: 'hello', token: p.token }));
  if (!(await until(() => p.state, 6000))) throw new Error(`${p.name} never got a state: is the server up?`);
  p.id = p.state.me.id;
  p.send = (m) => p.ws.send(JSON.stringify(m));
  p.me = () => p.state.me;
  p.member = () => p.state.house.members.find((m) => m.id === p.id);
  return p;
}

setTimeout(() => { console.log('FAIL  the run timed out'); process.exit(1); }, 90_000).unref();

await start();
const A = await signup('ana');
const B = await signup('ben');
await connect(A);

// Sell (world): a bought piece leaves storage and pays its price back. coffee is 4 and sells for 2.
A.send({ t: 'buy', item: 'coffee' });
ok('a bought piece is in storage', await until(() => A.me().inventory.coffee === 1), JSON.stringify(A.me().inventory));
A.send({ t: 'sell', item: 'coffee' });
ok('a sold piece leaves storage', await until(() => A.me().inventory.coffee === 0), JSON.stringify(A.me().inventory));
ok('and pays its price back', await until(() => A.me().coins === 30 - 4 + 2), `coins ${A.me().coins}`);

// Restyle (world): a placed piece takes the swatch, and drops any custom colour with it.
A.send({ t: 'buy', item: 'chair' });
A.send({ t: 'place', item: 'chair', x: 2, y: 2 });
const chairAt = () => {
  const idx = A.member().rooms[0].furniture.findIndex((f) => f.item === 'chair' && f.x === 2 && f.y === 2);
  return idx < 0 ? null : { idx, f: A.member().rooms[0].furniture[idx] };
};
ok('a chair can be placed', await until(() => !!chairAt()), JSON.stringify(A.member().rooms[0].furniture));
A.send({ t: 'paint', index: chairAt()?.idx, col: '#123456' });
ok('a placed piece takes a custom colour', await until(() => chairAt()?.f.col === '#123456'));
A.send({ t: 'restyle', index: chairAt()?.idx, v: 1 });
ok('a restyled piece takes its swatch', await until(() => chairAt()?.f.v === 1), JSON.stringify(chairAt()?.f));
ok('and the custom colour goes with it', chairAt()?.f.col === undefined);

await connect(B);
B.send({ t: 'join', code: A.state.house.code });
ok('both in one house', await until(() => B.state.house.code === A.state.house.code));

// Todo add (social): the line reaches the house list, named, for both housemates.
const todo = `water the ferns ${crypto.randomBytes(2).toString('hex')}`;
A.send({ t: 'todo_add', text: todo, all: true });
ok('a house list line is on the list', await until(() => A.state.house.todos.some((t) => t.text === todo)));
ok('and the housemate sees it', B.state.house.todos.some((t) => t.text === todo));
ok('with the author on it', A.state.house.todos.find((t) => t.text === todo)?.by === A.member().name,
  JSON.stringify(A.state.house.todos.find((t) => t.text === todo)));

// Event add (social): a house event carries its date, time and text to both.
const evText = `ferns day ${crypto.randomBytes(2).toString('hex')}`;
A.send({ t: 'event_add', scope: 'house', date: '2030-01-15', time: '09:30', text: evText });
const ev = () => A.state.house.events?.find((e) => e.text === evText);
ok('a house event is on the calendar', await until(() => !!ev()));
ok('with its date and time', ev()?.date === '2030-01-15' && ev()?.time === '09:30', JSON.stringify(ev()));
ok('and the housemate sees it', B.state.house.events?.some((e) => e.text === evText));

// Pet release (world): the row is seeded while the server is stopped, because adopting costs 300 coins.
B.ws.close();
A.ws.close();
await sleep(300);
await stop();
{
  const store = openStore(dbFile);
  const row = store.db.players[A.id];
  if (!row) throw new Error('the player row is missing from the database');
  row.pets = [{ kind: 'hamster', name: 'Nibbles' }];
  store.saveAll();
  store.close();
}
await start();
await connect(A);
ok('the seeded pet is in the room', A.member().pets?.length === 1, JSON.stringify(A.member().pets));
A.send({ t: 'pet_release', slot: 0 });
ok('a released pet leaves the room', await until(() => A.member().pets?.length === 0), JSON.stringify(A.member().pets));
ok('and the owner is told', await until(() => A.infos.some((i) => i.text.includes('Waved goodbye to Nibbles'))), JSON.stringify(A.infos));

A.ws.close();
await sleep(300);
await stop();
fs.rmSync(dir, { recursive: true, force: true });
