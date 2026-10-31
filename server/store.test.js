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
