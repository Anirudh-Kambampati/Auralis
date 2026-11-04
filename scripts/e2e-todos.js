// End-to-end check of to-dos and reminders: who can see a task, who can tick it, who gets reminded.
// Usage: start a throwaway server (DB_FILE=/tmp/t.db PORT=8790 node server/index.js), then:
//   API=http://localhost:8790 node scripts/e2e-todos.js
// Takes about 40 s: the server checks for due reminders every 30 s.
import crypto from 'node:crypto';
import WebSocket from 'ws';

const base = process.env.API ?? 'http://localhost:8787';
const ok = (label, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`); if (!cond) process.exitCode = 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function player(name) {
  const username = `t_${name}_${crypto.randomBytes(3).toString('hex')}`, password = crypto.randomBytes(12).toString('base64url');
  const res = await fetch(`${base}/api/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password, email: `${username}@example.test` }) });
  const { token } = await res.json();
  const p = { name, username, token, msgs: [], state: null };
  p.connect = async () => {
    p.ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws');
    await new Promise((r, j) => { p.ws.on('open', r); p.ws.on('error', j); });
    p.ws.on('message', (raw) => { const m = JSON.parse(raw); p.msgs.push(m); if (m.t === 'state') p.state = m; });
    p.ws.send(JSON.stringify({ t: 'hello', token }));
    while (!p.state) await sleep(50);
  };
  p.send = (m) => p.ws.send(JSON.stringify(m));
  p.todos = () => p.state.house.todos;
  p.heard = (text) => p.msgs.some((m) => JSON.stringify(m).includes(text)); // anywhere in anything the server sent them
  await p.connect();
  p.id = p.state.me.id;
  return p;
}

const [A, B, C, D] = await Promise.all(['ana', 'ben', 'cat', 'dan'].map(player));
const code = A.state.house.code;
for (const q of [B, C, D]) q.send({ t: 'join', code });
await sleep(800);
ok('everyone is in one house', [A, B, C, D].every((q) => q.state.house.code === code));

// A makes a task just for A and B, one for everyone, and one just for D (who'll be offline when it comes due).
const soon = Date.now() + 3000;
A.send({ t: 'todo_add', text: 'SECRET-ab', to: [A.id, B.id], at: soon });
A.send({ t: 'todo_add', text: 'ALL-task', all: true });
A.send({ t: 'todo_add', text: 'DAN-only', to: [D.id], at: soon });
await sleep(800);
const has = (q, text) => q.todos().some((t) => t.text === text);
ok('A (maker) sees the A+B task', has(A, 'SECRET-ab'));
ok('B (assignee) sees the A+B task', has(B, 'SECRET-ab'));
ok('C does NOT see the A+B task', !has(C, 'SECRET-ab'));
ok('D does NOT see the A+B task', !has(D, 'SECRET-ab'));
ok('everyone sees the "everyone" task', [A, B, C, D].every((q) => has(q, 'ALL-task')));
ok('A (maker) sees the task made for D', has(A, 'DAN-only'));
ok('B and C do NOT see the task for D', !has(B, 'DAN-only') && !has(C, 'DAN-only'));
const ab = A.todos().find((t) => t.text === 'SECRET-ab');
ok('the A+B task lists exactly A and B', JSON.stringify([...ab.to].sort()) === JSON.stringify([A.id, B.id].sort()));

// C can't tick or delete a task they can't see; B can't delete A's task.
C.send({ t: 'todo_toggle', id: ab.id });
C.send({ t: 'todo_del', id: ab.id });
B.send({ t: 'todo_del', id: ab.id });
await sleep(600);
const ab2 = A.todos().find((t) => t.text === 'SECRET-ab');
ok('C could not tick it, and neither C nor B could delete it', !!ab2 && ab2.ticks.length === 0);

// B ticks their part: not done until A ticks too.
B.send({ t: 'todo_toggle', id: ab.id });
await sleep(500);
const ab3 = A.todos().find((t) => t.text === 'SECRET-ab');
ok('B ticking leaves it open for A', ab3.ticks.includes(B.id) && !ab3.done);

// A edits the task to add C: now C sees it, B keeps their tick; B (not the maker) can't edit it.
A.send({ t: 'todo_edit', id: ab.id, text: 'SECRET-ab', at: ab.at, to: [A.id, B.id, C.id] });
B.send({ t: 'todo_edit', id: ab.id, text: 'hijacked', to: [B.id] });
await sleep(600);
const ab4 = A.todos().find((t) => t.id === ab.id);
ok('maker can add someone: C now sees it', has(C, 'SECRET-ab') && ab4.to.includes(C.id));
ok("B's tick survives the edit, and B couldn't edit it", ab4.ticks.includes(B.id) && ab4.text === 'SECRET-ab');
A.send({ t: 'todo_edit', id: ab.id, text: 'SECRET-ab', at: ab.at, to: [A.id, B.id] }); // and back, for the checks below
await sleep(600);
ok('removing C hides it from C again', !has(C, 'SECRET-ab'));
C.msgs = []; // C saw it while assigned; from here on C should hear nothing more about it

// D goes offline before the reminders fire.
D.ws.close();
console.log('…waiting for the reminder sweep (up to 35 s)');
const deadline = Date.now() + 35_000;
while (Date.now() < deadline && !A.msgs.some((m) => m.t === 'remind')) await sleep(500);
const reminded = (q, text) => q.msgs.some((m) => m.t === 'remind' && m.text === text);
ok('A (assignee, not ticked) gets the reminder', reminded(A, 'SECRET-ab'));
ok('B (already ticked) gets no reminder', !reminded(B, 'SECRET-ab'));
ok('C hears nothing more about the A+B task once removed', !C.heard('SECRET-ab'));
ok('B and C never hear about the task for D', !B.heard('DAN-only') && !C.heard('DAN-only'));
ok('A gets no reminder for the task made for D', !reminded(A, 'DAN-only'));

// D comes back: the reminder that fired while away is waiting.
D.msgs = [];
await D.connect();
await sleep(500);
ok('D gets the missed reminder on login', D.msgs.some((m) => m.t === 'remind' && m.text === 'DAN-only' && m.missed));
ok('D never hears about the A+B task', !D.heard('SECRET-ab'));

// Push subscriptions must point at a real browser push service.
A.send({ t: 'push_sub', sub: { endpoint: 'http://169.254.169.254/latest', keys: { p256dh: 'x', auth: 'y' } } });
A.send({ t: 'push_sub', sub: { endpoint: 'https://evil.example.com/push', keys: { p256dh: 'x', auth: 'y' } } });
await sleep(300);
ok('server still up after bad push subscriptions', A.ws.readyState === WebSocket.OPEN);

// Group chats: A makes "study crew" with B and D; C isn't in it and must never hear a word.
C.msgs = [];
A.send({ t: 'group_new', name: 'study crew', members: [B.id, D.id] });
await sleep(600);
const gid = Object.keys(A.state.me.groups ?? {})[0];
ok('group made: A, B and D have it', !!gid && !!B.state.me.groups?.[gid] && !!D.state.me.groups?.[gid]);
ok('C is not in the group', !C.state.me.groups?.[gid]);
B.send({ t: 'gmsg', g: gid, text: 'GROUP-hello' });
await sleep(600);
ok('A and D get the group message', A.state.me.groups[gid].msgs.some((c) => c.text === 'GROUP-hello') && D.state.me.groups[gid].msgs.some((c) => c.text === 'GROUP-hello'));
C.send({ t: 'gmsg', g: gid, text: 'GROUP-intruder' });
await sleep(600);
ok("C can't post into a group they're not in", !A.state.me.groups[gid].msgs.some((c) => c.text === 'GROUP-intruder'));
ok('C never hears the group name or its messages', !C.heard('GROUP-hello') && !C.heard('study crew'));
D.send({ t: 'group_leave', g: gid });
await sleep(600);
ok('D left: gone for D, others see the note', !D.state.me.groups?.[gid] && A.state.me.groups[gid].msgs.some((c) => c.text.includes('left the group')) && !A.state.me.groups[gid].members.includes(D.id));
D.msgs = [];
A.send({ t: 'gmsg', g: gid, text: 'GROUP-after' });
await sleep(600);
ok('D hears nothing after leaving', !D.heard('GROUP-after'));

// Friends: E lives in another house. No DMs until friends; then both ways, and the history is in the database.
const E = await player('eve');
E.send({ t: 'dm', to: A.id, text: 'DM-stranger' });
await sleep(600);
ok("a stranger from another house can't message A", !A.heard('DM-stranger'));
E.send({ t: 'friend_request', name: 'nobody-at-all-xyz' });
await sleep(400);
ok('asking for an unknown username fails', E.msgs.some((m) => m.t === 'error' && /No one is called/.test(m.text)));
E.send({ t: 'friend_request', name: A.username });
await sleep(600);
ok('A sees an incoming request, E an outgoing one', A.state.me.friends?.some((f) => f.id === E.id && f.status === 'incoming') && E.state.me.friends?.some((f) => f.id === A.id && f.status === 'outgoing'));
ok('B never hears about it', !B.state.me.friends?.length);
A.send({ t: 'friend_accept', id: E.id });
await sleep(600);
ok('accepted: friends on both sides', A.state.me.friends.some((f) => f.id === E.id && f.status === 'friend') && E.state.me.friends.some((f) => f.id === A.id && f.status === 'friend'));
E.send({ t: 'dm', to: A.id, text: 'DM-friend-1' });
await sleep(700);
A.send({ t: 'dm', to: E.id, text: 'DM-friend-2' });
await sleep(700);
ok('friends message each other across houses', A.state.me.dm?.[E.id]?.some((c) => c.text === 'DM-friend-1') && E.state.me.dm?.[A.id]?.some((c) => c.text === 'DM-friend-2'));
A.msgs = [];
A.send({ t: 'history', k: 'd', id: E.id, before: Number.MAX_SAFE_INTEGER });
B.send({ t: 'history', k: 'd', id: E.id, before: Number.MAX_SAFE_INTEGER });
A.send({ t: 'history', k: 'h', before: Number.MAX_SAFE_INTEGER });
await sleep(600);
const hist = A.msgs.filter((m) => m.t === 'history');
ok('the DM thread is in the database', hist.some((m) => m.k === 'd' && m.msgs.map((c) => c.text).join() === 'DM-friend-1,DM-friend-2'));
ok("B's history of a thread they're not in is empty", !B.heard('DM-friend'));
E.send({ t: 'friend_remove', id: A.id });
await sleep(600);
E.send({ t: 'dm', to: A.id, text: 'DM-after-unfriend' });
await sleep(600);
ok('unfriended: gone on both sides, and no more DMs', !A.state.me.friends.length && !E.state.me.friends.length && !A.heard('DM-after-unfriend'));

for (const q of [A, B, C, D, E]) q.ws.close();
