// End-to-end check of the messages that moved out of the switch in handle(): a few from the room and
// shop domain (world.js) and a few from the house domain (social.js), each asserted by its effect on
// the state the server sends back — so a verb that compiles but does nothing fails here.
//
// sell: a bought piece leaves storage and pays its price back.
// restyle: a placed piece takes a swatch and drops any custom colour.
// todo_add: a house list line shows up for both housemates, with its author.
// event_add: a house event shows up with its date, time and text.
// pet_release: a pet taken out of the room is gone, and the owner is told.
// pet_style: the follow toggle lands on the pet, and toggles back off.
// pet_sofa: every `pet: 'sleep'` piece takes a pet, and a perch (the cat tower) does not.
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
    if (m.t === 'state') {
      // Rooms travel by revision: `{ r }` means "keep the one you have", so keep it exactly as the client does.
      const had = p.state;
      for (const mem of m.house.members) {
        const prev = had?.house.members.find((x) => x.id === mem.id)?.rooms ?? [];
        mem.rooms = (mem.rooms ?? []).map((r, i) => (r && r.furniture ? r : { ...(prev[i] ?? {}), ...r }));
      }
      p.state = m;
    }
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
  // Six pets, one for each piece of pet sleep furniture below (adopting costs coins a test cannot earn).
  row.pets = [{ kind: 'hamster', name: 'Nibbles' }, ...Array.from({ length: 5 }, () => ({ kind: 'hamster' }))];
  // Every sleep piece, plus the cat tower (a perch, not a bed), away from the desk.
  row.rooms[0].furniture.push(
    { item: 'petBed', x: 0, y: 0 }, { item: 'petSofa', x: 1, y: 0 }, { item: 'petTent', x: 2, y: 0 },
    { item: 'doghouse', x: 3, y: 0 }, { item: 'petBasket', x: 5, y: 0 }, { item: 'petHammock', x: 6, y: 0 },
    { item: 'catTower', x: 7, y: 0 },
  );
  // A second room with one lamp in it, so selling it has furniture to hand back (a room costs 1,500).
  row.rooms.push({ wallpaper: row.rooms[0].wallpaper, floor: row.rooms[0].floor, furniture: [{ item: 'lamp', x: 1, y: 1 }] });
  // The second housemate gets a pet and a bed of their own, in rooms that are not the first slots of the house.
  const mate = store.db.players[B.id];
  if (!mate) throw new Error('the housemate row is missing from the database');
  mate.pets = [{ kind: 'hamster', name: 'Mochi' }];
  mate.rooms[0].furniture.push({ item: 'petBed', x: 2, y: 2 });
  store.saveAll();
  store.close();
}
await start();
await connect(A);
ok('the seeded pets are in the room', A.member().pets?.length === 6, JSON.stringify(A.member().pets));

// Follow (world): the toggle on my own pet lands on its row, and off clears it again.
A.send({ t: 'pet_style', slot: 0, follow: true });
ok('my pet can follow me', await until(() => A.member().pets?.[0]?.follow === true), JSON.stringify(A.member().pets?.[0]));
A.send({ t: 'pet_style', slot: 0, follow: false });
ok('and the toggle turns it off', await until(() => !A.member().pets?.[0]?.follow), JSON.stringify(A.member().pets?.[0]));

// Sleep furniture (world): every `pet: 'sleep'` piece takes a pet, and the cat tower (a perch) does not.
const pieceAt = (item, member = A.member()) => member.rooms[0].furniture.findIndex((f) => f.item === item);
const napping = () => (A.member().pets ?? []).filter((p) => p.sofa).map((p) => p.sofa);
// Checked while every pet is still free, so this cannot pass just because there is nobody left to nap.
A.send({ t: 'pet_sofa', owner: A.id, r: 0, index: pieceAt('catTower') });
await sleep(300);
ok('a cat tower is a perch, not a bed', napping().length === 0, JSON.stringify(napping()));
for (const item of ['petBed', 'petSofa', 'petTent', 'doghouse', 'petBasket', 'petHammock']) {
  A.send({ t: 'pet_sofa', owner: A.id, r: 0, index: pieceAt(item) });
  ok(`a ${item} takes a pet`, await until(() => napping().some((s) => s.index === pieceAt(item))), JSON.stringify(napping()));
}

// A second housemate's pet (world): the nap is the same pet-row state in a house where their room is not the
// first slot, so both screens must agree on which room and piece the pet is on.
await connect(B);
if (B.state.house.code !== A.state.house.code) { // a restart can bring an offline player back in their own home
  B.send({ t: 'join', code: A.state.house.code });
  await until(() => A.state.house.members.some((m) => m.id === B.id));
}
B.send({ t: 'pet_sofa', owner: B.id, r: 0, index: pieceAt('petBed', B.member()) });
ok("a second housemate's pet naps on its own bed", await until(() => B.member().pets?.[0]?.sofa?.index === pieceAt('petBed', B.member())), JSON.stringify(B.member().pets?.[0]));
const mateNap = () => A.state.house.members.find((m) => m.id === B.id)?.pets?.[0]?.sofa;
ok('and the other screen is told the same room and piece', await until(() => mateNap()?.r === 0 && mateNap()?.index === pieceAt('petBed', B.member())),
  JSON.stringify({ seen: mateNap(), members: A.state.house.members.map((m) => [m.name, m.pets?.length]), aHouse: A.state.house.code, bHouse: B.state.house.code, bMembers: B.state.house.members.map((m) => m.name) }));

A.send({ t: 'pet_release', slot: 0 });
ok('a released pet leaves the room', await until(() => A.member().pets?.length === 5), JSON.stringify(A.member().pets?.length));
ok('and the owner is told', await until(() => A.infos.some((i) => i.text.includes('Waved goodbye to Nibbles'))), JSON.stringify(A.infos));

// Sell room (world): never the first room, the full price back, and its furniture into storage.
const before = A.me().coins;
A.send({ t: 'sell_room', r: 0 });
await sleep(200);
ok('the first room cannot be sold', A.member().rooms.length === 2 && A.me().coins === before, `${A.member().rooms.length} rooms, coins ${A.me().coins}`);
A.send({ t: 'sell_room', r: 9 });
await sleep(200);
ok('a room index nobody owns sells nothing', A.member().rooms.length === 2 && A.me().coins === before, `${A.member().rooms.length} rooms, coins ${A.me().coins}`);
A.send({ t: 'sell_room', r: 1 });
ok('an extra room can be sold', await until(() => A.member().rooms.length === 1), `${A.member().rooms.length} rooms`);
ok('and pays its full price back', await until(() => A.me().coins === before + 1500), `coins ${A.me().coins}, was ${before}`);
ok('with its furniture back in storage', A.me().inventory.lamp === 1, JSON.stringify(A.me().inventory));

A.ws.close();
await sleep(300);
await stop();
fs.rmSync(dir, { recursive: true, force: true });
