// One-time: make each login username match the in-game name (the name wins when it's valid and free).
// Dry run by default; `--apply` writes. Backs up usernames + names to the file given as BACKUP first.
// Usage: node --env-file=.env scripts/match-names.mjs [--apply]
import fs from 'node:fs';
import pg from 'pg';
const apply = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const rows = (await pool.query("select a.player_id, a.username, p.data->>'name' as name from accounts a left join players p on p.id = a.player_id")).rows;
if (process.env.BACKUP) fs.writeFileSync(process.env.BACKUP, JSON.stringify(rows, null, 1));
const taken = new Set(rows.map((r) => r.username.toLowerCase()));
const plan = [];
for (const r of rows) {
  if (!r.name || r.name === r.username) continue;
  const free = !taken.has(r.name.toLowerCase()) || r.name.toLowerCase() === r.username.toLowerCase();
  const cut = r.name.length === 16 && r.username.startsWith(r.name); // the old 16-letter name limit cut the username short
  if (/^[A-Za-z0-9_.-]{3,20}$/.test(r.name) && r.name !== 'Studier' && free && !cut) {
    taken.delete(r.username.toLowerCase()); taken.add(r.name.toLowerCase());
    plan.push({ ...r, action: 'username → name' });
  } else plan.push({ ...r, action: 'name → username (on next deploy)' });
}
for (const p of plan) console.log(`${p.username.padEnd(20)} ${String(p.name).padEnd(20)} ${p.action}`);
if (!plan.length) console.log('All names already match.');
if (apply) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    for (const p of plan) if (p.action.startsWith('username')) await c.query('update accounts set username = $1 where player_id = $2', [p.name, p.player_id]);
    await c.query('commit');
    console.log('Applied.');
  } catch (err) { await c.query('rollback'); console.error('Rolled back:', err.message); } finally { c.release(); }
}
await pool.end();
