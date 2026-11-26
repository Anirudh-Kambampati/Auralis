// The connector layer: free, outside sources that write into surfaces the game already has.
//
// Shape of a connector, all of it on the player row so no table is needed:
//
//   p.conn = {
//     github: { value: 'octocat', lastSync, error, nextAt, data: { units, solved }, paid: { day, coins, minutes } },
//     ics:    { value: 'https://…/basic.ics', … },
//     spotify:{ tokens: { access, refresh, expires }, data: { track, artist, at }, … },
//   }
//
// Every entry is private to its owner and rides in `me`, never in `publicPlayer`, except the one thing
// the house is meant to see: `nowPlaying` on the record player.
//
// Rules live in `shared/connectors.js` (rates, caps, intervals). Nothing here writes a row; the caller
// saves and rebroadcasts.

import dns from 'node:dns/promises';
import { CONNECTOR_BY_ID, CONNECTORS, MAX_SYNCED_EVENTS } from '../shared/connectors.js';

const TIMEOUT_MS = 10_000;
const MAX_BODY = 2 * 1024 * 1024;
const RETRY_MS = 30 * 60_000; // a connector that failed waits this long before asking again
const UA = 'Auralis (+https://auralis-ebon.vercel.app)';
const utcDay = (at) => new Date(at).toISOString().slice(0, 10);
const pad = (n) => String(n).padStart(2, '0');

// ---------- fetching ----------
// A feed address is typed by a player, so it is an SSRF target: no loopback, no private range, no
// cloud metadata, no raw IP, and every redirect hop is checked again. The name is resolved first so a
// hostname that points at 127.0.0.1 is refused as well.
const PRIVATE = [
  /^10\./, /^127\./, /^0\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^::1$/i, /^f[cd][0-9a-f]{2}:/i, /^fe80:/i,
];
const isPrivate = (host) => host === 'localhost' || /\.(localhost|local|internal|home\.arpa)$/i.test(host)
  || PRIVATE.some((re) => re.test(host));

async function checkedUrl(raw, lookup) {
  let u;
  try { u = new URL(String(raw ?? '').trim()); } catch { throw new Error('That is not a web address.'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Only http and https addresses work.');
  if (u.username || u.password) throw new Error('Take the username and password out of that address.');
  if (!u.hostname || u.hostname.length > 200 || isPrivate(u.hostname)) throw new Error('That address is not reachable from here.');
  let addrs;
  try { addrs = await lookup(u.hostname, { all: true }); } catch { throw new Error(`Could not find ${u.hostname}.`); }
  if (!addrs?.length || addrs.some((a) => isPrivate(a.address))) throw new Error('That address is not reachable from here.');
  return u;
}

export async function safeFetch(raw, opts = {}, { fetch: f = fetch, lookup = dns.lookup, hops = 0 } = {}) {
  const u = await checkedUrl(raw, lookup);
  const res = await f(u.toString(), { ...opts, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
  if ([301, 302, 303, 307, 308].includes(res.status)) {
    if (hops >= 3) throw new Error('That address redirects too many times.');
    const next = res.headers.get('location');
    if (!next) throw new Error('That address redirected nowhere.');
    return safeFetch(new URL(next, u).toString(), opts, { fetch: f, lookup, hops: hops + 1 });
  }
  return res;
}

async function bodyText(res) {
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BODY) throw new Error('That feed is too big to read.');
  return new TextDecoder().decode(buf);
}

// ---------- ICS ----------
const ICS_STAMP = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/;
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

const dayOf = (utcMs) => {
  const d = new Date(utcMs);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
const addDays = (base, n) => new Date(base.getTime() + n * 86_400_000);
const addMonths = (base, n) => {
  const d = new Date(base.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
};

// A feed stamp in the wall clock of the person reading it: a naive stamp is already local, and a `Z`
// stamp is moved by the player's offset (`tz` is `getTimezoneOffset()`: minutes west of UTC).
function stampOf(value, tz) {
  const m = ICS_STAMP.exec(String(value ?? '').trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, , z] = m;
  const asUtc = Date.UTC(+y, +mo - 1, +d, h ? +h : 0, mi ? +mi : 0);
  const at = z ? asUtc - tz * 60_000 : asUtc;
  const t = new Date(at);
  return { date: dayOf(at), time: h ? `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}` : undefined, at };
}

function parseRule(raw) {
  if (!raw) return null;
  const parts = {};
  for (const bit of String(raw).split(';')) {
    const [k, v] = bit.split('=');
    if (k && v) parts[k.trim().toUpperCase()] = v.trim().toUpperCase();
  }
  const freq = parts.FREQ;
  if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(freq)) return null;
  return {
    freq,
    interval: Math.max(1, Math.min(52, Number(parts.INTERVAL) || 1)),
    count: parts.COUNT ? Math.max(1, Math.min(400, Number(parts.COUNT))) : 0,
    until: parts.UNTIL ? (stampOf(parts.UNTIL.replace(/Z$/, ''), 0)?.date ?? null) : null,
    byday: parts.BYDAY ? parts.BYDAY.split(',').map((d) => d.slice(-2)) : null,
  };
}

const occurrence = (d, s) => ({ date: dayOf(d.getTime()), time: s.time });

// The days a VEVENT actually lands on. A recurring feed is the normal case for a class timetable, so
// DAILY/WEEKLY/MONTHLY with INTERVAL, COUNT, UNTIL and WEEKLY BYDAY are expanded; anything stranger
// (yearly, BYMONTHDAY, complex BYDAY sets) falls back to its first occurrence rather than guessing.
function occurrences(start, s, rule, horizon) {
  if (!rule) return [occurrence(start, s)];
  const out = [];
  const weekday = start.getUTCDay();
  const byday = rule.byday?.map((d) => WEEKDAYS.indexOf(d)).filter((d) => d >= 0) ?? [];
  const push = (d) => {
    const o = occurrence(d, s);
    if (rule.until && o.date > rule.until) return false;
    out.push(o);
    return !(rule.count && out.length >= rule.count);
  };
  if (rule.freq === 'WEEKLY' && byday.length) {
    for (let k = 0; k < horizon && !(rule.count && out.length >= rule.count); k++) {
      const d = addDays(start, k);
      if (!byday.includes(d.getUTCDay())) continue;
      if (Math.floor((weekday + k) / 7) % rule.interval) continue;
      if (!push(d)) break;
    }
    return out;
  }
  for (let i = 0; i < 400 && !(rule.count && out.length >= rule.count); i++) {
    const d = rule.freq === 'DAILY' ? addDays(start, i * rule.interval)
      : rule.freq === 'WEEKLY' ? addDays(start, i * 7 * rule.interval)
        : addMonths(start, i * rule.interval);
    if (!push(d)) break;
  }
  return out;
}

function unescapeIcs(text) {
  return String(text ?? '')
    .replace(/\\[nN]/g, ' ')
    .replace(/\\([\\,;])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

const keyOf = (text) => {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

export function parseIcs(text, { now = Date.now(), tz = 0, horizonDays = 180, limit = MAX_SYNCED_EVENTS } = {}) {
  // Unfold first: an iCal line may be broken anywhere and continued with a space or tab.
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const today = dayOf(now);
  const until = dayOf(now + horizonDays * 86_400_000);
  const out = [];
  let cur = null;

  const flush = () => {
    if (!cur?.start) return;
    const s = stampOf(cur.start, tz);
    if (!s || cur.status === 'CANCELLED') return;
    const skipped = new Set((cur.exdate ?? []).map((v) => stampOf(v, tz)).filter(Boolean)
      .map((e) => `${e.date}${e.time ?? ''}`));
    const rule = parseRule(cur.rrule);
    for (const o of occurrences(new Date(s.at), s, rule, horizonDays)) {
      if (out.length >= limit) return;
      if (o.date < today || o.date > until || skipped.has(`${o.date}${o.time ?? ''}`)) continue;
      const text = unescapeIcs(cur.summary).slice(0, 80) || 'Busy';
      out.push({ key: `${cur.uid || keyOf(`${s.date}${text}`)}@${o.date}${o.time ?? ''}`, date: o.date, time: o.time, text });
    }
  };

  for (const line of lines) {
    // BEGIN/END carry a colon of their own, so they are matched whole, not by their head.
    const whole = line.trim().toUpperCase();
    if (whole === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (whole === 'END:VEVENT') { flush(); cur = null; continue; }
    const i = line.indexOf(':');
    if (!cur || i < 0) continue;
    const name = line.slice(0, i).split(';')[0].trim().toUpperCase();
    const value = line.slice(i + 1);
    if (name === 'DTSTART') cur.start = value;
    else if (name === 'SUMMARY') cur.summary = value;
    else if (name === 'UID') cur.uid = value.trim();
    else if (name === 'STATUS') cur.status = value.trim().toUpperCase();
    else if (name === 'RRULE') cur.rrule = value;
    else if (name === 'EXDATE') cur.exdate = [...(cur.exdate ?? []), ...value.split(',')];
  }
  return out.sort((a, b) => `${a.date}${a.time ?? ''}`.localeCompare(`${b.date}${b.time ?? ''}`)).slice(0, limit);
}

// ---------- the four connectors ----------
// Each returns `{ units, data, events, label, tokens? }` or throws a message fit for a toast. `units`
// is how many things the account did today; the engine turns that into coins and minutes.

const impl = {
  async ics(entry, { fetch: f = fetch, lookup, now }) {
    const res = await safeFetch(entry.value, { headers: { 'user-agent': UA, accept: 'text/calendar, text/plain, */*' } }, { fetch: f, lookup });
    if (!res.ok) throw new Error(`The feed answered ${res.status}.`);
    const events = parseIcs(await bodyText(res), { now, tz: entry.tz ?? 0 });
    return { events, data: { events: events.length }, label: 'Calendar' };
  },

  async github(entry, { fetch: f = fetch, now }) {
    const res = await f(`https://api.github.com/users/${encodeURIComponent(entry.value)}/events/public?per_page=100`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': UA, ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 404) throw new Error(`No GitHub user called ${entry.value}.`);
    if (res.status === 403 || res.status === 429) throw new Error('GitHub is rate-limiting us; trying again later.');
    if (!res.ok) throw new Error(`GitHub answered ${res.status}.`);
    const list = await res.json().catch(() => null);
    if (!Array.isArray(list)) throw new Error('GitHub sent something unexpected.');
    // The day is counted with GitHub's commit search: one request, every public repository, and it does not
    // wait for the events feed - which now omits a push's commit list and can lag for days.
    const midnight = new Date(now);
    midnight.setUTCHours(0, 0, 0, 0);
    const query = encodeURIComponent(`author:${entry.value} author-date:>=${midnight.toISOString().slice(0, 10)}`);
    const search = await f(`https://api.github.com/search/commits?q=${query}&per_page=1`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': UA, ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (search.ok) {
      const found = await search.json().catch(() => null);
      const units = Number(found?.total_count);
      if (Number.isFinite(units)) return { units, data: { units }, label: 'GitHub' };
    }
    const day = utcDay(now);
    const today = list.filter((ev) => ev?.type === 'PushEvent' && utcDay(Date.parse(ev.created_at)) === day);
    // GitHub stopped sending the commit list with a push in the public events feed: a PushEvent now carries
    // only the repository, the ref and two hashes. So when the feed has no commit lists, ask each repository
    // pushed today for this author's commits since midnight: one request per repository, and the count is exact.
    const listed = today.filter((ev) => Array.isArray(ev.payload?.commits));
    let units = 0;
    if (listed.length) units = listed.reduce((n, ev) => n + ev.payload.commits.length, 0);
    else {
      const start = new Date(now);
      start.setUTCHours(0, 0, 0, 0);
      for (const repo of new Set(today.map((ev) => ev.repo?.name).filter(Boolean))) {
        const rc = await f(`https://api.github.com/repos/${repo}/commits?author=${encodeURIComponent(entry.value)}&since=${start.toISOString()}&per_page=100`, {
          headers: { accept: 'application/vnd.github+json', 'user-agent': UA, ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (rc.status === 404) continue; // a repository that went private or away is not a failure
        if (rc.status === 403 || rc.status === 429) throw new Error('GitHub is rate-limiting us; trying again later.');
        if (!rc.ok) throw new Error(`GitHub answered ${rc.status}.`);
        const commits = await rc.json().catch(() => null);
        if (!Array.isArray(commits)) throw new Error('GitHub sent something unexpected.');
        units += commits.length;
      }
    }
    return { units, data: { units }, label: 'GitHub' };
  },

  async leetcode(entry, { fetch: f = fetch, now }) {
    const query = `query ($u: String!) {
      matchedUser(username: $u) { username submitStatsGlobal { acSubmissionNum { difficulty count } } }
      recentAcSubmissionList(username: $u, limit: 20) { timestamp }
    }`;
    const res = await f('https://leetcode.com/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json', referer: `https://leetcode.com/${entry.value}/`, 'user-agent': UA },
      body: JSON.stringify({ query, variables: { u: entry.value } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`LeetCode answered ${res.status}.`);
    const json = await res.json().catch(() => null);
    const user = json?.data?.matchedUser;
    if (!user) throw new Error(`No LeetCode user called ${entry.value}.`);
    const day = utcDay(now);
    const units = (json.data.recentAcSubmissionList ?? [])
      .filter((s) => utcDay(Number(s?.timestamp) * 1000) === day).length;
    const solved = user.submitStatsGlobal?.acSubmissionNum?.find((x) => x.difficulty === 'All')?.count ?? 0;
    // A streak is consecutive days with at least one accepted solution, and only a poll can see that happen,
    // so it lives on the connector. `day` rides in the data so a rollover cannot tick a stale count.
    const yesterday = utcDay(now - 86_400_000);
    const last = entry.data?.lastSolved ?? null;
    let streak = Number(entry.data?.streak) || 0;
    if (units > 0) streak = last === day ? Math.max(streak, 1) : last === yesterday ? streak + 1 : 1;
    else if (last && last !== day && last !== yesterday) streak = 0;
    // Milestones pay once per run: 3 and 7 days, then every 15 days, at 10 coins per day of the streak.
    entry.awards ??= {};
    if (streak <= 1) entry.awards = {};
    let bonus = 0;
    for (const days of leetcodeMilestones(streak)) {
      if (!entry.awards[days]) { entry.awards[days] = day; bonus += days * LEETCODE_COINS_PER_DAY; }
    }
    return {
      units,
      data: { units, solved, streak, lastSolved: units > 0 ? day : last, day },
      label: 'LeetCode',
      ...(bonus ? { bonus, note: `${streak}-day streak! +${bonus} coins` } : {}),
    };
  },

  async spotify(entry, { fetch: f = fetch, now }) {
    if (!spotifyConfigured()) throw new Error('Spotify is not set up on this server.');
    if (!entry.tokens?.refresh) throw new Error('Spotify needs reconnecting.');
    const access = await spotifyAccess(entry.tokens, f);
    const res = await f('https://api.spotify.com/v1/me/player/currently-playing?market=from_token', {
      headers: { authorization: `Bearer ${access}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 204) return { data: { track: null, artist: null, playing: false }, label: 'Spotify' };
    if (res.status === 401) { entry.tokens = null; throw new Error('Spotify sign-in expired; reconnect it.'); }
    if (res.status === 429) throw new Error('Spotify is rate-limiting us; trying again later.');
    if (!res.ok) throw new Error(`Spotify answered ${res.status}.`);
    const json = await res.json().catch(() => null);
    const item = json?.item;
    if (!item?.name) return { data: { track: null, artist: null, playing: false }, label: 'Spotify' };
    return {
      data: {
        track: String(item.name).slice(0, 80),
        artist: (item.artists ?? []).map((a) => a.name).filter(Boolean).join(', ').slice(0, 80),
        playing: json?.is_playing !== false, // paused is still "here", but the card's button must say Play
        at: now,
      },
      label: 'Spotify',
    };
  },
};

// ---------- Spotify OAuth (Tier 2) ----------
// The app owner's Development Mode credentials, in the environment like mail's. Dev Mode is limited to
// five allowlisted listeners, so this is a friends-and-family connector until Spotify grants a quota.
const SPOTIFY_ID = () => String(process.env.SPOTIFY_CLIENT_ID ?? '').trim();
const SPOTIFY_SECRET = () => String(process.env.SPOTIFY_CLIENT_SECRET ?? '').trim();
const SPOTIFY_SCOPES = 'user-read-currently-playing user-read-playback-state user-modify-playback-state';
export const spotifyConfigured = () => !!(SPOTIFY_ID() && SPOTIFY_SECRET());

const basic = () => `Basic ${Buffer.from(`${SPOTIFY_ID()}:${SPOTIFY_SECRET()}`).toString('base64')}`;

export function spotifyAuthUrl(state, redirect) {
  const q = new URLSearchParams({
    client_id: SPOTIFY_ID(), response_type: 'code', redirect_uri: redirect, state, scope: SPOTIFY_SCOPES,
  });
  return `https://accounts.spotify.com/authorize?${q}`;
}

export async function spotifyExchange(code, redirect, { fetch: f = fetch } = {}) {
  const res = await f('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { authorization: basic(), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirect }).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Spotify refused the sign-in (${res.status}).`);
  const json = await res.json().catch(() => null);
  if (!json?.access_token) throw new Error('Spotify sent no token.');
  return {
    access: json.access_token,
    refresh: json.refresh_token ?? '',
    expires: Date.now() + (Number(json.expires_in) || 3600) * 1000,
    // Kept so the row can say "reconnect" before a control is pressed: a refresh token cannot gain a scope.
    scope: String(json.scope ?? ''),
  };
}

async function spotifyAccess(tokens, f) {
  if (tokens.access && Number(tokens.expires) > Date.now() + 60_000) return tokens.access;
  const res = await f('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { authorization: basic(), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh }).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error('Spotify sign-in expired; reconnect it.');
  const json = await res.json().catch(() => null);
  if (!json?.access_token) throw new Error('Spotify sign-in expired; reconnect it.');
  tokens.access = json.access_token;
  tokens.expires = Date.now() + (Number(json.expires_in) || 3600) * 1000;
  if (json.refresh_token) tokens.refresh = json.refresh_token;
  return tokens.access;
}

// Playback control for the record player's card. Spotify allows it only on Premium, with an active device, and
// only when the sign-in asked for `user-modify-playback-state` — each refusal is a sentence for the row, not an
// exception in a save.
const SPOTIFY_CALLS = {
  play: ['PUT', 'play'], pause: ['PUT', 'pause'], next: ['POST', 'next'], previous: ['POST', 'previous'],
};
export async function spotifyControl(entry, action, { fetch: f = fetch } = {}) {
  const call = SPOTIFY_CALLS[String(action)];
  if (!call) throw new Error('The record player cannot do that.');
  if (!spotifyConfigured()) throw new Error('Spotify is not set up on this server.');
  if (!entry?.tokens?.refresh) throw new Error('Spotify needs reconnecting.');
  // Resuming needs a device. After a pause asked for over the API the phone can drop off "active", and a
  // bodyless PUT /play then answers 404, which reads as "play does nothing". Name the device we can see so
  // playback moves back to it; next/pause already act on whatever is playing.
  let query = '';
  let access = await spotifyAccess(entry.tokens, f);
  if (call[1] === 'play') {
    const state = await f('https://api.spotify.com/v1/me/player', {
      headers: { authorization: `Bearer ${access}` }, signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const device = (await state.json().catch(() => null))?.device?.id;
    if (device) query = `?device_id=${encodeURIComponent(device)}`;
  }
  const url = `https://api.spotify.com/v1/me/player/${call[1]}${query}`;
  const send = (token) => f(url, {
    method: call[0], headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  let res = await send(access);
  if (res.status === 401) {
    // A dead access token and a missing permission both answer 401 ("The access token expired" vs
    // "Permissions missing"). One forced refresh tells them apart: a new token fixes the first, never the second.
    entry.tokens.expires = 0;
    access = await spotifyAccess(entry.tokens, f);
    res = await send(access);
  }
  const body = await res.json().catch(() => null);
  const why = String(body?.error?.message ?? '');
  // Spotify says "Permissions missing" (401) or "Premium required" (403); the row needs the human sentence.
  if (/permission/i.test(why)) throw new Error('Reconnect Spotify in Settings to allow play and pause: the new permission was not granted when it was linked.');
  if (/premium/i.test(why)) throw new Error('Spotify playback control needs a Premium account.');
  if (res.status === 401) throw new Error('Spotify rejected the sign-in; reconnect it in Settings.');
  if (res.status === 403) throw new Error('Spotify will not change playback on this account or device.');
  if (res.status === 404) throw new Error('No Spotify device is active. Play something once, then try again.');
  if (res.status === 429) throw new Error('Spotify is rate-limiting us; trying again in a moment.');
  if (!res.ok) throw new Error(`Spotify answered ${res.status}${why ? `: ${why}` : ''}.`);
}

// Consistency is its own reward, once per run, and never inside the daily cap: 3 and 7 days, then every 15 days
// (15, 30, 45, 60, 75, …), at 10 coins per day of the streak — 3→30, 7→70, 15→150, 30→300, 45→450, 60→600, and
// 750 at 75 — and a broken streak starts the run again.
const LEETCODE_COINS_PER_DAY = 10;
function leetcodeMilestones(streak) {
  const out = [];
  if (streak >= 3) out.push(3);
  if (streak >= 7) out.push(7);
  for (let d = 15; d <= streak; d += 15) out.push(d);
  return out;
}
export const LEETCODE_TASK = 'Solve today’s LeetCode problem';

// The daily LeetCode to-do the connector itself ticks. One row, not a new one every day: it is reused, rolled
// over when the UTC day changes, and marked done as soon as an accepted solution appears in today's poll, so
// the task and the proof of it come from the same place. The player can still tick or edit it by hand.
export function leetcodeTask(p, newId, now = Date.now()) {
  if (!p.conn?.leetcode) return false;
  const day = utcDay(now);
  p.todos ??= [];
  const t = p.todos.find((x) => x.conn === 'leetcode');
  if (!t) {
    p.todos.push({ id: newId(), text: LEETCODE_TASK, done: false, by: p.name, byId: p.id, ticks: [], conn: 'leetcode', day });
    return true;
  }
  let touched = false;
  if (t.day !== day) { t.day = day; t.done = false; t.doneAt = null; touched = true; } // a fresh day, a fresh task
  const today = p.conn.leetcode.data;
  if (!t.done && today?.day === day && Number(today.units ?? 0) > 0) { t.done = true; t.doneAt = now; touched = true; }
  return touched;
}

// ---------- what the player sees ----------
const mask = (value) => {
  const s = String(value ?? '');
  return s.length <= 42 ? s : `${s.slice(0, 30)}…${s.slice(-6)}`;
};

export function connectorView(p) {
  return Object.entries(p.conn ?? {})
    .filter(([id]) => CONNECTOR_BY_ID[id])
    .map(([id, e]) => ({
      id,
      label: CONNECTOR_BY_ID[id].label,
      value: mask(e.value),
      lastSync: e.lastSync ?? null,
      error: e.error ?? null,
      data: e.data ?? null,
      // Today's work and what it has paid, so the row in Settings can say "2 commits · 20/50 coins today".
      // This is the only place the day's ledger is shown: the reward itself still arrives as a toast.
      today: e.paid?.day === utcDay(Date.now())
        ? { units: e.paid.units ?? 0, coins: e.paid.coins ?? 0, minutes: e.paid.minutes ?? 0 }
        : null,
      // A refresh token keeps the scopes it was granted with, so an account linked before play/pause existed
      // can read the track but cannot control it. Say so before the card is pressed, not after a 401.
      warning: id === 'spotify' && !!e.tokens && !String(e.tokens.scope ?? '').includes('user-modify-playback-state')
        ? 'Reconnect to allow play and pause.'
        : null,
    }));
}

const USERNAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,38}$/;
const LEETCODE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,29}$/;

// Returns a message to show, or null when the connector was stored. Changing a value keeps the paid
// ledger for the day (the day's activity is the same account's work either way) but forgets the cache.
export function addConnector(p, kind, value) {
  const def = CONNECTOR_BY_ID[kind];
  if (!def) return 'That is not a connector Auralis knows.';
  if (def.oauth) return `${def.label} is connected from its own button.`;
  const clean = String(value ?? '').trim();
  if (!clean) return `Enter your ${def.valueLabel.toLowerCase()}.`;
  if (clean.length > def.max) return `That ${def.valueLabel.toLowerCase()} is too long.`;
  if (kind === 'github' && !USERNAME.test(clean)) return 'That is not a GitHub username.';
  if (kind === 'leetcode' && !LEETCODE_NAME.test(clean)) return 'That is not a LeetCode username.';
  if (kind === 'ics') {
    let u;
    try { u = new URL(clean); } catch { return 'That is not a web address.'; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'Only http and https addresses work.';
  }
  p.conn ??= {};
  const old = p.conn[kind];
  delete p.conn[kind];
  // A feed's dates belong to the feed: a new address starts a clean list.
  if (old && kind === 'ics') p.events = (p.events ?? []).filter((e) => e.src !== kind);
  p.conn[kind] = { value: clean, lastSync: 0, error: null, nextAt: 0, data: null, paid: old?.paid ?? null };
  return null;
}

export function removeConnector(p, kind) {
  if (!p.conn?.[kind]) return false;
  delete p.conn[kind];
  p.events = (p.events ?? []).filter((e) => e.src !== kind);
  return true;
}

// A deleted imported event stays deleted: the key is remembered so the next sync does not bring it back.
export function hideEvent(p, ev) {
  if (!ev?.src || !ev.key) return;
  p.connHidden = [...new Set([...(p.connHidden ?? []), ev.key])].slice(-200);
}

// Replace one connector's events and leave every hand-written one alone. Imported dates never push out
// a date the player typed: they fill what room is left under MAX_EVENTS.
export function applyEvents(p, kind, incoming, maxEvents = 100) {
  const before = JSON.stringify((p.events ?? []).filter((e) => e.src === kind).map((e) => `${e.key}${e.date}${e.time ?? ''}${e.text}`));
  const manual = (p.events ?? []).filter((e) => e.src !== kind);
  const hidden = new Set(p.connHidden ?? []);
  const seen = new Set();
  const list = [];
  for (const e of incoming) {
    if (hidden.has(e.key) || seen.has(e.key)) continue;
    seen.add(e.key);
    list.push({ ...e, src: kind });
    if (list.length >= MAX_SYNCED_EVENTS) break;
  }
  const room = Math.max(0, maxEvents - manual.length);
  const merged = [...manual, ...list.slice(0, room)]
    .sort((a, b) => `${a.date}${a.time ?? ''}`.localeCompare(`${b.date}${b.time ?? ''}`))
    .slice(0, maxEvents);
  p.events = merged;
  return before !== JSON.stringify(list.map((e) => `${e.key}${e.date}${e.time ?? ''}${e.text}`));
}

// ---------- the engine ----------
// Coins and minutes are paid on the *delta* of today's totals, so a sync that sees the same 7 commits
// again pays nothing, and a partial unit (one commit of a two-commit coin) is not lost at a day edge.
function grant(p, def, entry, units, now) {
  const day = utcDay(now);
  if (entry.paid?.day !== day) entry.paid = { day, units: 0, coins: 0, minutes: 0 };
  const coinsToday = Math.min(Math.floor(units / def.coinPer) * def.coinEach, def.coinsPerDay);
  const minutesToday = Math.min(units * def.minutesEach, def.minutesPerDay);
  const coins = Math.max(0, coinsToday - entry.paid.coins);
  const minutes = Math.max(0, minutesToday - entry.paid.minutes);
  entry.paid.coins = Math.max(entry.paid.coins, coinsToday);
  entry.paid.minutes = Math.max(entry.paid.minutes, minutesToday);
  entry.paid.units = units;
  if (coins) p.coins += coins;
  return { coins, minutes };
}

export async function syncPlayer(p, { fetch: f = fetch, lookup, now = Date.now(), record, maxEvents = 100, force = false } = {}) {
  const entries = Object.entries(p.conn ?? {}).filter(([id]) => CONNECTOR_BY_ID[id] && impl[id]);
  let changed = false, coins = 0, minutes = 0, label = null, bonus = 0, note = '';

  for (const [kind, entry] of entries) {
    // `force` is a connector id (or true): a press on the record player's card cannot wait for the clock.
    if ((entry.nextAt ?? 0) > now && force !== true && force !== kind) continue;
    const def = CONNECTOR_BY_ID[kind];
    try {
      const out = await impl[kind](entry, { fetch: f, lookup, now, player: p });
      // Only a change a screen can see counts as one: a new or removed date, a coin or minute paid, an error
      // that appeared or cleared, or the record player's track. Counting `lastSync` made every sweep a change,
      // so a connected player had the whole house state rebuilt - and a save run - each time their connector
      // came due, every two minutes for Spotify.
      if (entry.error) changed = true; // an error that cleared is worth a repaint
      entry.error = null;
      entry.lastSync = now;
      entry.nextAt = now + def.every * 60_000;
      const data = out.data ?? null;
      // The track, artist and playing flag, not `at`: it is restamped on every poll, so comparing it would
      // make every Spotify sync look like a new song.
      const was = entry.data ?? {};
      // A pause or a resume is a change the card draws (the button flips), so it must reach the screen too.
      if (kind === 'spotify' && (data?.track !== was.track || data?.artist !== was.artist || data?.playing !== was.playing)) changed = true;
      entry.data = data;
      if (Number(out.bonus) > 0) { p.coins += out.bonus; coins += out.bonus; bonus += out.bonus; note = out.note ?? note; changed = true; }
      if (out.events && applyEvents(p, kind, out.events, maxEvents)) changed = true;
      if (def.activity && Number.isFinite(out.units)) {
        const g = grant(p, def, entry, out.units, now);
        coins += g.coins;
        minutes += g.minutes;
        // New activity is a change even when it paid no coin yet: its minutes are a session, and the paid
        // ledger has to reach the row or a restart would pay the same commits again.
        if (g.coins || g.minutes) { label = out.label ?? def.label; changed = true; }
      }
    } catch (err) {
      const message = String(err?.message ?? err).slice(0, 140);
      if (message !== entry.error) { entry.error = message; changed = true; }
      entry.nextAt = now + RETRY_MS;
    }
  }

  if (minutes && record) record(p, minutes, label ?? 'Study');
  return { changed, coins, minutes, label, bonus, note };
}

// One pass over everyone with a connector, which is what the sweeper calls. Sequential on purpose: a
// free host should not open a dozen sockets at once for a feature nobody is watching.
export async function syncDue(players, opts = {}) {
  const changed = [];
  for (const p of Object.values(players)) {
    if (p.__stub || !p.conn || !Object.keys(p.conn).length) continue;
    const r = await syncPlayer(p, opts);
    if (r.changed) changed.push({ id: p.id, ...r });
  }
  return changed;
}

export { CONNECTORS };
