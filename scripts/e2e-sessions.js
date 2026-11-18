// End-to-end check of the study log: sessions written straight into the database while the server is
// stopped are read back on boot (the panel, `totalMinutes` reconciliation) and summed by the
// leaderboard — the path the stats panel and the board depend on after the move off the player row.
//
// Usage: node scripts/e2e-sessions.js   (it starts and stops its own servers on port 8795)
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import { openStore } from '../server/store.js';

const port = Number(process.env.E2E_PORT ?? 8795);
const base = `http://localhost:${port}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-sessions-'));
const dbFile = path.join(dir, 'sessions.db');
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

async function connect(token) {
  const ws = new WebSocket(`ws://localhost:${port}/ws`);
  const p = { ws, state: null, boards: [] };
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.t === 'state') p.state = m;
    if (m.t === 'leaderboard') p.boards.push(m);
  });
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  ws.send(JSON.stringify({ t: 'hello', token }));
  for (let i = 0; i < 60 && !p.state; i++) await sleep(50);
  if (!p.state) throw new Error('no state after hello');
  p.id = p.state.me.id;
  p.send = (m) => ws.send(JSON.stringify(m));
  return p;
}

setTimeout(() => { console.log('FAIL  the run timed out'); process.exit(1); }, 90_000).unref();

// A player, then two sessions written while the server is down.
await start();
const username = `sess_${crypto.randomBytes(3).toString('hex')}`, password = crypto.randomBytes(12).toString('base64url');
const signup = await fetch(`${base}/api/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password, email: `${username}@example.test` }) });
const { token } = await signup.json();
const first = await connect(token);
first.ws.close();
await stop();

const now = Date.now();
const store = openStore(dbFile);
await store.addSession(first.id, { at: now - 3_600_000, minutes: 25, tag: 'Maths' });
await store.addSession(first.id, { at: now - 1_800_000, minutes: 40, tag: 'Reading' });
await store.saveAll();
store.close();

// Boot reads them back: the panel gets both, the leaderboard sums them, and the total agrees.
await start();
const again = await connect(token);
const sessions = again.state.me.sessions ?? [];
ok('the panel is sent the study log after a restart', sessions.length >= 2, JSON.stringify(sessions));
ok('the sessions carry their subjects', new Set(sessions.map((s) => s.tag)).has('Maths') && new Set(sessions.map((s) => s.tag)).has('Reading'));

again.send({ t: 'leaderboard', scope: 'all', period: 'week' });
await sleep(800);
const board = again.boards.at(-1);
ok('the leaderboard is answered', !!board, board ? JSON.stringify(board.rows) : 'no answer');
ok('it counts the logged minutes', (board?.rows ?? []).find((r) => r.me)?.minutes >= 65, JSON.stringify(board?.rows));

again.ws.close();
await stop();
fs.rmSync(dir, { recursive: true, force: true });
