// End-to-end check of the bell: housemates' actions land in my inbox, missed ones wait for me, reading and clearing stick.
// Usage: start a throwaway server (DB_FILE=/tmp/t.db PORT=8790 node server/index.js), then:
//   API=http://localhost:8790 node scripts/e2e-bell.js
import crypto from 'node:crypto';
import WebSocket from 'ws';

const base = process.env.API ?? 'http://localhost:8787';
const ok = (label, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`); if (!cond) process.exitCode = 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function player(name) {
  const username = `t_${name}_${crypto.randomBytes(3).toString('hex')}`, password = crypto.randomBytes(12).toString('base64url');
  const res = await fetch(`${base}/api/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password, email: `${username}@example.test` }) });
  const { token } = await res.json();
  const p = { name, token, state: null, inbox: null };
  p.connect = async () => {
    p.state = null;
    p.ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws');
    await new Promise((r, j) => { p.ws.on('open', r); p.ws.on('error', j); });
    p.ws.on('message', (raw) => { const m = JSON.parse(raw); if (m.t === 'state') { p.state = m; p.inbox = m.me.inbox; } if (m.t === 'inbox') p.inbox = m.inbox; });
    p.ws.send(JSON.stringify({ t: 'hello', token }));
    while (!p.state) await sleep(50);
  };
  p.send = (m) => p.ws.send(JSON.stringify(m));
  p.kinds = () => p.inbox.map((n) => n.kind);
  await p.connect();
  p.id = p.state.me.id;
  return p;
}

const [A, B] = await Promise.all(['ana', 'ben'].map(player));
B.send({ t: 'join', code: A.state.house.code });
await sleep(800);
ok('both in one house', B.state.house.code === A.state.house.code);

// While A is online: a note, a gift, a study session.
B.send({ t: 'note', to: A.id, text: 'hello desk' });
B.send({ t: 'gift', to: A.id });
B.send({ t: 'focus_start', minutes: 25, tag: 'Maths' });
await sleep(600);
ok('note, gift and study reach A live', ['note', 'gift', 'study'].every((k) => A.kinds().includes(k)), A.kinds().join(','));
ok('note says who and what', A.inbox.some((n) => n.kind === 'note' && n.from === B.id && n.text.includes('hello desk')));
ok('B gets nothing for its own actions', !(B.inbox ?? []).length);

// A goes away; B leaves a note, which waits for A.
A.ws.close();
await sleep(300);
B.send({ t: 'focus_cancel' });
await sleep(300);
const before = A.inbox.length;
B.send({ t: 'note', to: A.id, text: 'while you were out' });
await sleep(400);
await A.connect();
ok('a note sent while away is in the inbox on return', A.inbox.length === before + 1 && A.inbox.at(-1).text.includes('while you were out'));
ok('everything is unseen before opening the bell', A.inbox.every((n) => n.at > (A.state.me.inboxSeen ?? 0)));

A.send({ t: 'inbox_read' });
await sleep(300);
await A.connect();
ok('opening the bell marks them seen', A.inbox.every((n) => n.at <= A.state.me.inboxSeen));

A.send({ t: 'inbox_clear' });
await sleep(300);
ok('clear empties it', A.inbox.length === 0);

for (const q of [A, B]) q.ws.close();
