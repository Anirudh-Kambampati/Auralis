// End-to-end check against a running server that uses Neon (Postgres + Object Storage).
// Usage: start the server, then: node --env-file=.env.local scripts/e2e-neon.js
// Creates a throwaway e2e_* account each run.
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import pg from 'pg';
import WebSocket from 'ws';

const base = process.env.API ?? 'http://localhost:8787';
const ok = (label, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`); if (!cond) process.exitCode = 1; };
const post = async (path, body, headers = {}) => {
  const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};

// 1. Accounts: sign up, wrong password refused, log in.
const username = `e2e_${crypto.randomBytes(3).toString('hex')}`;
const password = crypto.randomBytes(12).toString('base64url');
const email = `${username}@example.test`;
ok('sign up needs an email', (await post('/api/signup', { username, password })).status === 400);
const signup = await post('/api/signup', { username, password, email });
ok('sign up returns a token', signup.status === 200 && !!signup.data.token, `HTTP ${signup.status}`);
ok('wrong password is refused', (await post('/api/login', { username, password: 'not-the-password' })).status === 401);
ok('log in with email works', (await post('/api/login', { username: email.toUpperCase(), password })).status === 200);
const login = await post('/api/login', { username, password });
ok('log in returns a token', login.status === 200 && !!login.data.token);
const token = login.data.token;

// 2. Game over WebSocket: hello with the token, then buy something.
const ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws');
const states = [];
await new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });
ws.on('message', (raw) => { const m = JSON.parse(raw); if (m.t === 'state') states.push(m); });
const nextState = (n) => new Promise((r) => { const t = setInterval(() => { if (states.length >= n) { clearInterval(t); r(states[n - 1]); } }, 50); });
ws.send(JSON.stringify({ t: 'hello', token }));
const first = await nextState(1);
ok('WebSocket accepts the token', first.me.coins === 30, `coins ${first.me.coins}`);
ws.send(JSON.stringify({ t: 'buy', item: 'books' }));
const second = await nextState(2);
ok('buying updates state', second.me.coins === 20 && second.me.inventory.books === 1);
const playerId = first.me.id;
ws.close();

// 3. Postgres: the saved row is really in Neon.
await new Promise((r) => setTimeout(r, 1500)); // server saves 0.5 s after a change
const db = new pg.Client({ connectionString: process.env.DATABASE_URL.replace(/sslmode=(require|prefer|verify-ca)/, 'sslmode=verify-full') });
await db.connect();
const row = (await db.query('select data from players where id = $1', [playerId])).rows[0];
ok('player row saved in Neon Postgres', row?.data?.coins === 20 && row?.data?.inventory?.books === 1);
const acct = (await db.query('select username, pass from accounts where player_id = $1', [playerId])).rows[0];
ok('password stored only as a hash', acct?.username === username && !acct.pass.includes(password));
await db.end();

// 4. Object Storage: upload a tiny PNG snapshot, then download it through the presigned URL.
const png = tinyPng();
const res = await fetch(`${base}/api/snapshots`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'image/png' }, body: png });
const snap = await res.json();
ok('snapshot upload accepted', res.status === 200 && snap.snapshots?.length === 1, `HTTP ${res.status}`);
const dl = await fetch(snap.snapshots[0].url);
const bytes = Buffer.from(await dl.arrayBuffer());
ok('presigned URL returns the same bytes', dl.status === 200 && bytes.equals(png), `HTTP ${dl.status}, ${bytes.length} bytes`);
const anon = await fetch(`${base}/api/snapshots`);
ok('snapshots need a login', anon.status === 401);
const notPng = await fetch(`${base}/api/snapshots`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: 'hello' });
ok('non-PNG uploads are refused', notPng.status === 400);

// A valid 2x2 PNG built by hand so the check needs no image library.
function tinyPng() {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.from([0, 244, 166, 184, 157, 180, 238, 0, 143, 208, 168, 255, 210, 122]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
