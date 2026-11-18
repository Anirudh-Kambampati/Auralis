// End-to-end check of chat since it moved into the archive: a house line reaches a housemate, a DM
// reaches both sides, a read receipt moves, history pages, a mute survives a reconnect, and a restart
// (a second `hello` on a fresh socket) still shows the conversation.
//
// Usage: start a throwaway server (DB_FILE=/tmp/t.db PORT=8793 node server/index.js), then:
//   API=http://localhost:8793 node scripts/e2e-chat.js
import crypto from 'node:crypto';
import WebSocket from 'ws';

const base = process.env.API ?? 'http://localhost:8787';
const ok = (label, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`); if (!cond) process.exitCode = 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function player(name) {
  const username = `chat_${name}_${crypto.randomBytes(3).toString('hex')}`, password = crypto.randomBytes(12).toString('base64url');
  const res = await fetch(`${base}/api/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password, email: `${username}@example.test` }) });
  const { token } = await res.json();
  const p = { name, username, password, token, state: null, reads: [] };
  p.connect = async () => {
    p.state = null;
    p.ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws');
    await new Promise((r, j) => { p.ws.on('open', r); p.ws.on('error', j); });
    p.ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.t === 'state') p.state = m;
      if (m.t === 'read') p.reads.push(m);
      if (m.t === 'history') p.history = m;
    });
    p.ws.send(JSON.stringify({ t: 'hello', token }));
    for (let i = 0; i < 60 && !p.state; i++) await sleep(50);
    if (!p.state) throw new Error(`${name} never got a state: is the server up?`);
  };
  p.send = (m) => p.ws.send(JSON.stringify(m));
  p.house = () => p.state.house.chat;
  p.dm = () => p.state.me.dm;
  await p.connect();
  p.id = p.state.me.id;
  return p;
}

// A hang is a failure too: the harness must not sit forever if a message never arrives.
setTimeout(() => { console.log('FAIL  the run timed out'); process.exit(1); }, 60_000).unref();

const [A, B] = await Promise.all(['ana', 'ben'].map(player));
B.send({ t: 'join', code: A.state.house.code });
await sleep(800);
ok('both in one house', B.state.house.code === A.state.house.code);

// House chat: written to the archive and broadcast, without the player row carrying it.
const line = `hello ${crypto.randomBytes(2).toString('hex')}`;
A.send({ t: 'chat', text: line });
await sleep(800);
ok('a house line reaches the housemate', B.house().some((m) => m.text === line));
ok('the line carries an id to page from', Number.isFinite(B.house().at(-1)?.id));

// The room and shop domain (world.js): buy a piece and put it down, which used to be switch cases.
A.send({ t: 'buy', item: 'desk' });
await sleep(500);
A.send({ t: 'place', item: 'desk', x: 1, y: 1 });
await sleep(700);
const mine = A.state.house.members.find((m) => m.id === A.id);
ok('a bought piece can be placed (world domain)', mine.rooms[0].furniture.some((f) => f.item === 'desk' && f.x === 1 && f.y === 1));

// A DM, both sides, and the reply quote.
A.send({ t: 'dm', to: B.id, text: 'psst' });
await sleep(800);
const dm = B.dm()[A.id] ?? [];
ok('a dm arrives for the other side', dm.some((m) => m.text === 'psst'));
ok('a dm is in the sender’s list too', (A.dm()[B.id] ?? []).some((m) => m.text === 'psst'));

// Read receipt: relayed, and kept on the conversation list (survives a reload).
const dmId = dm.at(-1)?.id;
// The client names a conversation the way it shows it: the house as h:<code>, a group as g:<id>, a person by id.
B.send({ t: 'read', thread: A.id, id: dmId });
await sleep(800);
ok('a read receipt is relayed to the sender', A.reads.some((r) => r.id === dmId));

// History pages from the archive.
B.send({ t: 'history', k: 'h', before: Date.now() * 2 });
for (let i = 0; i < 60 && !B.history; i++) await sleep(50);
ok('history comes back for a house thread', !!B.history?.msgs?.some((m) => m.text === line));

// A mute is stored on the conversation list, so a reconnect still knows about it.
const houseThread = `h:${A.state.house.code}`;
B.send({ t: 'mute', thread: houseThread, until: 0 });
await sleep(400);
B.ws.close();
await sleep(2500); // the read receipt is written in a 2 s batch
await B.connect();
ok('a mute survives a reconnect', B.state.me.mutedThreads?.[houseThread] === 0);
ok('what was read survives a reconnect, keyed the way the client names it', B.state.me.threadSeen?.[A.id] === dmId,
  JSON.stringify(B.state.me.threadSeen));

// The account deletion route needs the password, and erases the account.
const del = (password) => fetch(`${base}/api/delete`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: B.username, password }) });
ok('deleting an account rejects a wrong password', (await del('wrong-password')).status === 401);
ok('deleting an account with the right password works', (await del(B.password)).status === 200);
const after = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: B.username, password: B.password }) });
ok('a deleted account can no longer log in', after.status === 401, `status ${after.status}`);

A.ws.close();
B.ws.close();
