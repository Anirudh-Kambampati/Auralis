// Postgres storage (e.g. Neon), same shape as the SQLite store in store.js but async.
// Game state stays in memory; each player and house is saved as one JSONB row.
import pg from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { hashPassword } from './store.js';

const TOKEN_DAYS = 30;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

export async function openPgStore(url, legacyJsonFile) {
  // Neon URLs say sslmode=require; spell out verify-full (what pg does today) so certificates stay checked after pg v9.
  const pool = new pg.Pool({ connectionString: url.replace(/sslmode=(require|prefer|verify-ca)/, 'sslmode=verify-full'), max: 5 });
  await pool.query(`
    create table if not exists players (id text primary key, data jsonb not null);
    create table if not exists houses (code text primary key, data jsonb not null);
    create table if not exists accounts (player_id text primary key, username text not null, pass text not null, created bigint not null);
    create unique index if not exists accounts_username on accounts (lower(username));
    create table if not exists auth (token text primary key, player_id text not null, expires bigint not null);
    alter table accounts add column if not exists email text;
    create unique index if not exists accounts_email on accounts (lower(email)) where email is not null;
    alter table accounts add column if not exists coins integer;
  `);

  const db = { players: {}, houses: {} };
  for (const r of (await pool.query('select id, data from players')).rows) db.players[r.id] = r.data;
  for (const r of (await pool.query('select code, data from houses')).rows) db.houses[r.code] = r.data;
  // An account's coins live in their own column; it wins over the copy in the player's JSON.
  // written: the coins value last written per player, so a value that differs was edited in the database by hand.
  const written = {};
  const readCoins = 'select player_id, coins from accounts where coins is not null';
  for (const r of (await pool.query(readCoins)).rows) {
    if (db.players[r.player_id]) db.players[r.player_id].coins = written[r.player_id] = r.coins;
  }

  // Saves run one at a time so an older snapshot never lands after a newer one.
  let queue = Promise.resolve();
  function saveAll() {
    const players = Object.values(db.players), houses = Object.values(db.houses);
    const ids = players.map((p) => p.id), pdata = players.map((p) => JSON.stringify(p)), coins = players.map((p) => p.coins ?? null);
    const codes = houses.map((h) => h.code), hdata = houses.map((h) => JSON.stringify(h));
    queue = queue.then(async () => {
      const c = await pool.connect();
      try {
        await c.query('begin');
        await c.query(`insert into players (id, data) select * from unnest($1::text[], $2::jsonb[])
          on conflict (id) do update set data = excluded.data`, [ids, pdata]);
        // Only overwrite coins nobody edited by hand since our last write; syncCoins picks those edits up instead.
        const wrote = await c.query(`update accounts a set coins = v.coins from unnest($1::text[], $2::int[], $3::int[]) v(id, coins, old)
          where a.player_id = v.id and a.coins is not distinct from v.old returning a.player_id, a.coins`, [ids, coins, ids.map((id) => written[id] ?? null)]);
        await c.query(`insert into houses (code, data) select * from unnest($1::text[], $2::jsonb[])
          on conflict (code) do update set data = excluded.data`, [codes, hdata]);
        await c.query('commit');
        for (const r of wrote.rows) written[r.player_id] = r.coins;
      } catch (err) {
        await c.query('rollback').catch(() => {});
        console.error('save failed', err);
      } finally {
        c.release();
      }
    });
    return queue;
  }

  // Applies coins edited straight in the database while the server runs; returns the players whose coins changed.
  // Queued with the saves so it never reads halfway through one.
  function syncCoins() {
    const run = queue.then(async () => {
      const changed = [];
      for (const r of (await pool.query(readCoins)).rows) {
        const p = db.players[r.player_id];
        if (!p || r.coins === written[r.player_id]) continue;
        p.coins = written[r.player_id] = r.coins;
        changed.push(p.id);
      }
      return changed;
    }).catch((err) => { console.error('coin sync failed', err); return []; });
    queue = run;
    return run;
  }

  if (!Object.keys(db.players).length && legacyJsonFile && fs.existsSync(legacyJsonFile)) {
    const old = JSON.parse(fs.readFileSync(legacyJsonFile, 'utf8'));
    Object.assign(db.players, old.players ?? {});
    Object.assign(db.houses, old.houses ?? {});
    await saveAll();
    fs.renameSync(legacyJsonFile, `${legacyJsonFile}.imported`);
  }

  const one = async (q, args) => (await pool.query(q, args)).rows[0];
  return {
    db,
    saveAll,
    syncCoins,
    deleteHouse: (code) => pool.query('delete from houses where code = $1', [code]),
    // Log in with either the username or the email.
    findAccount: (login) => one('select player_id, username, pass from accounts where lower(username) = lower($1) or lower(email) = lower($1)', [login]),
    emailTaken: async (email) => !!(await one('select 1 from accounts where lower(email) = lower($1)', [email])),
    hasAccount: async (playerId) => !!(await one('select 1 from accounts where player_id = $1', [playerId])),
    createAccount: (playerId, username, password, email) =>
      pool.query('insert into accounts (player_id, username, pass, created, email) values ($1, $2, $3, $4, $5)', [playerId, username, hashPassword(password), Date.now(), email]),
    async issueToken(playerId) {
      const token = crypto.randomBytes(32).toString('base64url');
      await pool.query('insert into auth (token, player_id, expires) values ($1, $2, $3)', [sha(token), playerId, Date.now() + TOKEN_DAYS * 86_400_000]);
      return token;
    },
    async playerForToken(token) {
      if (typeof token !== 'string' || token.length > 100) return null;
      const row = await one('select player_id, expires from auth where token = $1', [sha(token)]);
      return row && Number(row.expires) > Date.now() ? row.player_id : null;
    },
    revokeToken: (token) => pool.query('delete from auth where token = $1', [sha(String(token))]),
    close: () => pool.end(),
  };
}
