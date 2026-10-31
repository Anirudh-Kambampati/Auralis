// Study statistics from finished sessions ({ at: ms, minutes, tag }), bucketed in the viewer's local time.

export const RANGES = ['day', 'week', 'month', 'year'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function startOf(range, date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  if (range === 'week') d.setDate(d.getDate() - d.getDay());
  if (range === 'month') d.setDate(1);
  if (range === 'year') d.setMonth(0, 1);
  return d;
}

export function shift(range, date, n) {
  const d = new Date(date);
  if (range === 'day') d.setDate(d.getDate() + n);
  if (range === 'week') d.setDate(d.getDate() + 7 * n);
  if (range === 'month') d.setMonth(d.getMonth() + n, 1);
  if (range === 'year') d.setFullYear(d.getFullYear() + n, 0, 1);
  return d;
}

export function chart(sessions, range, anchor) {
  const from = startOf(range, anchor);
  const to = startOf(range, shift(range, from, 1));
  let labels, index;
  if (range === 'day') {
    labels = Array.from({ length: 24 }, (_, h) => (h % 6 === 0 ? `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}` : ''));
    index = (d) => d.getHours();
  } else if (range === 'week') {
    labels = DAYS;
    index = (d) => d.getDay();
  } else if (range === 'month') {
    const n = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
    labels = Array.from({ length: n }, (_, i) => (i === 0 || (i + 1) % 5 === 0 ? String(i + 1) : ''));
    index = (d) => d.getDate() - 1;
  } else {
    labels = MONTHS;
    index = (d) => d.getMonth();
  }
  const values = labels.map(() => 0);
  const byTag = {};
  let total = 0, count = 0;
  for (const s of sessions) {
    if (s.at < from.getTime() || s.at >= to.getTime()) continue;
    values[index(new Date(s.at))] += s.minutes;
    const tag = s.tag || 'Study';
    byTag[tag] = (byTag[tag] ?? 0) + s.minutes;
    total += s.minutes;
    count++;
  }
  const tags = Object.entries(byTag)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, minutes]) => ({ tag, minutes, pct: Math.round((minutes / total) * 100) }));
  return { from, to, labels, values, total, count, tags };
}

export function rangeTitle(range, from) {
  if (range === 'day') return `${DAYS[from.getDay()]} ${MONTHS[from.getMonth()]} ${from.getDate()}`;
  if (range === 'week') {
    const end = shift('day', from, 6);
    return `${MONTHS[from.getMonth()]} ${from.getDate()} – ${MONTHS[end.getMonth()]} ${end.getDate()}`;
  }
  if (range === 'month') return `${MONTHS[from.getMonth()]} ${from.getFullYear()}`;
  return String(from.getFullYear());
}

// Days in a row with at least one finished session, counting back from today (or yesterday if today has none yet).
export function streak(sessions, now = Date.now()) {
  const key = (t) => startOf('day', t).getTime();
  const days = new Set(sessions.map((s) => key(s.at)));
  let day = startOf('day', now);
  if (!days.has(day.getTime())) day = shift('day', day, -1);
  let n = 0;
  while (days.has(day.getTime())) { n++; day = shift('day', day, -1); }
  return n;
}

export const hm = (minutes) => (minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`);
