// Creates two local test accounts for trying multiplayer in development. Never run this against production.
// Usage: start the server, then: DEV_PASSWORD=<something> node scripts/seed-dev-accounts.js
// Without DEV_PASSWORD a random password is generated and printed once.
import crypto from 'node:crypto';

const base = process.env.API ?? 'http://localhost:8787';
const password = process.env.DEV_PASSWORD ?? `dev-${crypto.randomBytes(6).toString('hex')}`;
const accounts = [
  { username: 'devtester', email: 'devtester@example.test', password },
  { username: 'devfriend', email: 'devfriend@example.test', password },
];
for (const a of accounts) {
  const res = await fetch(`${base}/api/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(a) });
  const data = await res.json();
  console.log(a.username, res.ok ? 'created' : data.error);
}
if (!process.env.DEV_PASSWORD) console.log(`password for both: ${password}`);
