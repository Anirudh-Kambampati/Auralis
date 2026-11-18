// Durable storage (SQLite, built into Node) and accounts.
// Game state stays in memory for speed; each player and house is saved as one JSON row.
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { migrateSqlite } from './schema.js';

const TOKEN_DAYS = 30;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  return `${salt.toString('hex')}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

export function checkPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const got = crypto.scryptSync(password, Buffer.from(salt, 'hex'), 64);
  const want = Buffer.from(hash, 'hex');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

// Every chat message lives in the messages table, keyed by its conversation ("thread"):
// h:<house code>, d:<player id>|<player id> (sorted, so both sides share it), or g:<group id>.
export const dmThread = (a, b) => `d:${[a, b].sort().join('|')}`;
// Messages already kept in the player and house rows (the newest 50 of each), for the first move into the table.
export function* savedMessages(db) {
  for (const h of Object.values(db.houses)) for (const m of h.chat ?? []) yield [`h:${h.code}`, m];
  for (const p of Object.values(db.players)) {
    for (const [peer, list] of Object.entries(p.dm ?? {})) for (const m of list) yield [dmThread(p.id, peer), m];
    for (const [gid, g] of Object.entries(p.groups ?? {})) for (const m of g.msgs ?? []) yield [`g:${gid}`, m];
  }
}
// A short fingerprint of a row's JSON, so a save can tell whether a row changed without keeping a
// second copy of it. The world already lives in memory; a copy of every row in the save cache is
// what ran the server out of heap. Two accumulators plus the length make a false "unchanged" unlikely.
export function fingerprint(json) {
  let a = 0x811c9dc5, b = 0x1000193;
  for (let i = 0; i < json.length; i++) {
    const c = json.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b + c, 0x85ebca6b);
  }
  return `${json.length}:${(a >>> 0).toString(36)}:${(b >>> 0).toString(36)}`;
}

// Players and houses whose JSON differs from the fingerprint last written: [key, object, json, fingerprint].
// A generator, so a row that did not change drops its JSON right away instead of holding the whole
// world as strings for the length of a save.
export function* changedRows(db, lastSaved) {
  for (const p of Object.values(db.players)) {
    const json = JSON.stringify(p), fp = fingerprint(json);
    if (lastSaved.get(`p:${p.id}`) !== fp) yield [`p:${p.id}`, p, json, fp];
  }
  for (const h of Object.values(db.houses)) {
    const json = JSON.stringify(h), fp = fingerprint(json);
    if (lastSaved.get(`h:${h.code}`) !== fp) yield [`h:${h.code}`, h, json, fp];
  }
}
export const rowMessage = (r) => ({ id: Number(r.id), from: r.from_id, by: r.by_name, text: r.body, at: Number(r.at), ...(r.img && { img: r.img }), ...(r.reply_to ? { replyTo: r.reply_to } : {}) });
// A study session from the log, or a rolled-up day: `at` is the day's start and `n` how many sessions it holds.
export const sessionRow = (r) => ({ at: Number(r.at), minutes: Number(r.minutes), tag: r.tag ?? 'Study', ...(r.early ? { early: true } : {}) });
export const threadRow = (r) => ({
  playerId: r.player_id,
  thread: r.thread,
  lastId: r.last_id == null ? null : Number(r.last_id),
  lastAt: r.last_at == null ? 0 : Number(r.last_at),
  lastBy: r.last_by ?? '',
  lastBody: r.last_body ?? '',
  lastImg: r.last_img ?? null,
  seen: Number(r.seen ?? 0),
  mutedUntil: r.muted_until == null ? null : Number(r.muted_until),
});

// The conversation list a world implies: one row per member per thread, built from the chat the player
// and house rows still carry. Used once per database, to seed `threads` before anything writes to it.
export function threadRowsFromWorld(db) {
  const out = new Map();
  const add = (playerId, thread, msg) => {
    if (!playerId || !msg) return;
    out.set(`${playerId}|${thread}`, {
      playerId, thread, lastId: msg.id, lastAt: msg.at ?? 0, lastBy: msg.by ?? '', lastBody: msg.text ?? '', lastImg: msg.img ?? null,
    });
  };
  for (const h of Object.values(db.houses)) for (const id of h.members ?? []) add(id, `h:${h.code}`, h.chat?.at(-1));
  for (const p of Object.values(db.players)) {
    for (const [peer, msgs] of Object.entries(p.dm ?? {})) {
      const thread = dmThread(p.id, peer);
      add(p.id, thread, msgs.at(-1));
      add(peer, thread, msgs.at(-1));
    }
    for (const [gid, g] of Object.entries(p.groups ?? {})) for (const id of g.members ?? [p.id]) add(id, `g:${gid}`, g.msgs?.at(-1));
  }
  return [...out.values()];
}

export function openStore(file, legacyJsonFile) {
  const sql = new DatabaseSync(file);
  sql.exec('pragma journal_mode = wal');
  // The shape lives in server/schema.js, shared with the Postgres store: same tables, same indexes,
  // rendered for this dialect and applied once through schema_migrations.
  migrateSqlite(sql);
  // One row per member per conversation: the newest message and what they have read.
  const upsertThread = sql.prepare(`insert into threads (player_id, thread, last_id, last_at, last_by, last_body, last_img, seen)
    values (?, ?, ?, ?, ?, ?, ?, 0)
    on conflict (player_id, thread) do update set last_id = excluded.last_id, last_at = excluded.last_at,
      last_by = excluded.last_by, last_body = excluded.last_body, last_img = excluded.last_img`);
  const touchThreads = (rows) => {
    for (const r of rows) upsertThread.run(r.playerId, r.thread, r.lastId, r.lastAt, r.lastBy, r.lastBody, r.lastImg);
    return rows.length;
  };
  // Seeding never overwrites: a conversation the table already knows is left exactly as it is.
  const seedThread = sql.prepare(`insert into threads (player_id, thread, last_id, last_at, last_by, last_body, last_img, seen)
    values (?, ?, ?, ?, ?, ?, ?, 0) on conflict (player_id, thread) do nothing`);
  // Rolled-up days accumulate: a later pass for the same day adds to it rather than replacing it.
  const upsertSessionDay = sql.prepare(`insert into session_days (player_id, day, tag, minutes, sessions) values (?, ?, ?, ?, ?)
    on conflict (player_id, day, tag) do update set minutes = session_days.minutes + excluded.minutes,
      sessions = session_days.sessions + excluded.sessions`);

  const db = { players: {}, houses: {} };
  for (const r of sql.prepare('select id, data from players').all()) db.players[r.id] = JSON.parse(r.data);
  for (const r of sql.prepare('select code, data from houses').all()) db.houses[r.code] = JSON.parse(r.data);
  // Load muted threads
  for (const r of sql.prepare('select player_id, thread, until from muted_threads').all()) {
    const p = db.players[r.player_id];
    if (p) { p.mutedThreads = p.mutedThreads ?? {}; p.mutedThreads[r.thread] = r.until; }
  }
  // Load chat themes
  for (const r of sql.prepare('select player_id, thread, color from chat_themes').all()) {
    const p = db.players[r.player_id];
    if (p) { p.chatThemes = p.chatThemes ?? {}; p.chatThemes[r.thread] = r.color; }
  }
  // The coins value last written per player, so a value that differs was edited in the database by hand.
  const written = {};
  const readCoins = sql.prepare('select player_id, coins from accounts where coins is not null');
  for (const r of readCoins.all()) {
    if (db.players[r.player_id]) db.players[r.player_id].coins = written[r.player_id] = r.coins;
  }

  sql.prepare('delete from auth where expires < ?').run(Date.now()); // expired sign-ins
  const upsertPlayer = sql.prepare('insert into players (id, data) values (?, ?) on conflict(id) do update set data = excluded.data');
  const upsertHouse = sql.prepare('insert into houses (code, data) values (?, ?) on conflict(code) do update set data = excluded.data');
  // Only overwrite coins nobody edited by hand since our last write; syncCoins picks those edits up instead.
  const saveCoins = sql.prepare('update accounts set coins = ? where player_id = ? and coins is ?');

  // Only rows that changed since they were last written go to the database.
  const lastSaved = new Map(); // 'p:<id>' / 'h:<code>' -> fingerprint of the JSON last written
  function saveAll() {
    const wrote = [], marks = [];
    sql.exec('begin');
    try {
      for (const [k, obj, json, fp] of changedRows(db, lastSaved)) {
        if (k[0] === 'h') upsertHouse.run(obj.code, json);
        else {
          upsertPlayer.run(obj.id, json);
          const c = obj.coins ?? null;
          if (c !== (written[obj.id] ?? null) && saveCoins.run(c, obj.id, written[obj.id] ?? null).changes) wrote.push([obj.id, c]);
        }
        marks.push([k, fp]);
      }
      sql.exec('commit');
      for (const [id, c] of wrote) written[id] = c;
      for (const [k, fp] of marks) lastSaved.set(k, fp);
    } catch (err) {
      sql.exec('rollback');
      console.error('save failed', err);
    }
  }

  // Applies coins edited straight in the database while the server runs; returns the players whose coins changed.
  function syncCoins() {
    const changed = [];
    for (const r of readCoins.all()) {
      const p = db.players[r.player_id];
      if (!p || r.coins === written[r.player_id]) continue;
      p.coins = written[r.player_id] = r.coins;
      changed.push(p.id);
    }
    return changed;
  }

  // One-time import of the old data.json save, kept as data.json.imported.
  if (!Object.keys(db.players).length && legacyJsonFile && fs.existsSync(legacyJsonFile)) {
    const old = JSON.parse(fs.readFileSync(legacyJsonFile, 'utf8'));
    Object.assign(db.players, old.players ?? {});
    Object.assign(db.houses, old.houses ?? {});
    saveAll();
    fs.renameSync(legacyJsonFile, `${legacyJsonFile}.imported`);
  }

  const addMsg = sql.prepare('insert or ignore into messages (id, thread, from_id, by_name, body, img, reply_to, at) values (?, ?, ?, ?, ?, ?, ?, ?)');
  const addMessage = (thread, m) => addMsg.run(m.id, thread, m.from ?? '', m.by ?? '', m.text ?? '', m.img ?? null, m.replyTo ?? null, m.at ?? 0);
  // First run with the messages table: copy in the chat history the rows already hold.
  if (!sql.prepare('select 1 from messages limit 1').get()) {
    sql.exec('begin');
    for (const [thread, m] of savedMessages(db)) addMessage(thread, m);
    sql.exec('commit');
  }
  const olderMsgs = sql.prepare('select * from messages where thread = ? and id < ? order by id desc limit ?');

  return {
    db,
    saveAll,
    syncCoins,
    addMessage,
    // The newest id in the archive: a restart resumes its message counter after it, never before it.
    lastMessageId: () => Number(sql.prepare('select max(id) as id from messages').get()?.id ?? 0),
    touchThreads,
    // My conversation list, newest first. History itself is in `messages`; this is the cheap index.
    threadsFor: (playerId) => sql.prepare('select * from threads where player_id = ? and last_id is not null order by last_at desc').all(playerId).map(threadRow),
    // Fills in the conversations the list is missing, from the chat the rows still carry. Runs on every
    // boot; once the rows stop carrying chat (and every conversation is in the table) it adds nothing.
    seedThreads: () => threadRowsFromWorld(db)
      .reduce((n, r) => n + (seedThread.run(r.playerId, r.thread, r.lastId, r.lastAt, r.lastBy, r.lastBody, r.lastImg).changes ? 1 : 0), 0),
    // Up to `limit` messages of a thread from before message `before`, oldest first.
    history: (thread, before, limit = 50) => olderMsgs.all(thread, before, limit).reverse().map(rowMessage),
    // The newest `limit` messages of each of these threads, oldest first: what a client needs on connect.
    tails: (threads, limit = 50) => {
      if (!threads.length) return {};
      const rows = sql.prepare(`select * from messages where id in (
        select id from (select id, row_number() over (partition by thread order by id desc) rn
          from messages where thread in (${threads.map(() => '?').join(',')})) where rn <= ?
      ) order by id`).all(...threads, limit);
      return rows.reduce((out, r) => ((out[r.thread] ??= []).push(rowMessage(r)), out), {});
    },
    // One message of a thread, by id: what a reply quotes.
    messageIn: (thread, id) => {
      const r = sql.prepare('select * from messages where thread = ? and id = ?').get(thread, id);
      return r ? rowMessage(r) : null;
    },
    // The study log: appended once, never updated (the unique index makes a repeated append a no-op).
    addSession: (playerId, s) => sql.prepare('insert or ignore into sessions (player_id, at, minutes, tag, early) values (?, ?, ?, ?, ?)')
      .run(playerId, s.at, s.minutes, s.tag ?? 'Study', s.early ? 1 : 0),
    // The detail the stats panel shows: everything inside the roll-up window, oldest first.
    sessionsFor: (playerId, since) => sql.prepare('select * from sessions where player_id = ? and at >= ? order by at')
      .all(playerId, since).map(sessionRow),
    // The days already folded up, as the panel needs them: one entry per day and subject.
    sessionDaysFor: (playerId) => sql.prepare('select * from session_days where player_id = ? order by day').all(playerId)
      .map((r) => ({ at: Number(r.day), minutes: Number(r.minutes), tag: r.tag, n: Number(r.sessions) })),
    // Minutes per player since `since` (0 for all time), from the log and the roll-up together.
    // `playerIds` null means everyone, which is what the 'all' leaderboard asks for.
    sessionTotals: (since, playerIds = null) => {
      const filter = playerIds ? ` and player_id in (${playerIds.map(() => '?').join(',')})` : '';
      const args = playerIds ? [...playerIds] : [];
      const rows = sql.prepare(`select player_id, sum(minutes) as minutes from (
        select player_id, minutes, at as at from sessions where 1 = 1${filter}
        union all
        select player_id, minutes, day as at from session_days where 1 = 1${filter}
      ) where at >= ? group by player_id`).all(...args, ...args, since);
      return Object.fromEntries(rows.map((r) => [r.player_id, Number(r.minutes)]));
    },
    // Folds sessions older than `cutoff` into the day roll-up in one transaction; returns day rows written.
    rollUpSessions: (cutoff) => {
      const rows = sql.prepare('select player_id, at, minutes, tag from sessions where at < ?').all(cutoff);
      if (!rows.length) return 0;
      const groups = new Map();
      for (const r of rows) {
        const day = Math.floor(r.at / 86_400_000) * 86_400_000, tag = r.tag ?? 'Study';
        const key = `${r.player_id}\u0000${day}\u0000${tag}`;
        const g = groups.get(key) ?? { playerId: r.player_id, day, tag, minutes: 0, n: 0 };
        g.minutes += Number(r.minutes);
        g.n++;
        groups.set(key, g);
      }
      sql.exec('begin');
      try {
        for (const g of groups.values()) upsertSessionDay.run(g.playerId, g.day, g.tag, g.minutes, g.n);
        sql.prepare('delete from sessions where at < ?').run(cutoff);
        sql.exec('commit');
      } catch (err) {
        sql.exec('rollback');
        throw err;
      }
      return groups.size;
    },
    // Every member who has muted a conversation, so a message to someone offline can be held back.
    threadMutes: () => sql.prepare('select player_id, thread, muted_until from threads where muted_until is not null').all()
      .map((r) => ({ playerId: r.player_id, thread: r.thread, until: Number(r.muted_until) })),
    // How far this member has read; it never moves backwards.
    setThreadSeen: (playerId, thread, id) => sql.prepare('update threads set seen = max(coalesce(seen, 0), ?) where player_id = ? and thread = ?')
      .run(id, playerId, thread).changes,
    // A mute is kept even before the thread has a message: `last_id` stays empty, so it is never in anyone's list.
    setThreadMute: (playerId, thread, until) => sql.prepare(`insert into threads (player_id, thread, muted_until) values (?, ?, ?)
      on conflict (player_id, thread) do update set muted_until = excluded.muted_until`).run(playerId, thread, until),
    clearMutedThreads: () => sql.prepare('delete from muted_threads').run(),
    // Readiness: the cheapest query that proves the database answers at all.
    ping: () => !!sql.prepare('select 1 as ok').get()?.ok,
    // Nothing is in flight for a synchronous save, so a shutdown waits for nothing.
    idle: () => Promise.resolve(),
    // Every chat theme, for the one read at boot (the live copy is in memory, per player).
    chatThemes: () => sql.prepare('select player_id, thread, color from chat_themes').all()
      .map((r) => ({ playerId: r.player_id, thread: r.thread, color: r.color })),
    // Retention: the files carried by messages about to be pruned, so they can be deleted from the bucket
    // rather than left behind once no row refers to them.
    messageImages: (before) => sql.prepare('select distinct img from messages where at < ? and img is not null').all(before).map((r) => r.img),
    // Retention: drops messages older than `before`, returning how many went.
    pruneMessages: (before) => sql.prepare('delete from messages where at < ?').run(before).changes,
    // Everything one account owns, in one transaction: the player, the house they own, their sign-in,
    // their conversations, study log and chat settings, and the lines they wrote.
    deleteAccount: (playerId) => {
      sql.exec('begin');
      try {
        sql.prepare('delete from messages where from_id = ?').run(playerId);
        for (const table of ['threads', 'chat_themes', 'sessions', 'session_days', 'auth', 'reset_tokens']) {
          sql.prepare(`delete from ${table} where player_id = ?`).run(playerId);
        }
        sql.prepare('delete from accounts where player_id = ?').run(playerId);
        sql.prepare('delete from friends where a = ? or b = ?').run(playerId, playerId);
        sql.prepare("delete from houses where json_extract(data, '$.owner') = ?").run(playerId);
        sql.prepare('delete from players where id = ?').run(playerId);
        sql.exec('commit');
        return true;
      } catch (err) {
        sql.exec('rollback');
        throw err;
      }
    },
    // The conversations a picture or file was sent in (empty: never sent, so it can go).
    threadsWithImg: (key) => sql.prepare('select distinct thread from messages where img = ?').all(String(key)).map((r) => r.thread),
    friends: () => sql.prepare('select a, b, status, asked_by, at from friends').all().map((r) => ({ ...r, at: Number(r.at) })),
    setFriend: (f) => sql.prepare('insert into friends (a, b, status, asked_by, at) values (?, ?, ?, ?, ?) on conflict(a, b) do update set status = excluded.status, asked_by = excluded.asked_by, at = excluded.at')
      .run(f.a, f.b, f.status, f.asked_by, f.at),
    deleteFriend: (a, b) => sql.prepare('delete from friends where a = ? and b = ?').run(a, b),
    usernames: () => sql.prepare('select player_id, username from accounts').all(),
    // Your name is your username: renaming changes how you log in. False if someone else has it.
    renameAccount: (playerId, name) => {
      try { return sql.prepare('update accounts set username = ? where player_id = ?').run(String(name), playerId).changes > 0; } catch { return false; }
    },
    playerByUsername: (name) => sql.prepare('select player_id from accounts where lower(username) = lower(?)').get(String(name))?.player_id ?? null,
    deleteHouse: (code) => sql.prepare('delete from houses where code = ?').run(code),
    // Log in with either the username or the email.
    findAccount: (login) => sql.prepare('select player_id, username, pass from accounts where lower(username) = lower(?) or lower(email) = lower(?)').get(login, login),
    emailTaken: (email) => !!sql.prepare('select 1 from accounts where lower(email) = lower(?)').get(email),
    hasAccount: (playerId) => !!sql.prepare('select 1 from accounts where player_id = ?').get(playerId),
    createAccount: (playerId, username, password, email) =>
      sql.prepare('insert into accounts (player_id, username, pass, created, email) values (?, ?, ?, ?, ?)').run(playerId, username, hashPassword(password), Date.now(), email),
    // Only a hash of each login token is stored, so a leaked database can't be used to sign in.
    issueToken(playerId) {
      const token = crypto.randomBytes(32).toString('base64url');
      sql.prepare('insert into auth (token, player_id, expires) values (?, ?, ?)').run(sha(token), playerId, Date.now() + TOKEN_DAYS * 86_400_000);
      return token;
    },
    playerForToken(token) {
      if (typeof token !== 'string' || token.length > 100) return null;
      const row = sql.prepare('select player_id, expires from auth where token = ?').get(sha(token));
      return row && row.expires > Date.now() ? row.player_id : null;
    },
    setPassword: (playerId, password) => {
        const hashed = hashPassword(password);
        return sql.prepare('update accounts set pass = ? where player_id = ?').run(hashed, playerId).changes > 0;
      },
// Create a password reset token (valid for 1 hour)
      createResetToken: (playerId, token, expires) => {
        return sql.prepare('insert or replace into reset_tokens (player_id, token, expires) values (?, ?, ?)').run(playerId, token, expires).changes > 0;
      },
      // Reset password using a valid token
      resetPassword: (token, newPassword) => {
        const row = sql.prepare('select player_id, expires from reset_tokens where token = ?').get(token);
        if (!row || row.expires < Date.now()) return false;
        const ok = sql.prepare('update accounts set pass = ? where player_id = ?').run(hashPassword(newPassword), row.player_id).changes > 0;
        if (ok) sql.prepare('delete from reset_tokens where token = ?').run(token);
        return ok;
      },
      setPassword: (playerId, password) => {
        const hashed = hashPassword(password);
        return sql.prepare('update accounts set pass = ? where player_id = ?').run(hashed, playerId).changes > 0;
      },
      revokeToken: (token) => sql.prepare('delete from auth where token = ?').run(sha(String(token))),
      // Chat theme per user
      setChatTheme: (playerId, thread, color) => {
        if (!color) {
          return sql.prepare('delete from chat_themes where player_id = ? and thread = ?').run(playerId, thread).changes > 0;
        }
        return sql.prepare('insert into chat_themes (player_id, thread, color) values (?, ?, ?) on conflict(player_id, thread) do update set color = excluded.color')
          .run(playerId, thread, color).changes > 0;
      },
      getChatThemes: (playerId) => sql.prepare('select thread, color from chat_themes where player_id = ?').all(playerId).map(r => ({ thread: r.thread, color: r.color })),
      close: () => sql.close(),
  };
}
