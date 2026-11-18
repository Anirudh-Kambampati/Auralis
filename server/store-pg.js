// Postgres storage (e.g. Neon), same shape as the SQLite store in store.js but async.
// Game state stays in memory; each player and house is saved as one JSONB row.
import pg from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { hashPassword, savedMessages, rowMessage, sessionRow, changedRows, threadRow, threadRowsFromWorld } from './store.js';
import { migratePg } from './schema.js';

const TOKEN_DAYS = 30;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// `lazy` loads one stub per player (id, name, house, home) instead of parsing every row at boot; the
// full row is read on demand by `player(id)`. See docs/superpowers/specs/2026-11-19-lazy-player-loading.md.
export async function openPgStore(url, legacyJsonFile, { lazy = false } = {}) {
  // Neon URLs say sslmode=require; spell out verify-full (what pg does today) so certificates stay checked after pg v9.
  const pool = new pg.Pool({
    connectionString: url.replace(/sslmode=(require|prefer|verify-ca)/, 'sslmode=verify-full'),
    max: 5,
    // A database that stopped answering (Neon asleep, a network drop) used to hold every connect
    // attempt for over a minute, with saves stacked behind it. Fail fast and let the breaker take over.
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 60_000,
    maxLifetimeSeconds: 600,
    query_timeout: 20_000,
    keepAlive: true,
    application_name: 'auralis',
  });
  // An idle connection that Neon drops emits 'error' on the pool; with no listener Node throws and the
  // process dies. A dropped connection is one failed save, not a crash.
  pool.on('error', (err) => console.error('postgres pool error', err.message));
  // The shape lives in server/schema.js, shared with the SQLite store: same tables, same indexes,
  // rendered for Postgres and applied once through schema_migrations.
  await migratePg(pool);

  const db = { players: {}, houses: {} };
  if (lazy) {
    for (const r of (await pool.query(`select id, data->>'name' as name, data->>'house' as house, data->>'home' as home from players`)).rows) {
      db.players[r.id] = { __stub: true, id: r.id, name: r.name, house: r.house, home: r.home };
    }
  } else {
    for (const r of (await pool.query('select id, data from players')).rows) db.players[r.id] = r.data;
  }
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
  // 'p:<id>' / 'h:<code>' -> fingerprint of the JSON last written. One short string per row, not a
  // copy of the row: the in-memory world is the only full copy of it.
  const lastSaved = new Map();
  // Rows per statement. The diff is streamed through these chunks, so a burst of changes never turns
  // the whole world into JSON strings at once (that spike is what hit the heap limit).
  const SAVE_CHUNK = 40;
  // Circuit breaker: when the DB is unreachable, stop queuing saves so they can't
  // pile up in memory and OOM. Retry after a cooldown.
  let dbUnavailable = false;
  let unavailableSince = 0;
  const DB_COOLDOWN_MS = 30_000;
  const DB_DOWN = new Set(['ETIMEDOUT', 'ENETUNREACH', 'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE', '57P01', '57P03', '08001', '08003', '08006']);
  function isDbUnavailable() { return dbUnavailable && Date.now() - unavailableSince < DB_COOLDOWN_MS; }
  function markDbUnavailable(err) {
    const gone = DB_DOWN.has(err?.code) || /Connection terminated|timeout expired|Connection closed/i.test(err?.message ?? '');
    if (gone) { dbUnavailable = true; unavailableSince = Date.now(); }
  }

  async function writeChunk(c, chunk) {
    const players = chunk.filter(([k]) => k[0] === 'p'), houses = chunk.filter(([k]) => k[0] === 'h');
    if (players.length) {
      const ids = players.map(([, p]) => p.id), pdata = players.map(([, , j]) => j), coins = players.map(([, p]) => p.coins ?? null);
      await c.query(`insert into players (id, data) select * from unnest($1::text[], $2::jsonb[])
        on conflict (id) do update set data = excluded.data`, [ids, pdata]);
      // Only overwrite coins nobody edited by hand since our last write; syncCoins picks those edits up instead.
      const wrote = await c.query(`update accounts a set coins = v.coins from unnest($1::text[], $2::int[], $3::int[]) v(id, coins, old)
        where a.player_id = v.id and a.coins is not distinct from v.old returning a.player_id, a.coins`, [ids, coins, ids.map((id) => written[id] ?? null)]);
      for (const r of wrote.rows) written[r.player_id] = r.coins;
    }
    if (houses.length) {
      await c.query(`insert into houses (code, data) select * from unnest($1::text[], $2::jsonb[])
        on conflict (code) do update set data = excluded.data`, [houses.map(([, h]) => h.code), houses.map(([, , j]) => j)]);
    }
  }

  // Writes the rows the diff yields, a chunk at a time, in one transaction. Fingerprints are recorded
  // only once the commit lands, so a failed save leaves every one of those rows to be written again.
  async function writeChanged(first, rest) {
    const c = await pool.connect();
    let chunk = [first];
    const marks = [];
    try {
      await c.query('begin');
      const flush = async () => {
        if (!chunk.length) return;
        await writeChunk(c, chunk);
        for (const [k, , , fp] of chunk) marks.push([k, fp]);
        chunk = [];
      };
      for (let n = rest.next(); !n.done; n = rest.next()) {
        chunk.push(n.value);
        if (chunk.length >= SAVE_CHUNK) await flush();
      }
      await flush();
      await c.query('commit');
      dbUnavailable = false; // the database is reachable again
      for (const [k, fp] of marks) lastSaved.set(k, fp);
    } catch (err) {
      await c.query('rollback').catch(() => {});
      throw err;
    } finally {
      c.release();
    }
  }

  function saveAll() {
    if (isDbUnavailable()) return queue;
    const rows = changedRows(db, lastSaved);
    const first = rows.next();
    if (first.done) return queue; // nothing changed: no round trip at all
    // Caught here, so a failed save (or a connect that never lands) can never leave `queue` rejected
    // and silently block every save after it.
    queue = queue.then(() => writeChanged(first.value, rows)).catch((err) => {
      markDbUnavailable(err);
      console.error('save failed', err);
    });
    return queue;
  }

  // Applies coins edited straight in the database while the server runs; returns the players whose coins changed.
  // Queued with the saves so it never reads halfway through one.
  function syncCoins() {
    if (isDbUnavailable()) return Promise.resolve([]);
    const run = queue.then(async () => {
      const changed = [];
      for (const r of (await pool.query(readCoins)).rows) {
        const p = db.players[r.player_id];
        // A stub has no game state to update; the column is read again when the player is hydrated.
        if (!p || p.__stub || r.coins === written[r.player_id]) continue;
        p.coins = written[r.player_id] = r.coins;
        changed.push(p.id);
      }
      return changed;
    }).catch((err) => { markDbUnavailable(err); console.error('coin sync failed', err); return []; });
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

  const addMessage = (thread, m) => { if (isDbUnavailable()) return Promise.resolve(); return pool.query('insert into messages (id, thread, from_id, by_name, body, img, reply_to, at) values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (id) do nothing',
    [m.id, thread, m.from ?? '', m.by ?? '', m.text ?? '', m.img ?? null, m.replyTo ?? null, m.at ?? 0]).catch((err) => { markDbUnavailable(err); console.error('message save failed', err); }); };
  // First run with the messages table: copy in the chat history the rows already hold.
  if (!(await pool.query('select 1 from messages limit 1')).rows.length) {
    const rows = [...savedMessages(db)];
    await pool.query(`insert into messages (id, thread, from_id, by_name, body, img, at)
      select * from unnest($1::bigint[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::bigint[]) on conflict (id) do nothing`,
    [rows.map(([, m]) => m.id), rows.map(([t]) => t), rows.map(([, m]) => m.from ?? ''), rows.map(([, m]) => m.by ?? ''), rows.map(([, m]) => m.text ?? ''), rows.map(([, m]) => m.img ?? null), rows.map(([, m]) => m.at ?? 0)]);
  }

  const one = async (q, args) => (await pool.query(q, args)).rows[0];

  // One row per member per conversation: the newest message, which is the client's list. Refreshing an
  // existing row keeps `seen` and `muted_until` (what this member has read and muted).
  const touchThreads = async (rows) => {
    if (!rows.length) return 0;
    await pool.query(`insert into threads (player_id, thread, last_id, last_at, last_by, last_body, last_img, seen)
      select * from unnest($1::text[], $2::text[], $3::bigint[], $4::bigint[], $5::text[], $6::text[], $7::text[], $8::bigint[])
      on conflict (player_id, thread) do update set last_id = excluded.last_id, last_at = excluded.last_at,
        last_by = excluded.last_by, last_body = excluded.last_body, last_img = excluded.last_img`,
    [rows.map((r) => r.playerId), rows.map((r) => r.thread), rows.map((r) => r.lastId), rows.map((r) => r.lastAt),
      rows.map((r) => r.lastBy), rows.map((r) => r.lastBody), rows.map((r) => r.lastImg), rows.map(() => 0)]);
    return rows.length;
  };
  return {
    db,
    saveAll,
    syncCoins,
    unavailable: isDbUnavailable, // a known outage: a sign-in gets a retry instead of a 15 s wait for a connection
    addMessage,
    // The newest id in the archive: a restart resumes its message counter after it, never before it.
    lastMessageId: async () => Number((await one('select max(id) as id from messages'))?.id ?? 0),
    // One full player row, for a lazy boot: null when there is no such row. Their coins column still
    // wins over the copy in the JSON, the same as at boot.
    player: async (id) => {
      const r = await one(`select p.data, (select coins from accounts a where a.player_id = p.id) as coins
        from players p where p.id = $1`, [String(id)]);
      if (!r) return null;
      const p = r.data;
      if (r.coins !== null && r.coins !== undefined) p.coins = r.coins;
      return p;
    },
    // Rows from before chat and sessions moved out of them: those need one full pass, so a lazy boot
    // loads everything once rather than leaving the move half done.
    legacyRows: async () => Number((await one(`select count(*) as n from players where
      data->'rooms' is null
      or data ? 'sessions' or data ? 'mutedThreads' or data ? 'chatThemes' or data ? 'dm'
      or (data->'groups')::text like '%"msgs"%'`))?.n ?? 0),
    touchThreads,
    threadsFor: async (playerId) => (await pool.query('select * from threads where player_id = $1 and last_id is not null order by last_at desc', [playerId])).rows.map(threadRow),
    // Fills in the conversations the list is missing, from the chat the rows still carry. Runs on every
    // boot; a conversation the table already knows is left exactly as it is.
    seedThreads: async () => {
      const rows = threadRowsFromWorld(db);
      if (!rows.length) return 0;
      const res = await pool.query(`insert into threads (player_id, thread, last_id, last_at, last_by, last_body, last_img, seen)
        select * from unnest($1::text[], $2::text[], $3::bigint[], $4::bigint[], $5::text[], $6::text[], $7::text[], $8::bigint[])
        on conflict (player_id, thread) do nothing`,
      [rows.map((r) => r.playerId), rows.map((r) => r.thread), rows.map((r) => r.lastId), rows.map((r) => r.lastAt),
        rows.map((r) => r.lastBy), rows.map((r) => r.lastBody), rows.map((r) => r.lastImg), rows.map(() => 0)]);
      return res.rowCount;
    },
    history: async (thread, before, limit = 50) =>
      (await pool.query('select * from messages where thread = $1 and id < $2 order by id desc limit $3', [thread, before, limit])).rows.reverse().map(rowMessage),
    // The newest `limit` messages of each of these threads, oldest first: what a client needs on connect.
    tails: async (threads, limit = 50) => {
      if (!threads.length) return {};
      const rows = (await pool.query(`select * from (
        select m.*, row_number() over (partition by m.thread order by m.id desc) rn
        from messages m where m.thread = any($1::text[])) t where rn <= $2 order by id`, [threads, limit])).rows;
      return rows.reduce((out, r) => ((out[r.thread] ??= []).push(rowMessage(r)), out), {});
    },
    // One message of a thread, by id: what a reply quotes.
    messageIn: async (thread, id) => {
      const r = await one('select * from messages where thread = $1 and id = $2', [thread, id]);
      return r ? rowMessage(r) : null;
    },
    // The study log: appended once, never updated (the unique index makes a repeated append a no-op).
    addSession: (playerId, s) => pool.query('insert into sessions (player_id, at, minutes, tag, early) values ($1, $2, $3, $4, $5) on conflict do nothing',
      [playerId, s.at, s.minutes, s.tag ?? 'Study', s.early ? 1 : 0]),
    // The detail the stats panel shows: everything inside the roll-up window, oldest first.
    sessionsFor: async (playerId, since) => (await pool.query('select * from sessions where player_id = $1 and at >= $2 order by at', [playerId, since]))
      .rows.map(sessionRow),
    // The days already folded up, as the panel needs them: one entry per day and subject.
    sessionDaysFor: async (playerId) => (await pool.query('select * from session_days where player_id = $1 order by day', [playerId])).rows
      .map((r) => ({ at: Number(r.day), minutes: Number(r.minutes), tag: r.tag, n: Number(r.sessions) })),
    // Minutes per player since `since` (0 for all time), from the log and the roll-up together.
    // `playerIds` null means everyone, which is what the 'all' leaderboard asks for.
    sessionTotals: async (since, playerIds = null) => (await pool.query(`select player_id, sum(minutes) as minutes from (
      select player_id, minutes, at as at from sessions where ($2::text[] is null or player_id = any($2))
      union all
      select player_id, minutes, day as at from session_days where ($2::text[] is null or player_id = any($2))
    ) t where at >= $1 group by player_id`, [since, playerIds])).rows
      .reduce((out, r) => { out[r.player_id] = Number(r.minutes); return out; }, {}),
    // Folds sessions older than `cutoff` into the day roll-up in one statement (delete + insert, atomic).
    rollUpSessions: async (cutoff) => (await pool.query(`with gone as (
        delete from sessions where at < $1 returning player_id, at, minutes, tag)
      insert into session_days (player_id, day, tag, minutes, sessions)
      select player_id, (at / 86400000) * 86400000, tag, sum(minutes), count(*) from gone group by 1, 2, 3
      on conflict (player_id, day, tag) do update set minutes = session_days.minutes + excluded.minutes,
        sessions = session_days.sessions + excluded.sessions`, [cutoff])).rowCount,
    // Every member who has muted a conversation, so a message to someone offline can be held back.
    threadMutes: async () => (await pool.query('select player_id, thread, muted_until from threads where muted_until is not null')).rows
      .map((r) => ({ playerId: r.player_id, thread: r.thread, until: Number(r.muted_until) })),
    // How far this member has read; it never moves backwards.
    setThreadSeen: (playerId, thread, id) => pool.query('update threads set seen = greatest(coalesce(seen, 0), $3) where player_id = $1 and thread = $2', [playerId, thread, id]),
    // A mute is kept even before the thread has a message: `last_id` stays empty, so it is never in anyone's list.
    setThreadMute: (playerId, thread, until) => pool.query(`insert into threads (player_id, thread, muted_until) values ($1, $2, $3)
      on conflict (player_id, thread) do update set muted_until = excluded.muted_until`, [playerId, thread, until]),
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
    // Readiness: the cheapest query that proves the database answers at all.
    ping: async () => !!(await one('select 1 as ok'))?.ok,
    // Resolves once every queued save has landed: what a shutdown waits for.
    idle: () => queue,
    // Every chat theme, for the one read at boot (the live copy is in memory, per player).
    chatThemes: async () => (await pool.query('select player_id, thread, color from chat_themes')).rows
      .map((r) => ({ playerId: r.player_id, thread: r.thread, color: r.color })),
    setChatTheme: (playerId, thread, color) => (color
      ? pool.query(`insert into chat_themes (player_id, thread, color) values ($1, $2, $3)
        on conflict (player_id, thread) do update set color = excluded.color`, [playerId, thread, color])
      : pool.query('delete from chat_themes where player_id = $1 and thread = $2', [playerId, thread]))
      .then((r) => r.rowCount > 0, () => false),
    // Retention: the files carried by messages about to be pruned, so they can be deleted from the bucket
    // rather than left behind once no row refers to them.
    messageImages: async (before) => (await pool.query('select distinct img from messages where at < $1 and img is not null', [before])).rows.map((r) => r.img),
    // Retention: drops messages older than `before`, returning how many went.
    pruneMessages: async (before) => (await pool.query('delete from messages where at < $1', [before])).rowCount,
    // Everything one account owns, in one transaction: the player, the house they own, their sign-in,
    // their conversations, study log and chat settings, and the lines they wrote.
    deleteAccount: async (playerId) => {
      const c = await pool.connect();
      try {
        await c.query('begin');
        await c.query('delete from messages where from_id = $1', [playerId]);
        for (const table of ['threads', 'chat_themes', 'sessions', 'session_days', 'auth', 'reset_tokens']) {
          await c.query(`delete from ${table} where player_id = $1`, [playerId]);
        }
        await c.query('delete from accounts where player_id = $1', [playerId]);
        await c.query('delete from friends where a = $1 or b = $1', [playerId]);
        await c.query("delete from houses where data->>'owner' = $1", [playerId]);
        await c.query('delete from players where id = $1', [playerId]);
        await c.query('commit');
        return true;
      } catch (err) {
        await c.query('rollback').catch(() => {});
        throw err;
      } finally {
        c.release();
      }
    },
    close: () => pool.end(),
  };
}
