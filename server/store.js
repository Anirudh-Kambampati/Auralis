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
  `);
  // Email arrived after the first accounts, so add it to older databases too.
  if (!sql.prepare("select 1 from pragma_table_info('accounts') where name = 'email'").get()) sql.exec('alter table accounts add column email text');
  sql.exec('create unique index if not exists accounts_email on accounts (lower(email)) where email is not null');

  const db = { players: {}, houses: {} };
  for (const r of sql.prepare('select id, data from players').all()) db.players[r.id] = JSON.parse(r.data);
  for (const r of sql.prepare('select code, data from houses').all()) db.houses[r.code] = JSON.parse(r.data);

  const upsertPlayer = sql.prepare('insert into players (id, data) values (?, ?) on conflict(id) do update set data = excluded.data');
  const upsertHouse = sql.prepare('insert into houses (code, data) values (?, ?) on conflict(code) do update set data = excluded.data');

  // shortcut: rewrites every row in one transaction; fine for hundreds of players, track dirty rows beyond that.
  function saveAll() {
    sql.exec('begin');
    try {
      for (const p of Object.values(db.players)) upsertPlayer.run(p.id, JSON.stringify(p));
      for (const h of Object.values(db.houses)) upsertHouse.run(h.code, JSON.stringify(h));
      sql.exec('commit');
    } catch (err) {
      sql.exec('rollback');
      console.error('save failed', err);
    }
  }

  // One-time import of the old data.json save, kept as data.json.imported.
  if (!Object.keys(db.players).length && legacyJsonFile && fs.existsSync(legacyJsonFile)) {
    const old = JSON.parse(fs.readFileSync(legacyJsonFile, 'utf8'));
    Object.assign(db.players, old.players ?? {});
    Object.assign(db.houses, old.houses ?? {});
    saveAll();
    fs.renameSync(legacyJsonFile, `${legacyJsonFile}.imported`);
  }

  return {
    db,
    saveAll,
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
