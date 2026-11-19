// End-to-end check of the password-reset flow, with the mailer in dry-run mode: the server prints the
// message it would have sent, and this script reads the link out of it — so the whole path from
// "forgot my password" to a working session is exercised without a provider account.
//
// What it asserts: the same answer for an address with an account and one without (no enumeration, and
// no mail to the stranger), one live link per address (a second request straight away sends nothing),
// the link opening the site the request came from when that site is one of ours and SITE_URL when it is
// not, a too-short password refused without spending the token, one successful reset, the old password
// and the old session both dead, the token stored hashed and then gone, and a spent token refused.
//
// Usage: node scripts/e2e-reset.js   (it starts and stops its own server on port 8799)
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from '../server/store.js';

const port = Number(process.env.E2E_PORT ?? 8799);
const base = `http://localhost:${port}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-reset-'));
const dbFile = path.join(dir, 'reset.db');
const ok = (label, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`); if (!cond) process.exitCode = 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let server = null;

// Every `[mail] dry run {...}` line the server prints, in order: what the mailer would have sent.
const mails = [];
let pending = '';
async function start() {
  server = spawn(process.execPath, ['server/index.js'], {
    // Dry run and a made-up sender: nothing leaves the machine, and the link points back at this server.
    env: {
      ...process.env, DB_FILE: dbFile, PORT: String(port), MAIL_DRY_RUN: '1', MAIL_PROVIDER: 'brevo', MAIL_FROM: 'sender@example.test', SITE_URL: base,
      // Two front ends, as a Vercel + Netlify pair would be: a link follows whichever one asked.
      ALLOWED_ORIGINS: 'https://one.test,https://two.test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (d) => {
    pending += d;
    const lines = pending.split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines) {
      const at = line.indexOf('[mail] dry run ');
      if (at < 0) continue;
      try { mails.push(JSON.parse(line.slice(at + '[mail] dry run '.length))); } catch { /* a line we did not write */ }
    }
  });
  server.stderr.on('data', (d) => process.stderr.write(d));
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch {}
    await sleep(100);
  }
  throw new Error('server never became ready');
}

async function stop() {
  if (!server) return;
  server.kill();
  await new Promise((r) => server.on('exit', r));
  server = null;
}

const api = (route, body, headers = {}) => fetch(`${base}/api/${route}`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

async function until(fn, ms = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(50); }
  return false;
}

setTimeout(() => { console.log('FAIL  the run timed out'); process.exit(1); }, 90_000).unref();

await start();
const username = `rst_${crypto.randomBytes(3).toString('hex')}`;
const email = `${username}@example.test`;
const oldPass = crypto.randomBytes(12).toString('base64url');
const newPass = 'a-new-password-9';

const signup = await api('signup', { username, password: oldPass, email });
ok('an account is created', signup.status === 200 && !!signup.body.token, JSON.stringify(signup.body));
const session = signup.body.token;

// One answer for an address with an account and one without; only the real one is mailed.
const sent = mails.length;
const strangerEmail = `nobody_${crypto.randomBytes(3).toString('hex')}@example.test`;
const stranger = await api('forgot', { email: strangerEmail });
const known = await api('forgot', { email });
await until(() => mails.length > sent, 4000);
ok('forgot answers the same either way', stranger.status === 200 && known.status === 200
  && JSON.stringify(stranger.body) === JSON.stringify(known.body), `${stranger.status} ${known.status} ${JSON.stringify(stranger.body)}`);
ok('an address with no account is not mailed', mails.length === sent + 1, `${mails.length - sent} mail(s) for two requests`);

const mail = mails.at(-1);
ok('the mail goes to the account’s address', mail?.to === email, mail?.to);
ok('it is the reset message', /reset your auralis password/i.test(mail?.subject ?? ''), mail?.subject);
const token = /#reset\?token=([A-Za-z0-9_-]{20,})/.exec(mail?.text ?? '')?.[1];
ok('the link carries a token after the #, not in the path', !!token, mail?.text);

await api('forgot', { email });
await sleep(400);
ok('asking again straight away sends no second mail', mails.length === sent + 1, `${mails.length - sent} mail(s)`);

// The link opens the site the request came from, when that site is one the server allows...
const second = `rstb_${crypto.randomBytes(3).toString('hex')}`;
await api('signup', { username: second, password: oldPass, email: `${second}@example.test` });
const fromTwo = mails.length;
await api('forgot', { email: `${second}@example.test` }, { origin: 'https://two.test' });
await until(() => mails.length > fromTwo, 4000);
ok('the link opens the site the request came from', (mails.at(-1)?.text ?? '').includes('https://two.test/#reset?token='), mails.at(-1)?.text);

// ...and SITE_URL when it is not, so a link can never be pointed at somebody else's address.
const third = `rstc_${crypto.randomBytes(3).toString('hex')}`;
await api('signup', { username: third, password: oldPass, email: `${third}@example.test` });
const fromStranger = mails.length;
await api('forgot', { email: `${third}@example.test` }, { origin: 'https://not-ours.test' });
await until(() => mails.length > fromStranger, 4000);
ok('a domain we do not serve gets the SITE_URL link', (mails.at(-1)?.text ?? '').includes(`${base}/#reset?token=`), mails.at(-1)?.text);

// A weak password is refused before the token is touched, so the same link still works afterwards.
const weak = await api('reset', { token, password: 'short' });
ok('a too-short password is refused', weak.status === 400, JSON.stringify(weak.body));

const res = await api('reset', { token, password: newPass });
ok('a live token changes the password', res.status === 200 && !!res.body.token, JSON.stringify(res.body));

const oldLogin = await api('login', { username, password: oldPass });
ok('the old password no longer logs in', oldLogin.status === 401, JSON.stringify(oldLogin.body));
const newLogin = await api('login', { username, password: newPass });
ok('the new password does', newLogin.status === 200 && !!newLogin.body.token, JSON.stringify(newLogin.body));
const spent = await api('reset', { token, password: 'another-password-8' });
ok('a spent token is refused', spent.status === 400, JSON.stringify(spent.body));
const invented = await api('reset', { token: crypto.randomBytes(32).toString('base64url'), password: 'another-password-8' });
ok('a token nobody issued is refused', invented.status === 400, JSON.stringify(invented.body));

// The database, after a restart: the link was stored hashed and is gone; the session it replaced is dead.
await stop();
const raw = new DatabaseSync(dbFile);
// This account's tokens. The two extra accounts above still hold one each, which is why the check is
// about this address rather than the whole table.
const rows = raw.prepare(`select t.token from reset_tokens t join accounts a on a.player_id = t.player_id
  where lower(a.email) = ?`).all(email);
raw.close();
ok('no reset token is stored in the clear', rows.every((r) => r.token !== token), JSON.stringify(rows));
ok('the used token is gone from the table', rows.length === 0, JSON.stringify(rows));
const store = openStore(dbFile);
ok('the session from before the reset is dead', (await store.playerForToken(session)) === null);
store.close();

fs.rmSync(dir, { recursive: true, force: true });
