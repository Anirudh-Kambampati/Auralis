// Seeds a funded account for eyeballing the gift/sell UI in a browser, then leaves the server running.
//
//   node scripts/seed-browser-e2e.js
//
// Prints the username, password and house code, and keeps a server on http://localhost:8787 (so Vite's proxy
// finds it). Ctrl-C to stop.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { openStore } from '../server/store.js';
import { craftColour } from '../shared/game.js';

const PORT = Number(process.env.E2E_PORT ?? 8787);
const base = `http://localhost:${PORT}`;
const file = process.env.DB_FILE ?? path.join(os.tmpdir(), `auralis-browser-${process.pid}.db`);
const password = process.env.DEV_PASSWORD ?? `dev-${crypto.randomBytes(6).toString('hex')}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server = null;
async function start() {
  server = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, DB_FILE: file, PORT: String(PORT), FILES: 'off' }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', (d) => process.env.VERBOSE && process.stdout.write(`[server] ${d}`));
  server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* not up yet */ }
    await sleep(150);
  }
  throw new Error('the server never came up');
}
async function stop() {
  if (!server) return;
  const s = server;
  server = null;
  s.kill();
  await new Promise((r) => s.on('exit', r));
  await sleep(300);
}

const username = 'devtester';
const friend = 'devfriend';
const signup = async (name) => {
  const res = await fetch(`${base}/api/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: name, password, email: `${name}@example.test` }) });
  const body = await res.json();
  if (!res.ok && !/taken|exists|already/i.test(body.error ?? '')) throw new Error(`${name}: ${body.error}`);
  return body.token;
};
// Connects and waits for the first state, so `goHome` has run and the house exists.
const connect = async (token) => {
  const p = { msgs: [], state: null };
  p.ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws');
  await new Promise((r, j) => { p.ws.on('open', r); p.ws.on('error', j); });
  p.ws.on('message', (raw) => { const m = JSON.parse(raw); p.msgs.push(m); if (m.t === 'state') p.state = m; });
  p.ws.send(JSON.stringify({ t: 'hello', token }));
  while (!p.state) await sleep(50);
  return p;
};

try {
  fs.rmSync(file, { force: true });
  await start();
  const tokenA = await signup(username);
  await signup(friend);
  const tokenB = await signup(friend).catch(() => null);

  // Bring them both online so each gets a house, then move the friend into the tester's house.
  const a = await connect(tokenA);
  const b = await connect(tokenB ?? (await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: friend, password }) }).then((r) => r.json()).then((j) => j.token)));
  const code = a.state.house.code;
  b.ws.send(JSON.stringify({ t: 'join', code }));
  await sleep(900);
  a.ws.close();
  b.ws.close();
  await sleep(200);
  await stop();

  // Fund both, stock the tester's room, and pre-make a few pieces so the Handmade shelf has something on it.
  const store = openStore(file, null);
  const { db } = store;
  const [pa, pb] = [db.players[store.playerByUsername(username)], db.players[store.playerByUsername(friend)]];
  if (!pa || !pb) throw new Error('signups did not land in the store');

  const decorate = (p, coins) => { p.coins = coins; p.inventory = { vase: 1, candles: 2 }; };
  decorate(pa, 5000);
  decorate(pb, 5000);
  pa.rooms = [{
    wallpaper: pa.rooms[0].wallpaper,
    floor: pa.rooms[0].floor,
    furniture: [
      { item: 'clawMachine', x: 1, y: 3 },
      { item: 'potteryWheel', x: 3, y: 3 },
      { item: 'easel', x: 5, y: 3 },
      { item: 'loom', x: 7, y: 3 },
      { item: 'craftTable', x: 1, y: 5 },
      { item: 'sewingTable', x: 3, y: 5 },
    ],
  }];
  // A few handmade pieces, so the shelf and its Sell/Gift buttons are visible straight away.
  pa.crafted = ['vase', 'sculpture', 'rug', 'plush'].map((item) => ({ item, col: craftColour(item) }));
  store.saveAll();
  console.log(JSON.stringify({ username, password, friend, code, file, id: pa.id }));
  await start();
  console.log(`ready on ${base} — Ctrl-C to stop`);
  await new Promise(() => {});
} finally {
  await stop();
}