import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openStore, hashPassword, checkPassword } from './store.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-'));

test('passwords are salted hashes and verify correctly', () => {
  const a = hashPassword('correct horse'), b = hashPassword('correct horse');
  assert.notEqual(a, b);
  assert.ok(!a.includes('correct'));
  assert.ok(checkPassword('correct horse', a));
  assert.ok(!checkPassword('wrong', a));
  assert.ok(!checkPassword('x', 'garbage'));
});

test('players and houses survive a restart', () => {
  const dir = tmp(), file = path.join(dir, 'a.db');
  const s = openStore(file);
  s.db.players.p1 = { id: 'p1', name: 'Mo', room: { furniture: [{ item: 'desk', x: 4, y: 4 }] } };
  s.db.houses.ABCDE = { code: 'ABCDE', members: ['p1'], todos: [], chat: [] };
  s.saveAll();
  s.close();
  const again = openStore(file);
  assert.deepEqual(again.db.players.p1.room.furniture, [{ item: 'desk', x: 4, y: 4 }]);
  assert.deepEqual(again.db.houses.ABCDE.members, ['p1']);
  again.deleteHouse('ABCDE');
  again.close();
  assert.equal(openStore(file).db.houses.ABCDE, undefined);
});

test('account coins are saved in their own column, which wins on load', () => {
  const file = path.join(tmp(), 'c.db');
  const s = openStore(file);
  s.createAccount('p1', 'Mo', 'secret-pass', null);
  s.db.players.p1 = { id: 'p1', coins: 42 };
  s.saveAll();
  s.close();
  const raw = new DatabaseSync(file);
  assert.equal(raw.prepare('select coins from accounts where player_id = ?').get('p1').coins, 42);
  raw.prepare('update accounts set coins = 7').run();
  raw.close();
  assert.equal(openStore(file).db.players.p1.coins, 7);
});

test('coins edited in the database while running are picked up, not overwritten', () => {
  const file = path.join(tmp(), 'd.db');
  const s = openStore(file);
  s.createAccount('p1', 'Mo', 'secret-pass', null);
  s.db.players.p1 = { id: 'p1', coins: 10 };
  s.saveAll();
  assert.deepEqual(s.syncCoins(), []);
  const raw = new DatabaseSync(file);
  raw.prepare('update accounts set coins = 500').run();
  s.db.players.p1.coins = 12; // the game changed coins before noticing the edit
  s.saveAll();
  assert.equal(raw.prepare('select coins from accounts').get().coins, 500);
  assert.deepEqual(s.syncCoins(), ['p1']);
  assert.equal(s.db.players.p1.coins, 500);
  s.db.players.p1.coins = 520;
  s.saveAll();
  assert.equal(raw.prepare('select coins from accounts').get().coins, 520);
  raw.close();
});

test('accounts: unique usernames and emails, log in with either, token sign-in', () => {
  const s = openStore(path.join(tmp(), 'b.db'));
  s.createAccount('p1', 'Mo', 'secret-pass', 'mo@example.com');
  assert.equal(s.findAccount('mo').player_id, 'p1');
  assert.equal(s.findAccount('MO@Example.com').player_id, 'p1');
  assert.ok(s.emailTaken('Mo@example.com'));
  assert.throws(() => s.createAccount('p2', 'MO', 'other-pass', 'other@example.com'));
  assert.throws(() => s.createAccount('p3', 'Someone', 'other-pass', 'MO@example.com'));
  assert.ok(s.hasAccount('p1'));
  const token = s.issueToken('p1');
  assert.equal(s.playerForToken(token), 'p1');
  assert.equal(s.playerForToken('nope'), null);
  s.revokeToken(token);
  assert.equal(s.playerForToken(token), null);
});

test('imports the old data.json once', () => {
  const dir = tmp(), json = path.join(dir, 'data.json');
  fs.writeFileSync(json, JSON.stringify({ players: { old: { id: 'old', name: 'Legacy' } }, houses: {} }));
  const s = openStore(path.join(dir, 'c.db'), json);
  assert.equal(s.db.players.old.name, 'Legacy');
  assert.ok(!fs.existsSync(json) && fs.existsSync(`${json}.imported`));
});

test('chat history is kept in the messages table and pages back', () => {
  const dir = tmp(), file = path.join(dir, 'm.db');
  const s = openStore(file);
  for (let i = 1; i <= 120; i++) s.addMessage('h:ABCDE', { id: i, from: 'p1', by: 'Mo', text: `m${i}`, at: i });
  s.addMessage('d:p1|p2', { id: 500, from: 'p2', by: 'Jo', text: 'hi', at: 500 });
  s.close();
  const again = openStore(file);
  const page1 = again.history('h:ABCDE', 1e15, 50), page2 = again.history('h:ABCDE', page1[0].id, 50), last = again.history('h:ABCDE', page2[0].id, 50);
  assert.deepEqual([page1[0].text, page1.at(-1).text, page2[0].text, last.length, last[0].text], ['m71', 'm120', 'm21', 20, 'm1']);
  assert.deepEqual(again.history('d:p1|p2', 1e15), [{ id: 500, from: 'p2', by: 'Jo', text: 'hi', at: 500 }]);
  assert.equal(again.history('h:OTHER', 1e15).length, 0);
  again.addMessage('g:g1', { id: 600, from: 'p1', by: 'Mo', text: '', img: 'chat/p1/1-ab/a.pdf', at: 600 });
  assert.deepEqual(again.threadsWithImg('chat/p1/1-ab/a.pdf'), ['g:g1']);
  assert.deepEqual(again.threadsWithImg('chat/p1/never-sent.jpg'), []);
  again.close();
});

test('chat already in player and house rows moves into the messages table once', () => {
  const dir = tmp(), file = path.join(dir, 'o.db');
  const s = openStore(file);
  s.db.houses.ABCDE = { code: 'ABCDE', members: ['p1', 'p2'], chat: [{ id: 1, from: 'p1', by: 'Mo', text: 'house', at: 1 }] };
  const dm = { id: 2, from: 'p1', by: 'Mo', text: 'private', at: 2 };
  s.db.players.p1 = { id: 'p1', dm: { p2: [dm] } };
  s.db.players.p2 = { id: 'p2', dm: { p1: [dm] }, groups: { g1: { name: 'crew', members: ['p1', 'p2'], msgs: [{ id: 3, from: 'p2', by: 'Jo', text: 'group', at: 3 }] } } };
  s.saveAll();
  // Drop what the first open already moved in, as if the table were new.
  new DatabaseSync(file).exec('delete from messages');
  s.close();
  const again = openStore(file);
  assert.deepEqual(again.history('h:ABCDE', 1e15).map((m) => m.text), ['house']);
  assert.deepEqual(again.history('d:p1|p2', 1e15).map((m) => m.text), ['private']); // on both players' rows, stored once
  assert.deepEqual(again.history('g:g1', 1e15).map((m) => m.text), ['group']);
  again.close();
});

test('friends are saved, changed and removed', () => {
  const dir = tmp(), file = path.join(dir, 'f.db');
  const s = openStore(file);
  s.createAccount('p1', 'Mona', 'secret-password', 'mona@example.test');
  assert.equal(s.playerByUsername('mona'), 'p1'); // any case
  assert.equal(s.playerByUsername('nobody'), null);
  s.setFriend({ a: 'p1', b: 'p2', status: 'pending', asked_by: 'p1', at: 1 });
  s.setFriend({ a: 'p1', b: 'p2', status: 'accepted', asked_by: 'p1', at: 2 });
  s.setFriend({ a: 'p1', b: 'p3', status: 'pending', asked_by: 'p3', at: 3 });
  s.close();
  const again = openStore(file);
  assert.deepEqual(again.friends().map((f) => `${f.b}:${f.status}`).sort(), ['p2:accepted', 'p3:pending']);
  again.deleteFriend('p1', 'p3');
  assert.deepEqual(again.friends().map((f) => f.b), ['p2']);
  again.close();
});

test('saves only write rows that changed', () => {
  const dir = tmp(), file = path.join(dir, 'd.db');
  const s = openStore(file);
  s.db.players.p1 = { id: 'p1', coins: 1 };
  s.db.players.p2 = { id: 'p2', coins: 2 };
  s.saveAll();
  // Change p2 behind the store's back in the file: if p2 is rewritten unchanged, this edit is lost.
  new DatabaseSync(file).prepare("update players set data = ? where id = 'p2'").run(JSON.stringify({ id: 'p2', coins: 99 }));
  s.db.players.p1.coins = 5;
  s.saveAll();
  s.close();
  const again = openStore(file);
  assert.deepEqual([again.db.players.p1.coins, again.db.players.p2.coins], [5, 99]);
  again.close();
});

test('a reset link sets a new password once, signs out everywhere, and is capped per account', () => {
  const s = openStore(path.join(tmp(), 'r.db'));
  s.createAccount('p1', 'Mo', 'old-password', 'mo@example.com');
  const session = s.issueToken('p1');
  const link = s.createReset('p1');
  assert.equal(s.useReset('not-a-real-link', 'new-password'), null);
  assert.equal(s.useReset(link, 'new-password'), 'p1');
  assert.ok(checkPassword('new-password', s.findAccount('Mo').pass));
  assert.equal(s.playerForToken(session), null); // old sign-ins are gone
  assert.equal(s.useReset(link, 'another-password'), null); // used once already
  assert.ok(s.createReset('p1') && s.createReset('p1') && s.createReset('p1'));
  assert.equal(s.createReset('p1'), null); // a 4th live link isn't made
  assert.equal(s.findAccount('mo@example.com').email, 'mo@example.com');
  s.close();
});
