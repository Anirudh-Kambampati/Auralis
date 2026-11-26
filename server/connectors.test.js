// The connector layer's tests: the ICS parser (the one piece with real edge cases), the rate rules, and
// a sync pass against a fake fetch — no network, no DNS, no credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import { addConnector, applyEvents, connectorView, hideEvent, parseIcs, removeConnector, spotifyControl, syncPlayer } from './connectors.js';
import { social } from './social.js';

const lookup = async () => [{ address: '93.184.216.34' }];
const at = (iso) => Date.parse(iso);

const feed = (body, { now = at('2026-11-26T09:00:00Z'), tz = 0, limit } = {}) =>
  parseIcs(body, { now, tz, ...(limit ? { limit } : {}) });

const ics = (...lines) => ['BEGIN:VCALENDAR', ...lines, 'END:VCALENDAR'].join('\r\n');

test('an all-day event keeps its date and has no time', () => {
  const out = feed(ics('BEGIN:VEVENT', 'UID:a@x', 'DTSTART;VALUE=DATE:20261127', 'SUMMARY:Reading day', 'END:VEVENT'));
  assert.equal(out.length, 1);
  assert.equal(out[0].date, '2026-11-27');
  assert.equal(out[0].time, undefined);
  assert.equal(out[0].text, 'Reading day');
});

test('a UTC stamp is moved into the reader\'s wall clock, a naive one is left alone', () => {
  // tz is getTimezoneOffset(): +60 means the reader is an hour behind UTC.
  const out = feed(ics('BEGIN:VEVENT', 'DTSTART:20261127T140000Z', 'SUMMARY:Lecture', 'END:VEVENT'), { tz: 60 });
  assert.equal(out[0].date, '2026-11-27');
  assert.equal(out[0].time, '13:00');
  assert.equal(feed(ics('BEGIN:VEVENT', 'DTSTART;TZID=Europe/London:20261127T140000', 'SUMMARY:Lecture', 'END:VEVENT'))[0].time, '14:00');
});

test('a folded line and an escaped summary are read as one', () => {
  const out = feed(ics(
    'BEGIN:VEVENT',
    'DTSTART:20261127T100000',
    'SUMMARY:Algorithms, problem\\, set',
    '  two',
    'END:VEVENT',
  ));
  assert.equal(out[0].text, 'Algorithms, problem, set two');
});

test('past events are dropped and the nearest ones are kept in order', () => {
  const out = feed(ics(
    'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20260101', 'SUMMARY:Old', 'END:VEVENT',
    'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261201', 'SUMMARY:Later', 'END:VEVENT',
    'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261127', 'SUMMARY:Sooner', 'END:VEVENT',
  ));
  assert.deepEqual(out.map((e) => e.text), ['Sooner', 'Later']);
});

test('a cancelled event is left out', () => {
  const out = feed(ics('BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261127', 'SUMMARY:Off', 'STATUS:CANCELLED', 'END:VEVENT'));
  assert.equal(out.length, 0);
});

test('a weekly class expands through the term', () => {
  // 2026-11-26 is a Thursday.
  const out = feed(ics(
    'BEGIN:VEVENT', 'UID:class@x', 'DTSTART:20261126T090000', 'SUMMARY:Algorithms',
    'RRULE:FREQ=WEEKLY;BYDAY=TH;COUNT=4', 'END:VEVENT',
  ));
  assert.deepEqual(out.map((e) => e.date), ['2026-11-26', '2026-12-03', '2026-12-10', '2026-12-17']);
  assert.equal(new Set(out.map((e) => e.key)).size, 4); // each occurrence is its own key
});

test('EXDATE takes one occurrence out of a series', () => {
  const out = feed(ics(
    'BEGIN:VEVENT', 'DTSTART:20261126T090000', 'SUMMARY:Algorithms',
    'RRULE:FREQ=WEEKLY;BYDAY=TH;COUNT=3', 'EXDATE:20261203T090000', 'END:VEVENT',
  ));
  assert.deepEqual(out.map((e) => e.date), ['2026-11-26', '2026-12-10']);
});

test('the limit is a cap, not a hint', () => {
  assert.equal(feed(ics('BEGIN:VEVENT', 'DTSTART:20261126T090000', 'SUMMARY:Study', 'RRULE:FREQ=DAILY;COUNT=40', 'END:VEVENT'), { limit: 5 }).length, 5);
});

test('a feed address that points at the private network is refused', async () => {
  let called = false;
  const p = { id: 'p1', coins: 0, events: [], conn: { ics: { value: 'http://192.168.1.5/cal.ics', nextAt: 0, tz: 0 } } };
  const r = await syncPlayer(p, {
    lookup: async () => [{ address: '192.168.1.5' }],
    fetch: async () => { called = true; return new Response(''); },
  });
  assert.equal(called, false);
  assert.match(p.conn.ics.error, /not reachable/);
  assert.equal(r.changed, true);
});

test('a synced feed adds events, and re-syncing the same feed changes nothing', async () => {
  const body = ics('BEGIN:VEVENT', 'UID:a@x', 'DTSTART;VALUE=DATE:20261127', 'SUMMARY:Reading day', 'END:VEVENT');
  const p = { id: 'p1', coins: 0, events: [], conn: { ics: { value: 'https://example.com/c.ics', nextAt: 0, tz: 0 } } };
  const f = async () => new Response(body, { status: 200, headers: { 'content-type': 'text/calendar' } });
  await syncPlayer(p, { fetch: f, lookup, now: at('2026-11-26T09:00:00Z') });
  assert.equal(p.events.length, 1);
  assert.equal(p.events[0].src, 'ics');
  const again = await syncPlayer(p, { fetch: f, lookup, now: at('2026-11-26T09:10:00Z') });
  assert.equal(again.changed, false); // only lastSync moved, and that is not an event change
});

test('imported dates never push out a date the player wrote', () => {
  const p = { events: [{ id: 1, date: '2026-11-27', text: 'Dentist' }] };
  applyEvents(p, 'ics', [{ key: 'k1', date: '2026-11-28', text: 'Lecture' }], 1);
  assert.deepEqual(p.events.map((e) => e.text), ['Dentist']);
});

test('a deleted imported event stays deleted across syncs', () => {
  const p = { events: [] };
  const incoming = [{ key: 'k1', date: '2026-11-28', text: 'Lecture' }];
  applyEvents(p, 'ics', incoming);
  const ev = p.events[0];
  hideEvent(p, ev);
  p.events = p.events.filter((e) => e.key !== ev.key);
  applyEvents(p, 'ics', incoming);
  assert.equal(p.events.length, 0);
});

test('github commits pay coins and minutes once, on the delta, up to the day cap', async () => {
  const p = { id: 'p1', coins: 0, events: [], conn: { github: { value: 'octocat', nextAt: 0, paid: null } } };
  const now = at('2026-11-26T12:00:00Z');
  let commits = 4;
  const f = async () => new Response(JSON.stringify([
    { type: 'PushEvent', created_at: '2026-11-26T10:00:00Z', payload: { commits: Array(commits).fill({}) } },
  ]), { status: 200 });
  const recorded = [];
  const record = (pl, minutes, tag) => recorded.push({ minutes, tag });

  const first = await syncPlayer(p, { fetch: f, now, record });
  assert.equal(p.coins, 2); // one coin per two commits
  assert.equal(first.minutes, 8); // two minutes a commit
  assert.deepEqual(recorded, [{ minutes: 8, tag: 'GitHub' }]);

  p.conn.github.nextAt = 0;
  const again = await syncPlayer(p, { fetch: f, now: now + 60_000, record });
  assert.equal(again.coins, 0); // the same four commits are not paid twice
  assert.equal(again.minutes, 0);

  commits = 10; // four more today
  p.conn.github.nextAt = 0;
  await syncPlayer(p, { fetch: f, now: now + 120_000, record });
  assert.equal(p.coins, 5); // floor(10 / 2)
  assert.equal(recorded.at(-1).minutes, 12); // 20 total, 8 already paid
});

test('a rate-limited github call becomes an error string, not a throw', async () => {
  const p = { id: 'p1', coins: 0, events: [], conn: { github: { value: 'octocat', nextAt: 0 } } };
  await syncPlayer(p, { fetch: async () => new Response('{}', { status: 403 }), now: Date.now() });
  assert.match(p.conn.github.error, /rate-limiting/);
  assert.ok(p.conn.github.nextAt > Date.now()); // backed off
});

test('leetcode counts today\'s accepted solutions only', async () => {
  const now = at('2026-11-26T12:00:00Z');
  const p = { id: 'p1', coins: 0, events: [], conn: { leetcode: { value: 'neet', nextAt: 0 } } };
  const json = {
    data: {
      matchedUser: { submitStatsGlobal: { acSubmissionNum: [{ difficulty: 'All', count: 321 }] } },
      recentAcSubmissionList: [
        { timestamp: String(at('2026-11-26T08:00:00Z') / 1000) },
        { timestamp: String(at('2026-11-25T08:00:00Z') / 1000) },
      ],
    },
  };
  await syncPlayer(p, { fetch: async () => new Response(JSON.stringify(json), { status: 200 }), now });
  assert.equal(p.coins, 2);
  assert.equal(p.conn.leetcode.data.solved, 321);
  assert.equal(p.conn.leetcode.data.units, 1);
});

test('adding and removing a connector is validated and cleans up after itself', () => {
  const p = { events: [] };
  assert.match(addConnector(p, 'nope', 'x'), /not a connector/);
  assert.match(addConnector(p, 'github', 'not a name!'), /not a GitHub username/);
  assert.match(addConnector(p, 'ics', 'ftp://example.com/x'), /http and https/);
  assert.equal(addConnector(p, 'github', 'octocat'), null);
  assert.equal(p.conn.github.value, 'octocat');
  addConnector(p, 'ics', 'https://example.com/c.ics');
  applyEvents(p, 'ics', [{ key: 'k1', date: '2026-11-28', text: 'Lecture' }]);
  assert.equal(removeConnector(p, 'ics'), true);
  assert.equal(p.events.length, 0);
  assert.equal(p.conn.ics, undefined);
});

test('the panel view masks a long feed address and never carries a token', () => {
  const long = `https://calendar.google.com/calendar/ical/${'a'.repeat(80)}/basic.ics`;
  const p = { conn: { ics: { value: long, lastSync: 1, error: null, data: { events: 2 } }, spotify: { tokens: { refresh: 'secret' }, data: { track: 'Song' } } } };
  const view = connectorView(p);
  const icsRow = view.find((r) => r.id === 'ics');
  assert.ok(icsRow.value.length < long.length);
  assert.equal(JSON.stringify(view).includes('secret'), false);
});

test('a sweep that finds the same feed again is not a change', async () => {
  const body = ics('BEGIN:VEVENT', 'UID:a@x', 'DTSTART;VALUE=DATE:20261127', 'SUMMARY:Reading day', 'END:VEVENT');
  const p = { id: 'p1', coins: 0, events: [], conn: { ics: { value: 'https://example.com/c.ics', nextAt: 0, tz: 0 } } };
  const f = async () => new Response(body, { status: 200 });
  const first = await syncPlayer(p, { fetch: f, lookup, now: at('2026-11-26T09:00:00Z') });
  assert.equal(first.changed, true);
  p.conn.ics.nextAt = 0; // due again, as the next sweep would find it
  const again = await syncPlayer(p, { fetch: f, lookup, now: at('2026-11-26T09:30:00Z') });
  assert.equal(again.changed, false); // nothing to rebuild and nothing to save
});

test('the same commits twice are one change, not one per sweep', async () => {
  const now = at('2026-11-26T12:00:00Z');
  const p = { id: 'p1', coins: 0, events: [], conn: { github: { value: 'octocat', nextAt: 0 } } };
  const f = async () => new Response(JSON.stringify([
    { type: 'PushEvent', created_at: '2026-11-26T10:00:00Z', payload: { commits: [{}] } },
  ]), { status: 200 });
  const first = await syncPlayer(p, { fetch: f, now });
  assert.equal(first.changed, true); // two study minutes for the one commit
  p.conn.github.nextAt = 0;
  const again = await syncPlayer(p, { fetch: f, now: now + 15 * 60_000 });
  assert.equal(again.changed, false);
  assert.equal(again.minutes, 0);
});

test('a record player whose song has not changed is not a rebroadcast', async () => {
  const spotifyBody = { item: { name: 'Study Loop', artists: [{ name: 'Lo-fi' }] } };
  const f = async () => new Response(JSON.stringify(spotifyBody), { status: 200 });
  const now = at('2026-11-26T12:00:00Z');
  const p = { id: 'p1', coins: 0, events: [], conn: { spotify: { value: 'Spotify', tokens: { refresh: 'r', access: 'a', expires: now + 3_600_000 }, nextAt: 0 } } };
  process.env.SPOTIFY_CLIENT_ID = 'id';
  process.env.SPOTIFY_CLIENT_SECRET = 'secret';
  const first = await syncPlayer(p, { fetch: f, now });
  assert.equal(first.changed, true);
  p.conn.spotify.nextAt = 0;
  const again = await syncPlayer(p, { fetch: f, now: now + 120_000 });
  assert.equal(again.changed, false);
});

test('the record player card asks Spotify for the right call and reports a refusal', async () => {
  process.env.SPOTIFY_CLIENT_ID = 'id';
  process.env.SPOTIFY_CLIENT_SECRET = 'secret';
  const calls = [];
  const ok = async (url, init) => { calls.push(`${init?.method} ${new URL(url).pathname}`); return new Response(null, { status: 204 }); };
  const entry = { tokens: { refresh: 'r', access: 'a', expires: Date.now() + 3_600_000 } };
  await spotifyControl(entry, 'next', { fetch: ok });
  await spotifyControl(entry, 'pause', { fetch: ok });
  assert.deepEqual(calls, ['POST /v1/me/player/next', 'PUT /v1/me/player/pause']);
  const premium = async () => new Response(JSON.stringify({ error: { status: 403, message: 'Player command failed: Premium required', reason: 'PREMIUM_REQUIRED' } }), { status: 403 });
  await assert.rejects(() => spotifyControl(entry, 'play', { fetch: premium }), /needs a Premium account/);
  await assert.rejects(() => spotifyControl(entry, 'dance', { fetch: ok }), /cannot do that/);

  const paused = async () => new Response(JSON.stringify({ is_playing: false, item: { name: 'Vetaagadhe', artists: [{ name: 'Sushin Shyam' }] } }), { status: 200 });
  const moved = await syncPlayer({ id: 'p9', coins: 0, events: [], conn: { spotify: { value: 'Spotify', tokens: { refresh: 'r', access: 'a', expires: Date.now() + 3_600_000 }, nextAt: Date.now() + 60_000, data: { track: 'Vetaagadhe', artist: 'Sushin Shyam', playing: true } } } }, { fetch: paused, force: 'spotify' });
  assert.equal(moved.changed, true); // a resume or pause is drawn, and force ignores the 2-minute clock

  // An account linked before play/pause existed: the token is fine, the scope is not. Spotify says 401
  // "Permissions missing"; one forced refresh is tried, then the row gets the human sentence.
  const hit = [];
  const noPerm = async (url) => {
    if (url.startsWith('https://accounts.spotify.com')) return new Response(JSON.stringify({ access_token: 'a2', expires_in: 3600 }), { status: 200 });
    hit.push(new URL(url).pathname);
    return new Response(JSON.stringify({ error: { status: 401, message: 'Permissions missing' } }), { status: 401 });
  };
  await assert.rejects(() => spotifyControl(entry, 'play', { fetch: noPerm }), /Reconnect Spotify in Settings/);
  // The device is looked up first, then the play call is tried twice (the second after a forced refresh).
  assert.deepEqual(hit, ['/v1/me/player', '/v1/me/player/play', '/v1/me/player/play']);
  const view = connectorView({ conn: { spotify: { value: 'Spotify', tokens: { refresh: 'r', scope: 'user-read-playback-state' }, data: null } } });
  assert.equal(view[0].warning, 'Reconnect to allow play and pause.');
  const fresh = connectorView({ conn: { spotify: { value: 'Spotify', tokens: { refresh: 'r', scope: 'user-read-playback-state user-modify-playback-state' }, data: null } } });
  assert.equal(fresh[0].warning, null);
});

test('deleting an imported date hides it, so its feed cannot bring it back', async () => {
  const p = { id: 'p1', events: [{ id: 7, src: 'ics', key: 'k1', date: '2026-11-28', text: 'Lecture' }] };
  await social.event_del({ db: { houses: { H: {} } }, p, m: { scope: 'personal', id: 7 }, hideEvent });
  assert.equal(p.events.length, 0);
  assert.deepEqual(p.connHidden, ['k1']);
  applyEvents(p, 'ics', [{ key: 'k1', date: '2026-11-28', text: 'Lecture' }]);
  assert.equal(p.events.length, 0);
});
