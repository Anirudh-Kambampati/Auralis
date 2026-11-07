// Postgres storage (e.g. Neon), same shape as the SQLite store in store.js but async.
// Game state stays in memory; each player and house is saved as one JSONB row.
import pg from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { hashPassword, savedMessages, rowMessage, changedRows, RESET_MS, MAX_RESETS } from './store.js';

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
    create table if not exists resets (token text primary key, player_id text not null, expires bigint not null);
    alter table accounts add column if not exists email text;
    create unique index if not exists accounts_email on accounts (lower(email)) where email is not null;
    alter table accounts add column if not exists coins integer;
    create table if not exists messages (id bigint primary key, thread text not null, from_id text not null, by_name text not null, body text not null, img text, at bigint not null);
    create index if not exists messages_thread on messages (thread, id);
    create index if not exists messages_img on messages (img) where img is not null;
    create index if not exists auth_player on auth (player_id);
    create table if not exists friends (a text not null, b text not null, status text not null, asked_by text not null, at bigint not null, primary key (a, b));
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

  await pool.query('delete from auth where expires < $1', [Date.now()]); // expired sign-ins

  // Saves run one at a time so an older snapshot never lands after a newer one.
  let queue = Promise.resolve();
  const lastJson = new Map(); // only rows that changed since they were last written are sent
  function saveAll() {
    const rows = changedRows(db, lastJson);
    const players = rows.filter(([k]) => k[0] === 'p'), houses = rows.filter(([k]) => k[0] === 'h');
    const ids = players.map(([, p]) => p.id), pdata = players.map(([, , j]) => j), coins = players.map(([, p]) => p.coins ?? null);
    const codes = houses.map(([, h]) => h.code), hdata = houses.map(([, , j]) => j);
    for (const [k, , j] of rows) lastJson.set(k, j); // marked now so the next save skips them; a failed save un-marks them
    if (!rows.length) return queue;
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
        for (const [k, , j] of rows) if (lastJson.get(k) === j) lastJson.delete(k); // write these again next time
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

  const addMessage = (thread, m) => pool.query('insert into messages (id, thread, from_id, by_name, body, img, at) values ($1, $2, $3, $4, $5, $6, $7) on conflict (id) do nothing',
    [m.id, thread, m.from ?? '', m.by ?? '', m.text ?? '', m.img ?? null, m.at ?? 0]).catch((err) => console.error('message save failed', err));
  // First run with the messages table: copy in the chat history the rows already hold.
  if (!(await pool.query('select 1 from messages limit 1')).rows.length) {
    const rows = [...savedMessages(db)];
    await pool.query(`insert into messages (id, thread, from_id, by_name, body, img, at)
      select * from unnest($1::bigint[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::bigint[]) on conflict (id) do nothing`,
    [rows.map(([, m]) => m.id), rows.map(([t]) => t), rows.map(([, m]) => m.from ?? ''), rows.map(([, m]) => m.by ?? ''), rows.map(([, m]) => m.text ?? ''), rows.map(([, m]) => m.img ?? null), rows.map(([, m]) => m.at ?? 0)]);
  }

  const one = async (q, args) => (await pool.query(q, args)).rows[0];
  return {
    db,
    saveAll,
    syncCoins,
    addMessage,
    history: async (thread, before, limit = 50) =>
      (await pool.query('select * from messages where thread = $1 and id < $2 order by id desc limit $3', [thread, before, limit])).rows.reverse().map(rowMessage),
    threadsWithImg: async (key) => (await pool.query('select distinct thread from messages where img = $1', [String(key)])).rows.map((r) => r.thread),
    friends: async () => (await pool.query('select a, b, status, asked_by, at from friends')).rows.map((r) => ({ ...r, at: Number(r.at) })),
    setFriend: (f) => pool.query(`insert into friends (a, b, status, asked_by, at) values ($1, $2, $3, $4, $5)
      on conflict (a, b) do update set status = excluded.status, asked_by = excluded.asked_by, at = excluded.at`, [f.a, f.b, f.status, f.asked_by, f.at]),
    deleteFriend: (a, b) => pool.query('delete from friends where a = $1 and b = $2', [a, b]),
    usernames: async () => (await pool.query('select player_id, username from accounts')).rows,
    renameAccount: (playerId, name) => pool.query('update accounts set username = $1 where player_id = $2', [String(name), playerId])
      .then((r) => r.rowCount > 0, () => false), // unique clash: someone else has it
    playerByUsername: async (name) => (await one('select player_id from accounts where lower(username) = lower($1)', [String(name)]))?.player_id ?? null,
    deleteHouse: (code) => pool.query('delete from houses where code = $1', [code]),
    // Log in with either the username or the email.
    findAccount: (login) => one('select player_id, username, pass, email from accounts where lower(username) = lower($1) or lower(email) = lower($1)', [login]),
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
    // Password reset links, as in store.js.
    async createReset(playerId) {
      const now = Date.now();
      if (Number((await one('select count(*) n from resets where player_id = $1 and expires > $2', [playerId, now])).n) >= MAX_RESETS) return null;
      const token = crypto.randomBytes(32).toString('base64url');
      await pool.query('insert into resets (token, player_id, expires) values ($1, $2, $3)', [sha(token), playerId, now + RESET_MS]);
      return token;
    },
    async useReset(token, password) {
      if (typeof token !== 'string' || token.length > 100) return null;
      // Deleting the row is what claims it, so the same link can't be used twice even at the same moment.
      const id = (await one('delete from resets where token = $1 and expires > $2 returning player_id', [sha(token), Date.now()]))?.player_id;
      if (!id) return null;
      await pool.query('update accounts set pass = $1 where player_id = $2', [hashPassword(password), id]);
      await pool.query('delete from resets where player_id = $1', [id]);
      await pool.query('delete from auth where player_id = $1', [id]);
      return id;
    },
    close: () => pool.end(),
  };
}
