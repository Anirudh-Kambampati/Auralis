import test from 'node:test';
import assert from 'node:assert/strict';
import { chart, streak, startOf, shift, rangeTitle, hm } from './stats.js';

const at = (y, m, d, h = 12) => new Date(y, m, d, h).getTime();
const sessions = [
  { at: at(2026, 9, 26, 9), minutes: 25, tag: 'Maths' }, // Mon
  { at: at(2026, 9, 29, 20), minutes: 60, tag: 'Reading' }, // Thu
  { at: at(2026, 9, 29, 21), minutes: 25, tag: 'Maths' },
  { at: at(2026, 9, 31, 10), minutes: 15 }, // Sat, no tag
  { at: at(2026, 10, 2, 10), minutes: 45, tag: 'Maths' }, // next week
];

test('week chart buckets by weekday and totals subjects', () => {
  const c = chart(sessions, 'week', at(2026, 9, 28));
  assert.deepEqual(c.values, [0, 25, 0, 0, 85, 0, 15]);
  assert.equal(c.total, 125);
  assert.equal(c.count, 4);
  assert.deepEqual(c.tags.map((t) => t.tag), ['Reading', 'Maths', 'Study']);
  assert.equal(c.tags[0].pct, 48);
});

test('day, month and year charts', () => {
  assert.equal(chart(sessions, 'day', at(2026, 9, 29)).values[20], 60);
  const month = chart(sessions, 'month', at(2026, 9, 5));
  assert.equal(month.labels.length, 31);
  assert.equal(month.values[28], 85);
  const year = chart(sessions, 'year', at(2026, 0, 1));
  assert.equal(year.values[9], 125);
  assert.equal(year.values[10], 45);
});

test('ranges step and title correctly', () => {
  const from = startOf('week', at(2026, 9, 28));
  assert.equal(from.getDay(), 0);
  assert.equal(shift('month', at(2026, 0, 31), 1).getMonth(), 1); // no Jan 31 -> Mar overflow
  assert.equal(rangeTitle('week', from), 'Oct 25 – Oct 31');
  assert.equal(hm(125), '2h 5m');
  assert.equal(hm(45), '45m');
});

test('streak counts consecutive days back from today or yesterday', () => {
  const s = [at(2026, 9, 29), at(2026, 9, 30), at(2026, 9, 31)].map((a) => ({ at: a, minutes: 25 }));
  assert.equal(streak(s, at(2026, 9, 31, 18)), 3);
  assert.equal(streak(s, at(2026, 10, 1, 8)), 3); // nothing yet today: still counts
  assert.equal(streak(s, at(2026, 10, 2, 8)), 0); // missed a day
});
