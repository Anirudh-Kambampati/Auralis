// Durable storage (SQLite, built into Node) and accounts.
// Game state stays in memory for speed; each player and house is saved as one JSON row.
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';

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
// Players and houses whose JSON differs from what was last written: [key, object, json].
export function changedRows(db, lastJson) {
  const out = [];
  for (const p of Object.values(db.players)) { const j = JSON.stringify(p); if (lastJson.get(`p:${p.id}`) !== j) out.push([`p:${p.id}`, p, j]); }
  for (const h of Object.values(db.houses)) { const j = JSON.stringify(h); if (lastJson.get(`h:${h.code}`) !== j) out.push([`h:${h.code}`, h, j]); }
  return out;
}
export const rowMessage = (r) => ({ id: Number(r.id), from: r.from_id, by: r.by_name, text: r.body, at: Number(r.at), ...(r.img && { img: r.img }) });

export function openStore(file, legacyJsonFile) {
  const sql = new DatabaseSync(file);
  sql.exec(`
    pragma journal_mode = wal;
    create table if not exists players (id text primary key, data text not null);
    create table if not exists houses (code text primary key, data text not null);
    create table if not exists accounts (
      player_id text primary key,
      username text not null collate nocase unique,
      pass text not null,
      created integer not null
    );
    create table if not exists auth (token text primary key, player_id text not null, expires integer not null);
    create table if not exists messages (id integer primary key, thread text not null, from_id text not null, by_name text not null, body text not null, img text, at integer not null);
    create index if not exists messages_thread on messages (thread, id);
    create index if not exists auth_player on auth (player_id);
    create index if not exists messages_img on messages (img) where img is not null;
    -- One row per pair of players (a < b): 'pending' (asked_by sent the request) or 'accepted'.
    create table if not exists friends (a text not null, b text not null, status text not null, asked_by text not null, at integer not null, primary key (a, b));
  `);
  // Email arrived after the first accounts, so add it to older databases too.
  if (!sql.prepare("select 1 from pragma_table_info('accounts') where name = 'email'").get()) sql.exec('alter table accounts add column email text');
  sql.exec('create unique index if not exists accounts_email on accounts (lower(email)) where email is not null');
  // An account's coins live in their own column; it wins over the copy in the player's JSON.
  if (!sql.prepare("select 1 from pragma_table_info('accounts') where name = 'coins'").get()) sql.exec('alter table accounts add column coins integer');

  const db = { players: {}, houses: {} };
  for (const r of sql.prepare('select id, data from players').all()) db.players[r.id] = JSON.parse(r.data);
  for (const r of sql.prepare('select code, data from houses').all()) db.houses[r.code] = JSON.parse(r.data);
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
  const lastJson = new Map(); // 'p:<id>' / 'h:<code>' -> JSON last written
  function saveAll() {
    const wrote = [], rows = changedRows(db, lastJson);
    sql.exec('begin');
    try {
      for (const [k, obj, json] of rows) {
        if (k[0] === 'h') { upsertHouse.run(obj.code, json); continue; }
        upsertPlayer.run(obj.id, json);
        const c = obj.coins ?? null;
        if (c !== (written[obj.id] ?? null) && saveCoins.run(c, obj.id, written[obj.id] ?? null).changes) wrote.push([obj.id, c]);
      }
      sql.exec('commit');
      for (const [id, c] of wrote) written[id] = c;
      for (const [k, , json] of rows) lastJson.set(k, json);
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

  const addMsg = sql.prepare('insert or ignore into messages (id, thread, from_id, by_name, body, img, at) values (?, ?, ?, ?, ?, ?, ?)');
  const addMessage = (thread, m) => addMsg.run(m.id, thread, m.from ?? '', m.by ?? '', m.text ?? '', m.img ?? null, m.at ?? 0);
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
    // Up to `limit` messages of a thread from before message `before`, oldest first.
    history: (thread, before, limit = 50) => olderMsgs.all(thread, before, limit).reverse().map(rowMessage),
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
    playerByUsername: (name) => sql.prepare('select player_id from accounts where username = ?').get(String(name))?.player_id ?? null,
    deleteHouse: (code) => sql.prepare('delete from houses where code = ?').run(code),
    // Log in with either the username or the email.
    findAccount: (login) => sql.prepare('select player_id, username, pass from accounts where username = ? or lower(email) = lower(?)').get(login, login),
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
    revokeToken: (token) => sql.prepare('delete from auth where token = ?').run(sha(String(token))),
    close: () => sql.close(),
  };
}
