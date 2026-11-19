// The storage interface both stores promise (server/store.js and server/store-pg.js), run against
// SQLite always and against Postgres when TEST_DATABASE_URL names a test branch. Every row this suite
// creates carries a per-run prefix, so it never reads or deletes anything it did not write — and it
// refuses to run against DATABASE_URL at all, because it does delete what it wrote.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';
import { openStore, checkPassword } from './store.js';
import { openPgStore } from './store-pg.js';

const run = crypto.randomBytes(4).toString('hex');
const id = (name) => `${run}-${name}`;
const messageBase = Date.now() * 1000; // unique per run, and inside what a JS number holds exactly
// Ids this suite hands out. Every test shares one SQLite file (and one Postgres database), and a message id
// is global, so two tests must never pick the same number: `insert or ignore` would drop the second one.
let msgSeq = messageBase + 1_000_000;
const msgId = () => msgSeq++;

function sqlite() {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-conf-')), 'conformance.db');
  return {
    name: 'sqlite',
    open: () => openStore(file),
    // A second connection, so a test can edit the database behind the store's back.
    raw: (sql) => { const h = new DatabaseSync(file); try { return h.prepare(sql).all(); } finally { h.close(); } },
  };
}

function postgres(connectionString) {
  const pool = new pg.Pool({ connectionString, max: 1 });
  return {
    name: 'postgres',
    open: () => openPgStore(connectionString, null),
    raw: async (sql) => (await pool.query(sql)).rows,
    cleanup: async () => {
      for (const sql of [
        `delete from threads where player_id like '${run}%'`,
        `delete from sessions where player_id like '${run}%'`,
        `delete from session_days where player_id like '${run}%'`,
        `delete from messages where thread like '%${run}%'`,
        `delete from friends where a like '${run}%' or b like '${run}%'`,
        `delete from auth where player_id like '${run}%'`,
        `delete from muted_threads where player_id like '${run}%'`,
        `delete from chat_themes where player_id like '${run}%'`,
        `delete from reset_tokens where player_id like '${run}%'`,
        `delete from accounts where player_id like '${run}%'`,
        `delete from houses where code like '${run}%'`,
        `delete from players where id like '${run}%'`,
      ]) await pool.query(sql).catch((err) => console.error('cleanup failed', err.message));
    },
    close: () => pool.end(),
  };
}

const pgUrl = process.env.TEST_DATABASE_URL;
const pgSkip = !pgUrl
  ? 'set TEST_DATABASE_URL to a test branch to run the Postgres store'
  : pgUrl === process.env.DATABASE_URL
    ? 'TEST_DATABASE_URL must not be DATABASE_URL: this suite writes and deletes rows'
    : null;
const impls = [sqlite(), ...(pgSkip ? [] : [postgres(pgUrl)])];

after(async () => {
  for (const impl of impls) {
    await impl.cleanup?.();
    await impl.close?.();
  }
});

for (const impl of impls) {
  const t = (name, fn) => test(`[${impl.name}] ${name}`, fn);
  const withStore = async (fn) => {
    const store = await impl.open();
    try { return await fn(store); } finally { await store.close(); }
  };

  t('exposes the whole storage interface', async () => {
    await withStore(async (s) => {
      for (const name of ['saveAll', 'syncCoins', 'addMessage', 'history', 'threadsWithImg', 'addSession', 'sessionsFor',
        'sessionDaysFor', 'sessionTotals', 'rollUpSessions', 'friends', 'setFriend',
        'deleteFriend', 'usernames', 'renameAccount', 'playerByUsername', 'playerByEmail', 'deleteHouse', 'findAccount', 'emailTaken',
        'hasAccount', 'createAccount', 'issueToken', 'playerForToken', 'revokeToken',
        'createResetToken', 'resetPassword', 'close',
        'ping', 'idle', 'chatThemes', 'setChatTheme', 'messageImages', 'pruneMessages', 'deleteAccount',
        'player', 'legacyRows']) {
        assert.equal(typeof s[name], 'function', `store.${name} is missing`);
      }
      assert.equal(typeof s.db.players, 'object');
      assert.equal(typeof s.db.houses, 'object');
    });
  });

  t('has applied every schema migration', async () => {
    const versions = (await impl.raw('select version from schema_migrations')).map((r) => r.version);
    for (const version of ['001-baseline', '002-indexes', '003-message-ids', '004-threads', '005-sessions', '006-retention']) {
      assert.ok(versions.includes(version), `${version} recorded`);
    }
    await withStore(() => {}); // opening again applies nothing twice
    assert.equal((await impl.raw('select version from schema_migrations')).length, versions.length);
  });

  t('players and houses survive a reopen', async () => {
    const p = id('p1'), code = id('HOUSE');
    await withStore(async (s) => {
      s.db.players[p] = { id: p, name: 'Mo', rooms: [{ wallpaper: 'plaster', floor: 'oak', furniture: [{ item: 'desk', x: 4, y: 4 }] }] };
      s.db.houses[code] = { code, members: [p], todos: [{ id: 1, text: 'read' }], chat: [] };
      await s.saveAll();
    });
    await withStore(async (s) => {
      assert.deepEqual(s.db.players[p].rooms[0].furniture, [{ item: 'desk', x: 4, y: 4 }]);
      assert.deepEqual(s.db.houses[code].members, [p]);
      assert.equal(s.db.houses[code].todos[0].text, 'read');
    });
  });

  t('a save writes only the rows that changed', async () => {
    const a = id('a'), b = id('b');
    await withStore(async (s) => {
      s.db.players[a] = { id: a, coins: 1 };
      s.db.players[b] = { id: b, coins: 2 };
      await s.saveAll();
      // Change b behind the store's back: if the next save rewrote b unchanged, this edit would be lost.
      await impl.raw(`update players set data = '{"id":"${b}","coins":99}' where id = '${b}'`);
      s.db.players[a].coins = 5;
      await s.saveAll();
    });
    await withStore(async (s) => {
      assert.equal(s.db.players[a].coins, 5);
      assert.equal(s.db.players[b].coins, 99, 'an untouched row was not rewritten');
    });
  });

  t('coins live in their own column, which wins over the saved copy', async () => {
    const p = id('coins');
    await withStore(async (s) => {
      await s.createAccount(p, id('Coins'), 'secret-password', null);
      s.db.players[p] = { id: p, name: 'Coins', coins: 42 };
      await s.saveAll();
    });
    assert.equal((await impl.raw(`select coins from accounts where player_id = '${p}'`))[0].coins, 42);
    await impl.raw(`update accounts set coins = 7 where player_id = '${p}'`);
    await withStore(async (s) => {
      assert.equal(s.db.players[p].coins, 7, 'the column wins on load');
      // Hand-edited again while running, and the game changes coins before noticing: the edit survives.
      await impl.raw(`update accounts set coins = 500 where player_id = '${p}'`);
      s.db.players[p].coins = 12;
      await s.saveAll();
      assert.equal((await impl.raw(`select coins from accounts where player_id = '${p}'`))[0].coins, 500);
      assert.deepEqual(await s.syncCoins(), [p], 'the edit is picked up instead');
      assert.equal(s.db.players[p].coins, 500);
      s.db.players[p].coins = 520;
      await s.saveAll();
      assert.equal((await impl.raw(`select coins from accounts where player_id = '${p}'`))[0].coins, 520);
    });
  });

  t('accounts: unique usernames and emails, login with either, tokens', async () => {
    const one = id('acct1'), two = id('acct2'), three = id('acct3');
    const name = id('Mona');
    await withStore(async (s) => {
      await s.createAccount(one, name, 'secret-password', `${one}@example.test`);
      assert.equal((await s.findAccount(name)).player_id, one);
      assert.equal((await s.findAccount(name.toUpperCase())).player_id, one, 'usernames ignore case');
      assert.equal((await s.findAccount(`${one}@example.test`)).player_id, one, 'email logs in too');
      assert.equal(await s.playerByUsername(name.toLowerCase()), one);
      assert.equal(await s.playerByUsername(id('nobody')), null);
      assert.ok(await s.emailTaken(`${one}@EXAMPLE.test`));
      await assert.rejects(async () => s.createAccount(two, name.toUpperCase(), 'other-password', `${two}@example.test`));
      await assert.rejects(async () => s.createAccount(three, id('Someone'), 'other-password', `${one}@EXAMPLE.test`));
      assert.ok(await s.hasAccount(one));
      assert.ok(!(await s.hasAccount(two)));
      const token = await s.issueToken(one);
      assert.equal(await s.playerForToken(token), one);
      assert.equal(await s.playerForToken('not-a-token'), null);
      assert.equal(await s.playerForToken(12345), null, 'a non-string token is never looked up');
      await s.revokeToken(token);
      assert.equal(await s.playerForToken(token), null, 'a revoked token signs nobody in');
    });
  });

  t('a reset token changes the password once, and only for its own account', async () => {
    const a = id('rst1'), b = id('rst2'), name = id('Reset'), email = `${a}@EXAMPLE.test`;
    await withStore(async (s) => {
      await s.createAccount(a, name, 'old-password-1', email);
      assert.equal(await s.playerByEmail(email.toLowerCase()), a, 'an address finds its account');
      assert.equal(await s.playerByEmail(id('nobody')), null);

      const token = await s.createResetToken(a);
      assert.ok(token.length >= 32);
      // Only the hash is stored: a leaked reset_tokens row must not be a usable link.
      const rows = await impl.raw(`select token from reset_tokens where player_id = '${a}'`);
      assert.equal(rows.length, 1);
      assert.notEqual(rows[0].token, token);

      // Asking again replaces the older link rather than leaving two live ones.
      const second = await s.createResetToken(a);
      assert.equal(await s.resetPassword(token, 'new-password-2'), null, 'the superseded link is dead');
      assert.equal(await s.resetPassword('not-a-token', 'new-password-2'), null);

      // A login token from before the reset, to prove a reset ends every session as part of itself.
      const session = await s.issueToken(a);
      assert.equal(await s.resetPassword(second, 'new-password-2'), a);
      assert.equal(await s.playerForToken(session), null, 'a stolen session stops working');

      // Single use, a token for someone with no account row resets nobody, and the password is the new one.
      assert.equal(await s.resetPassword(second, 'third-password-3'), null, 'a spent token is dead');
      assert.equal(await s.resetPassword(await s.createResetToken(b), 'new-password-2'), null, 'an account with no row resets nobody');
      const acct = await s.findAccount(name);
      assert.equal(checkPassword('new-password-2', acct.pass), true, 'the new password is the one that works');
      assert.equal(checkPassword('old-password-1', acct.pass), false, 'the old password is gone');
    });
  });

  t('expired reset links are dropped when the store opens', async () => {
    const p = id('rst-exp'), stale = `${p}-old`;
    await withStore(async () => {
      await impl.raw(`insert into reset_tokens (player_id, token, expires) values ('${p}', '${stale}', ${Date.now() - 1000})`);
      assert.equal((await impl.raw(`select 1 from reset_tokens where token = '${stale}'`)).length, 1, 'the row is there');
    });
    await withStore(async () => {
      assert.equal((await impl.raw(`select 1 from reset_tokens where token = '${stale}'`)).length, 0, 'the expired row went at boot');
    });
  });

  t('renaming an account changes the login, and cannot take someone else’s name', async () => {
    const a = id('ren1'), b = id('ren2'), first = id('First'), second = id('Second'), third = id('Third');
    await withStore(async (s) => {
      await s.createAccount(a, first, 'secret-password', null);
      await s.createAccount(b, second, 'secret-password', null);
      assert.equal(await s.renameAccount(a, third), true);
      assert.equal(await s.renameAccount(b, third), false, 'a taken name is refused');
      assert.equal((await s.findAccount(third)).player_id, a);
      assert.equal((await s.findAccount(first)), undefined, 'the old name no longer logs in');
    });
  });

  t('messages: paging, duplicate ids, replies and picture lookups', async () => {
    const thread = `h:${id('T')}`, other = `h:${id('U')}`, key = `chat/${run}/photo.jpg`;
    const at = (i) => messageBase + i;
    await withStore(async (s) => {
      for (let i = 1; i <= 120; i++) {
        await s.addMessage(thread, { id: at(i), from: id('Mo'), by: 'Mo', text: `m${i}`, at: i });
      }
      const page1 = await s.history(thread, Number.MAX_SAFE_INTEGER, 50);
      const page2 = await s.history(thread, page1[0].id, 50);
      const page3 = await s.history(thread, page2[0].id, 50);
      assert.deepEqual([page1.length, page2.length, page3.length], [50, 50, 20], 'newest page first, then back');
      assert.deepEqual([page1[0].text, page1.at(-1).text, page3[0].text, page3.at(-1).text], ['m71', 'm120', 'm1', 'm20']);
      assert.equal(page1[0].at, 71, 'timestamps come back as numbers');

      await s.addMessage(thread, { id: at(120), from: id('Mo'), by: 'Mo', text: 'duplicate', at: 121 });
      assert.equal((await s.history(thread, Number.MAX_SAFE_INTEGER, 50)).length, 50, 'a duplicate id is ignored');

      const reply = { id: at(500), from: id('Mo'), by: 'Mo', text: 're', at: 500, replyTo: String(at(120)), img: key };
      await s.addMessage(thread, reply);
      const [back] = (await s.history(thread, Number.MAX_SAFE_INTEGER, 1));
      assert.deepEqual(back, { id: at(500), from: id('Mo'), by: 'Mo', text: 're', at: 500, img: key, replyTo: String(at(120)) });
      assert.deepEqual(await s.threadsWithImg(key), [thread], 'the thread a file was sent in');
      assert.deepEqual(await s.threadsWithImg(`chat/${run}/never-sent.jpg`), [], 'an unsent upload is in no thread');
      assert.deepEqual(await s.history(other, Number.MAX_SAFE_INTEGER), [], 'another thread is unaffected');
    });
  });

  t('the newest message id is known, and the database can issue one', async () => {
    const thread = `h:${id('IDS')}`, from = id('Mo');
    await withStore(async (s) => {
      const newest = (await s.lastMessageId()) + 10;
      await s.addMessage(thread, { id: newest, from, by: 'Mo', text: 'explicit', at: 1 });
      assert.equal(await s.lastMessageId(), newest, 'a restart resumes from here, never earlier');
      await s.addMessage(thread, { id: newest, from, by: 'Mo', text: 'duplicate', at: 2 });
      assert.equal(await s.lastMessageId(), newest, 'a repeated id does not move it');
      // Leaving the id out: SQLite's integer primary key and Postgres' identity column both make one.
      await impl.raw(`insert into messages (thread, from_id, by_name, body, at) values ('${thread}', '${from}', 'Mo', 'auto', 3)`);
      const ids = (await s.history(thread, Number.MAX_SAFE_INTEGER, 5)).map((m) => m.id);
      assert.equal(ids.length, 2, 'both messages are stored');
      assert.ok(ids.every((x) => Number.isFinite(x) && x > 0));
      assert.ok((await s.lastMessageId()) >= newest, 'the newest id never goes backwards');
    });
  });

  t('the conversation list keeps the newest message per member', async () => {
    const a = id('la'), b = id('lb'), thread = `d:${a}|${b}`;
    const row = async (s, playerId) => (await s.threadsFor(playerId)).find((r) => r.thread === thread);
    await withStore(async (s) => {
      await s.touchThreads([
        { playerId: a, thread, lastId: 1, lastAt: 100, lastBy: 'A', lastBody: 'hi', lastImg: null },
        { playerId: b, thread, lastId: 1, lastAt: 100, lastBy: 'A', lastBody: 'hi', lastImg: null },
      ]);
      await s.touchThreads([{ playerId: a, thread, lastId: 2, lastAt: 200, lastBy: 'A', lastBody: 'again', lastImg: 'chat/a.jpg' }]);
      assert.deepEqual(await row(s, a), {
        playerId: a, thread, lastId: 2, lastAt: 200, lastBy: 'A', lastBody: 'again', lastImg: 'chat/a.jpg', seen: 0, mutedUntil: null,
      });
      assert.equal((await row(s, b)).lastId, 1, 'the other member keeps their own copy of the list');
    });
    await withStore(async (s) => {
      await s.touchThreads([{ playerId: a, thread: `h:${id('OLDER')}`, lastId: 3, lastAt: 50, lastBy: 'A', lastBody: 'older', lastImg: null }]);
      assert.deepEqual((await s.threadsFor(a)).map((r) => r.lastBody), ['again', 'older'], 'newest first, across a reopen');
    });
  });

  t('seeding the list from the rows never overwrites what it already knows', async () => {
    const p = id('sa'), q = id('sb'), code = id('SH');
    await withStore(async (s) => {
      s.db.players[p] = { id: p, dm: { [q]: [{ id: messageBase + 1, from: p, by: 'P', text: 'yo', at: 1 }] } };
      s.db.players[q] = { id: q, groups: { [id('g')]: { name: 'G', members: [q], msgs: [{ id: messageBase + 2, from: q, by: 'Q', text: 'hey', at: 2 }] } } };
      s.db.houses[code] = { code, members: [p], chat: [{ id: messageBase + 3, from: p, by: 'P', text: 'house', at: 3 }] };
      // The table already knows the house, newer than the row does.
      await s.touchThreads([{ playerId: p, thread: `h:${code}`, lastId: messageBase + 9, lastAt: 9, lastBy: 'P', lastBody: 'newer', lastImg: null }]);
      assert.equal(await s.seedThreads(), 3, 'the dm on both sides and the group are added; the house is already known');
      assert.deepEqual((await s.threadsFor(p)).map((r) => r.lastBody).sort(), ['newer', 'yo']);
      assert.deepEqual((await s.threadsFor(q)).map((r) => r.lastBody).sort(), ['hey', 'yo'], 'both sides of a private thread');
      assert.equal(await s.seedThreads(), 0, 'nothing to add on the next boot');
    });
  });

  t('the lines a client needs on connect come back per thread', async () => {
    const a = id('ta'), b = id('tb'), thread = `d:${a}|${b}`, house = `h:${id('TL')}`, empty = `h:${id('EMPTY')}`;
    await withStore(async (s) => {
      for (let i = 1; i <= 5; i++) await s.addMessage(thread, { id: msgId(), from: a, by: 'A', text: `line ${i}`, at: i });
      await s.addMessage(house, { id: msgId(), from: a, by: 'A', text: 'house line', at: 9 });
      const found = await s.tails([thread, house, empty], 3);
      assert.deepEqual(found[thread].map((m) => m.text), ['line 3', 'line 4', 'line 5'], 'the newest, oldest first');
      assert.deepEqual(found[house].map((m) => m.text), ['house line']);
      assert.ok(!(empty in found), 'a thread with no messages has no tail, not an empty one');
      // A reply quotes one message by id, and only from the thread it was sent in.
      const line = found[thread][0];
      assert.deepEqual(await s.messageIn(thread, line.id), line);
      assert.equal(await s.messageIn(house, line.id), null, 'a different thread has no such message');
      assert.equal(await s.messageIn(thread, msgSeq + 5000), null, 'an id nothing was sent with');
    });
  });

  t('a read mark moves forward and never invents a conversation', async () => {
    const a = id('ra'), b = id('rb'), thread = `d:${a}|${b}`;
    await withStore(async (s) => {
      const first = msgId();
      await s.addMessage(thread, { id: first, from: a, by: 'A', text: 'one', at: 1 });
      await s.touchThreads([{ playerId: a, thread, lastId: first, lastAt: 1, lastBy: 'A', lastBody: 'one', lastImg: null }]);
      await s.setThreadSeen(a, thread, first);
      await s.setThreadSeen(a, thread, first - 100); // older
      assert.equal((await s.threadsFor(a)).find((r) => r.thread === thread).seen, first, 'it never moves backwards');
      // A receipt for a thread this member has no row for changes nothing at all.
      await s.setThreadSeen(a, `d:${id('rx')}|${a}`, first);
      assert.equal((await s.threadsFor(a)).length, 1, 'no row appeared');
    });
  });

  t('a mute lives on the conversation list, even for a thread with no messages', async () => {
    const a = id('mua'), b = id('mub'), thread = `d:${a}|${b}`, silent = `g:${id('SILENT')}`;
    await withStore(async (s) => {
      const first = msgId();
      await s.addMessage(thread, { id: first, from: a, by: 'A', text: 'hi', at: 1 });
      await s.touchThreads([{ playerId: a, thread, lastId: first, lastAt: 1, lastBy: 'A', lastBody: 'hi', lastImg: null }]);
      await s.setThreadMute(a, thread, 0);
      assert.equal((await s.threadsFor(a)).find((r) => r.thread === thread).mutedUntil, 0, 'the list row keeps it');
      assert.ok((await s.threadMutes()).some((r) => r.playerId === a && r.thread === thread && r.until === 0));
      // Muting something never said in is kept too, without putting it in the list.
      await s.setThreadMute(a, silent, msgId());
      assert.ok(!(await s.threadsFor(a)).some((r) => r.thread === silent), 'no messages, no conversation');
      assert.ok((await s.threadMutes()).some((r) => r.playerId === a && r.thread === silent));
      await s.setThreadMute(a, silent, null);
      assert.ok(!(await s.threadMutes()).some((r) => r.playerId === a && r.thread === silent), 'unmuting clears it');
    });
  });

  t('study sessions are a log that rolls up into days', async () => {
    const a = id('sa'), b = id('sb'), nobody = id('sn');
    const day = 86_400_000, now = Date.now(), cutoff = now - 90 * day;
    const oldDay = Math.floor((now - 200 * day) / day) * day, oldA = oldDay + 3_600_000, oldB = oldDay + 7_200_000;
    await withStore(async (s) => {
      await s.addSession(a, { at: oldA, minutes: 30, tag: 'Maths' });
      await s.addSession(a, { at: oldB, minutes: 20, tag: 'Maths' });
      await s.addSession(a, { at: now - day, minutes: 25, tag: 'Reading' });
      await s.addSession(b, { at: now - day, minutes: 40, tag: 'Study', early: true });
      await s.addSession(a, { at: oldA, minutes: 30, tag: 'Maths' }); // the same session again: logged once
      assert.deepEqual(await s.sessionsFor(a, cutoff), [{ at: now - day, minutes: 25, tag: 'Reading' }], 'the window is the last 90 days');
      assert.deepEqual((await s.sessionsFor(b, cutoff))[0], { at: now - day, minutes: 40, tag: 'Study', early: true });
      assert.deepEqual(await s.sessionTotals(0, [a, b]), { [a]: 75, [b]: 40 }, 'all time counts the folded and the detailed');
      assert.deepEqual(await s.sessionTotals(cutoff, [a, b]), { [a]: 25, [b]: 40 }, 'this term counts the window');
      assert.deepEqual(await s.sessionTotals(0, [nobody]), {}, 'a player with no sessions');
      // Rolling up moves the detail out without losing a minute of it.
      assert.ok((await s.rollUpSessions(cutoff)) >= 1, 'a day row was written');
      assert.deepEqual((await s.sessionsFor(a, 0)).map((x) => x.minutes), [25], 'the old rows are gone from the log');
      assert.deepEqual(await s.sessionDaysFor(a), [{ at: oldDay, minutes: 50, tag: 'Maths', n: 2 }]);
      assert.deepEqual(await s.sessionTotals(0, [a, b]), { [a]: 75, [b]: 40 }, 'the total survives the roll-up');
      assert.equal(await s.rollUpSessions(cutoff), 0, 'a second pass finds nothing left');
    });
  });

  t('friends are saved, changed and removed', async () => {
    const a = id('fa'), b = id('fb'), c = id('fc');
    const mine = (list) => list.filter((f) => f.a === a || f.b === a);
    await withStore(async (s) => {
      await s.setFriend({ a, b, status: 'pending', asked_by: a, at: 1 });
      await s.setFriend({ a, b, status: 'accepted', asked_by: a, at: 2 });
      await s.setFriend({ a, b: c, status: 'pending', asked_by: c, at: 3 });
      assert.deepEqual(mine(await s.friends()).map((f) => `${f.b === a ? f.a : f.b}:${f.status}`).sort(),
        [`${b}:accepted`, `${c}:pending`]);
      assert.equal(mine(await s.friends()).find((f) => f.b === b).at, 2, 'a re-saved pair updates in place');
    });
    await withStore(async (s) => {
      assert.equal(mine(await s.friends()).length, 2, 'friendships survive a reopen');
      await s.deleteFriend(a, c);
      assert.deepEqual(mine(await s.friends()).map((f) => f.b), [b]);
    });
  });

  t('the database answers a readiness check', async () => {
    await withStore(async (s) => assert.ok(await s.ping(), 'ping answers while the database does'));
  });

  t('chat themes live in their own table', async () => {
    const p = id('theme');
    await withStore(async (s) => {
      s.db.players[p] = { id: p, name: 'Themes' };
      await s.saveAll();
      await s.setChatTheme(p, 'h:AAAAA', '#123456');
      await s.setChatTheme(p, 'h:BBBBB', '#abcdef');
      await s.setChatTheme(p, 'h:BBBBB', null); // picking the default colour removes the row
    });
    await withStore(async (s) => {
      assert.deepEqual((await s.chatThemes()).filter((t) => t.playerId === p),
        [{ playerId: p, thread: 'h:AAAAA', color: '#123456' }], 'kept across a reopen, a removal honoured');
    });
  });

  t('chat older than the cutoff is pruned and newer is kept', async () => {
    const thread = `h:${id('PRUNE')}`;
    await withStore(async (s) => {
      await s.addMessage(thread, { id: msgId(), from: 'x', by: 'X', text: 'old', at: 1000 });
      await s.addMessage(thread, { id: msgId(), from: 'x', by: 'X', text: 'new', at: 9000 });
      await s.addMessage(thread, { id: msgId(), from: 'x', by: 'X', text: 'pic', img: `chat/${id('pic')}.jpg`, at: 1500 });
      assert.ok((await s.messageImages(5000)).includes(`chat/${id('pic')}.jpg`), 'the picture is reported so it can be deleted with its message');
      // The suite shares one database, so this counts every row older than the cutoff, not just this thread's.
      assert.ok(await s.pruneMessages(5000) >= 2, 'the old lines went');
      assert.deepEqual((await s.history(thread, 1e18)).map((m) => m.text), ['new'], 'the new one stayed');
    });
  });

  t('deleting an account removes every row that belongs to it', async () => {
    const p = id('acctdel'), friend = id('acctkeep'), code = id('ACCTDEL');
    const thread = `d:${[p, friend].sort().join('|')}`;
    await withStore(async (s) => {
      await s.createAccount(p, id('Deleter'), 'secret-password', `${p}@example.test`);
      s.db.players[p] = { id: p, name: 'Deleter' };
      s.db.players[friend] = { id: friend, name: 'Friend' };
      s.db.houses[code] = { code, owner: p, members: [p, friend], todos: [] };
      await s.saveAll();
      await s.touchThreads([{ playerId: p, thread, lastId: 1, lastAt: 1, lastBy: 'D', lastBody: 'hi', lastImg: null }]);
      await s.setChatTheme(p, thread, '#111111');
      await s.setThreadMute(p, thread, 0);
      await s.addSession(p, { at: 10, minutes: 5, tag: 'Maths' });
      await s.setFriend({ a: [p, friend].sort()[0], b: [p, friend].sort()[1], status: 'accepted', asked_by: p, at: 1 });
      await s.addMessage(thread, { id: msgId(), from: p, by: 'D', text: 'mine', at: 1 });
      await s.deleteAccount(p);
    });
    assert.equal((await impl.raw(`select id from players where id = '${p}'`)).length, 0, 'the player row is gone');
    assert.equal((await impl.raw(`select code from houses where code = '${code}'`)).length, 0, 'the house they owned is gone');
    assert.equal((await impl.raw(`select player_id from accounts where player_id = '${p}'`)).length, 0);
    assert.equal((await impl.raw(`select thread from threads where player_id = '${p}'`)).length, 0);
    assert.equal((await impl.raw(`select thread from chat_themes where player_id = '${p}'`)).length, 0);
    assert.equal((await impl.raw(`select player_id from sessions where player_id = '${p}'`)).length, 0);
    assert.equal((await impl.raw(`select a from friends where a = '${p}' or b = '${p}'`)).length, 0);
    assert.equal((await impl.raw(`select id from messages where from_id = '${p}'`)).length, 0, 'the lines they wrote are gone');
    assert.equal((await impl.raw(`select id from players where id = '${friend}'`)).length, 1, 'the friend is untouched');
  });

  t('a deleted house stays deleted', async () => {
    const p = id('del'), code = id('GONE');
    await withStore(async (s) => {
      s.db.houses[code] = { code, owner: p, members: [p], todos: [], chat: [] };
      await s.saveAll();
      await s.deleteHouse(code);
      delete s.db.houses[code];
      await s.saveAll();
    });
    await withStore(async (s) => {
      assert.equal(s.db.houses[code], undefined);
    });
  });
}

if (pgSkip) test('[postgres] storage conformance', { skip: pgSkip }, () => {});
