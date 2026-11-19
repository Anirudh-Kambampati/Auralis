// The one schema. Every table and index is described here once and rendered for whichever store runs
// (SQLite locally and in tests, Postgres in production), so the two cannot drift into different shapes.
//
// A change to the shape is a new entry in MIGRATIONS, applied once per database and recorded in
// `schema_migrations`. Databases created before this file existed have never recorded anything, so
// their first boot creates the tables they are missing, adds the columns they are missing, and builds
// the indexes — each step a no-op where the database is already up to date.
//
// Kinds: text, bigint, int, json. `json` is JSONB on Postgres and TEXT on SQLite (parsed on load).
const TYPES = {
  sqlite: { text: 'text', bigint: 'integer', int: 'integer', json: 'text' },
  pg: { text: 'text', bigint: 'bigint', int: 'integer', json: 'jsonb' },
};

// One row per player and per house: the aggregate lives as JSON, everything that grows without a
// ceiling (messages, sessions) has its own table.
export const TABLES = [
  { name: 'players', columns: [['id', 'text', { pk: true }], ['data', 'json', { notNull: true }]] },
  { name: 'houses', columns: [['code', 'text', { pk: true }], ['data', 'json', { notNull: true }]] },
  {
    name: 'accounts',
    columns: [
      ['player_id', 'text', { pk: true }],
      ['username', 'text', { notNull: true }],
      ['pass', 'text', { notNull: true }],
      ['created', 'bigint', { notNull: true }],
      ['email', 'text'],
      ['coins', 'int'],
    ],
  },
  {
    name: 'auth',
    columns: [['token', 'text', { pk: true }], ['player_id', 'text', { notNull: true }], ['expires', 'bigint', { notNull: true }]],
  },
  {
    name: 'messages',
    columns: [
      ['id', 'bigint', { pk: true }],
      ['thread', 'text', { notNull: true }],
      ['from_id', 'text', { notNull: true }],
      ['by_name', 'text', { notNull: true }],
      ['body', 'text', { notNull: true }],
      ['img', 'text'],
      ['reply_to', 'text'],
      ['at', 'bigint', { notNull: true }],
    ],
  },
  // The study log: one row per finished (or ended-early) session, appended and never updated. Everything
  // that grows with time lives in a table of its own rather than on the player row.
  {
    name: 'sessions',
    columns: [
      ['id', 'bigint', { pk: true }],
      ['player_id', 'text', { notNull: true }],
      ['at', 'bigint', { notNull: true }],
      ['minutes', 'int', { notNull: true }],
      ['tag', 'text', { notNull: true }],
      ['early', 'int'],
    ],
  },
  // Everything older than the detail window, folded to one row per player, day and subject.
  {
    name: 'session_days',
    columns: [
      ['player_id', 'text', { notNull: true }],
      ['day', 'bigint', { notNull: true }],
      ['tag', 'text', { notNull: true }],
      ['minutes', 'int', { notNull: true }],
      ['sessions', 'int', { notNull: true }],
    ],
    pk: ['player_id', 'day', 'tag'],
  },
  {
    name: 'friends',
    columns: [
      ['a', 'text', { notNull: true }],
      ['b', 'text', { notNull: true }],
      ['status', 'text', { notNull: true }],
      ['asked_by', 'text', { notNull: true }],
      ['at', 'bigint', { notNull: true }],
    ],
    pk: ['a', 'b'],
  },
  // The conversation list: one row per member per thread, the newest message and what they have read.
  // History itself stays in `messages`; this is the cheap index the client's list is built from.
  {
    name: 'threads',
    columns: [
      ['player_id', 'text', { notNull: true }],
      ['thread', 'text', { notNull: true }],
      ['last_id', 'bigint'],
      ['last_at', 'bigint'],
      ['last_by', 'text'],
      ['last_body', 'text'],
      ['last_img', 'text'],
      ['seen', 'bigint'],
      ['muted_until', 'bigint'],
    ],
    pk: ['player_id', 'thread'],
  },
  // Per-user chat settings. Written by the SQLite store today; kept in the shared schema so Postgres
  // has the same shape when these move onto their own rows (see docs/choices.md).
  {
    name: 'muted_threads',
    columns: [['player_id', 'text', { notNull: true }], ['thread', 'text', { notNull: true }], ['until', 'bigint', { notNull: true }]],
    pk: ['player_id', 'thread'],
  },
  {
    name: 'chat_themes',
    columns: [['player_id', 'text', { notNull: true }], ['thread', 'text', { notNull: true }], ['color', 'text', { notNull: true }]],
    pk: ['player_id', 'thread'],
  },
  // Password reset: one live token per player, stored as sha(token) so a leaked database signs nobody
  // in. `expires` is a timestamp; a used or superseded token is deleted, never kept.
  {
    name: 'reset_tokens',
    columns: [['player_id', 'text', { notNull: true }], ['token', 'text', { pk: true }], ['expires', 'bigint', { notNull: true }]],
  },
];

// Usernames and emails are unique regardless of case through an index on lower(), which both
// databases support, instead of SQLite's column collation (Postgres has no equivalent).
export const INDEXES = [
  { name: 'accounts_username', table: 'accounts', unique: true, columns: ['lower(username)'] },
  { name: 'accounts_email', table: 'accounts', unique: true, columns: ['lower(email)'], where: 'email is not null' },
  { name: 'messages_thread', table: 'messages', columns: ['thread', 'id'] },
  // Retention deletes by age, so that is the column it has to be able to find rows by.
  { name: 'messages_at', table: 'messages', columns: ['at'] },
  { name: 'messages_img', table: 'messages', columns: ['img'], where: 'img is not null' },
  { name: 'auth_player', table: 'auth', columns: ['player_id'] },
  { name: 'threads_recent', table: 'threads', columns: ['player_id', 'last_at'] },
  { name: 'sessions_by_player', table: 'sessions', columns: ['player_id', 'at'] },
  // A session can only be logged once: it makes the one-time move off the old player rows repeatable.
  { name: 'sessions_once', table: 'sessions', unique: true, columns: ['player_id', 'at', 'tag'] },
];

const THREADS = TABLES.find((t) => t.name === 'threads');
const THREADS_RECENT = INDEXES.find((i) => i.name === 'threads_recent');
const SESSIONS = TABLES.find((t) => t.name === 'sessions');
const SESSION_DAYS = TABLES.find((t) => t.name === 'session_days');
const SESSIONS_BY_PLAYER = INDEXES.find((i) => i.name === 'sessions_by_player');
const SESSIONS_ONCE = INDEXES.find((i) => i.name === 'sessions_once');

export function createTableSql(dialect, table) {
  const types = TYPES[dialect];
  const columns = table.columns.map(([name, kind, opts = {}]) => {
    const parts = [`${name} ${types[kind]}`];
    if (opts.pk && !table.pk) parts.push('primary key'); // inline: SQLite's rowid alias needs it
    if (opts.notNull) parts.push('not null');
    return parts.join(' ');
  });
  if (table.pk) columns.push(`primary key (${table.pk.join(', ')})`);
  return `create table if not exists ${table.name} (\n  ${columns.join(',\n  ')}\n)`;
}

export function createIndexSql(index) {
  const unique = index.unique ? 'unique ' : '';
  const where = index.where ? ` where ${index.where}` : '';
  return `create ${unique}index if not exists ${index.name} on ${index.table} (${index.columns.join(', ')})${where}`;
}

// Columns that arrived after the first databases were created. Every runner adds only what is missing.
const ADDED_COLUMNS = [
  ['accounts', 'email', 'text'],
  ['accounts', 'coins', 'integer'],
  ['messages', 'reply_to', 'text'],
];

// 001 makes the tables match TABLES (creating them, and adding the columns an older database is
// missing); 002 builds the indexes, which can only exist once those columns do; 003 lets Postgres
// issue message ids itself (SQLite's integer primary key already does); 004 adds the conversation
// list to databases that were created before it existed; 005 adds the study log and its roll-up.
export const MIGRATIONS = [
  { version: '001-baseline', sql: (dialect) => TABLES.map((t) => createTableSql(dialect, t)), columns: ADDED_COLUMNS },
  { version: '002-indexes', sql: () => INDEXES.map(createIndexSql) },
  {
    version: '003-message-ids',
    sql: () => [],
    // The application still hands out the ids it writes, but the column can also make one: a message
    // id must never be reissued, and this is what lets a second process write one safely. The sequence
    // is moved past what is already stored so it cannot hand out an id that exists.
    pg: [
      'alter table messages alter column id add generated by default as identity',
      "select setval(pg_get_serial_sequence('messages', 'id'), greatest((select coalesce(max(id), 0) from messages), 1))",
    ],
  },
  {
    version: '004-threads',
    // A database that already recorded the baseline does not have this table yet.
    sql: (dialect) => [createTableSql(dialect, THREADS), createIndexSql(THREADS_RECENT)],
  },
  {
    version: '005-sessions',
    // The study log and its roll-up, added to databases created before they existed.
    sql: (dialect) => [createTableSql(dialect, SESSIONS), createTableSql(dialect, SESSION_DAYS),
      createIndexSql(SESSIONS_BY_PLAYER), createIndexSql(SESSIONS_ONCE)],
    // SQLite's `integer primary key` makes the id itself; Postgres has to be told to.
    pg: ['alter table sessions alter column id add generated by default as identity'],
  },
  {
    version: '006-retention',
    // Pruning chat by age needs an index on the age, not on the thread.
    sql: () => [createIndexSql(INDEXES.find((i) => i.name === 'messages_at'))],
  },
];

// Postgres: async, one query per statement, applied in version order.
export async function migratePg(pool) {
  await pool.query('create table if not exists schema_migrations (version text primary key, applied_at bigint not null)');
  const done = new Set((await pool.query('select version from schema_migrations')).rows.map((r) => r.version));
  for (const migration of MIGRATIONS) {
    if (done.has(migration.version)) continue;
    for (const sql of migration.sql('pg')) await pool.query(sql);
    for (const sql of migration.pg ?? []) await pool.query(sql);
    for (const [table, column, type] of migration.columns ?? []) {
      await pool.query(`alter table ${table} add column if not exists ${column} ${type}`);
    }
    await pool.query('insert into schema_migrations (version, applied_at) values ($1, $2)', [migration.version, Date.now()]);
  }
}

// SQLite: synchronous (the store is opened synchronously), one statement per exec, `pragma table_info`
// in place of `add column if not exists`, which SQLite does not have.
export function migrateSqlite(sql) {
  sql.exec('create table if not exists schema_migrations (version text primary key, applied_at integer not null)');
  const done = new Set(sql.prepare('select version from schema_migrations').all().map((r) => r.version));
  for (const migration of MIGRATIONS) {
    if (done.has(migration.version)) continue;
    for (const statement of migration.sql('sqlite')) sql.exec(statement);
    for (const [table, column, type] of migration.columns ?? []) {
      // Table and column names are internal constants, never input.
      if (sql.prepare(`select 1 from pragma_table_info('${table}') where name = '${column}'`).get()) continue;
      sql.exec(`alter table ${table} add column ${column} ${type}`);
    }
    sql.prepare('insert into schema_migrations (version, applied_at) values (?, ?)').run(migration.version, Date.now());
  }
}
