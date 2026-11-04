import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGrid, canPlace, placeSwaps, focusReward, quitReward, quitMinutes, focusEnd, streakDays, streakBonus, colorsFor, roomSize, PETS, EXPAND_COST,
  ITEMS, EVENTS, easterSunday, activeEvents, nextEvent, footprint, nextRot,
  DOOR, WALL, FLOOR, BLOCKED, VOID, ROOM_W, colsFor, isFocusLength, FOCUS_LENGTHS, bondLevel,
} from './game.js';

const empty = (level = 0) => ({ level, furniture: [] });

test('single room has a two-tile back wall and no doors', () => {
  const g = buildGrid([empty()]);
  const o = g.origins[0];
  assert.equal(g.at(o.x - 1, o.y - 2), WALL);
  assert.equal(g.at(o.x, o.y - 2), WALL);
  assert.equal(g.at(o.x, o.y - 1), WALL);
  assert.equal(g.at(o.x, o.y), FLOOR);
  assert.ok(![...g.cell].includes(DOOR));
});

test('side-by-side rooms share one wall that opens all the way along the floor', () => {
  const g = buildGrid([empty(), empty()]);
  const o = g.origins[0], next = g.origins[1], X = o.x + ROOM_W;
  assert.equal(next.x, X + 1); // one shared wall column, no hallway
  for (let y = o.y; y < o.y + 8; y++) assert.equal(g.at(X, y), DOOR); // no posts left at either end
  assert.equal(g.at(X, o.y + 8), WALL); // the front edge of the house
  assert.equal(g.at(X, o.y - 1), WALL); // back wall stays, so each room keeps its wallpaper
  assert.equal(g.owner[next.y * g.w + next.x], 1);
});

test('rooms on the next row open into each other, keeping a stretch of wall at each end', () => {
  const g = buildGrid(Array.from({ length: 3 }, () => empty()));
  assert.equal(g.cols, 2); // three rooms make a 2x2 grid: two on top, one below
  const o = g.origins[0], below = g.origins[2];
  for (let y = o.y + 8; y < below.y; y++) for (let x = o.x + 2; x < o.x + ROOM_W - 2; x++) assert.equal(g.at(x, y), DOOR);
  for (const x of [o.x, o.x + 1, o.x + ROOM_W - 2, o.x + ROOM_W - 1]) assert.equal(g.at(x, below.y - 1), WALL); // corners keep the wallpaper
  assert.equal(g.at(o.x + 4, below.y), FLOOR);
});

test('a shorter room above opens down past the taller neighbour', () => {
  const g = buildGrid([empty(0), empty(3), empty(0)]);
  const o = g.origins[0], below = g.origins[2];
  for (let y = o.y + 8; y < below.y; y++) assert.equal(g.at(o.x + 4, y), DOOR);
  assert.equal(g.at(o.x + 1, o.y + 9), WALL); // walled in beside the way down
});

test('the house grows as a square grid and every room opens to its neighbours', () => {
  assert.deepEqual([1, 2, 4, 5, 9, 10].map(colsFor), [1, 2, 2, 3, 3, 4]);
  const g = buildGrid(Array.from({ length: 9 }, () => empty()));
  assert.equal(g.cols, 3);
  assert.equal(g.origins[3].x, g.origins[0].x); // 4th room starts the second row
  // The middle room (4) reaches left, right, up and down without leaving the house.
  const owners = (x, y) => g.owner[y * g.w + x];
  const reach = new Set();
  const o = g.origins[4], seen = new Set([`${o.x},${o.y}`]), queue = [[o.x, o.y]];
  while (queue.length) {
    const [x, y] = queue.shift();
    if (owners(x, y) >= 0) reach.add(owners(x, y));
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${x + dx},${y + dy}`, c = g.at(x + dx, y + dy);
      if (!seen.has(k) && (c === FLOOR || c === DOOR)) { seen.add(k); queue.push([x + dx, y + dy]); }
    }
  }
  assert.equal(reach.size, 9);
  // Direct links: an opening to the side, an opening up.
  assert.equal(g.at(g.origins[3].x + ROOM_W, o.y + 2), DOOR);
  assert.equal(g.at(g.origins[1].x + 4, g.origins[1].y + 8), DOOR);
});

test('an upgraded room packs snugly next to a small one', () => {
  const g = buildGrid([empty(3), empty(0)]);
  const big = roomSize(empty(3));
  assert.deepEqual(big, { w: 16, h: 11 });
  const o = g.origins[0];
  assert.equal(g.at(o.x + 15, o.y + 10), FLOOR);
  assert.equal(g.origins[1].x, o.x + big.w + 1);
  // opening only spans rows both rooms have
  assert.equal(g.at(o.x + big.w, o.y + 7), DOOR);
  assert.equal(g.at(o.x + big.w, o.y + 8), WALL);
  // below the small room is open space, not floor
  assert.equal(g.at(g.origins[1].x + 2, g.origins[1].y + 10), VOID);
  assert.deepEqual(EXPAND_COST.slice(1), [250, 600, 1200]);
});

test('furniture blocks cells; rugs do not', () => {
  const g = buildGrid([{ furniture: [{ item: 'desk', x: 0, y: 0 }, { item: 'rug', x: 4, y: 4 }] }]);
  const o = g.origins[0];
  assert.equal(g.at(o.x + 1, o.y), BLOCKED);
  assert.equal(g.at(o.x + 5, o.y + 5), FLOOR);
});

test('placement rules', () => {
  const room = { furniture: [{ item: 'desk', x: 0, y: 0 }] };
  assert.equal(canPlace(room, 'plant', 1, 0), false); // overlaps desk
  assert.equal(canPlace(room, 'rug', 0, 0), true); // rug under desk is fine
  assert.equal(canPlace(room, 'sofa', 8, 0), false); // off the edge
  assert.equal(canPlace({ ...room, level: 2 }, 'sofa', 8, 0), true); // fits once the room is bigger
  assert.equal(canPlace(room, 'nope', 3, 3), false);
  assert.equal(canPlace(room, 'plant', 1.5, 3), false);
  // Drinks and toys stand on tables and rugs, but not on each other.
  assert.equal(canPlace(room, 'coffee', 1, 0), true);
  const withCan = { furniture: [...room.furniture, { item: 'coffee', x: 1, y: 0 }] };
  assert.equal(canPlace(withCan, 'wine', 1, 0), false);
  assert.equal(canPlace(withCan, 'wine', 0, 0), true);
  assert.equal(canPlace(withCan, 'gymBall', 1, 0), false); // solid still collides with the desk
  // Workspace pieces swap out the same kind in their spot; other things are still blocked.
  assert.deepEqual(placeSwaps(withCan, 'orangeJuice', 1, 0), [1]);
  assert.deepEqual(placeSwaps(withCan, 'workTable', 0, 0), [0]);
  assert.equal(placeSwaps(withCan, 'teapot', 1, 0), null);
  assert.equal(placeSwaps(withCan, 'plant', 1, 0), null);
  assert.deepEqual(placeSwaps(withCan, 'laptop', 0, 0), []);
});

test('recolour palettes and pet prices', () => {
  assert.equal(colorsFor('sofa').length, 16);
  assert.equal(colorsFor('desk').length, 10);
  assert.deepEqual(colorsFor('aquarium'), []);
  assert.ok(Object.values(PETS).every((p) => p.price >= 300)); // pets must be earned
});

test('friends bonus', () => {
  assert.equal(focusReward(25, 0), 25);
  assert.equal(focusReward(25, 1), 32);
  assert.equal(focusReward(25, 2), 38); // ×1.5
  assert.equal(focusReward(25, 4), 50); // ×2
  assert.equal(focusReward(25, 9), 50); // capped
  const min = 60_000;
  assert.equal(quitReward(60, 0, 5 * min), 0); // under 1/8: nothing
  assert.equal(quitReward(60, 0, 10 * min), 15); // nearer 1/4
  assert.equal(quitReward(60, 0, 31 * min), 30); // nearer 1/2
  assert.equal(quitReward(60, 0, 50 * min), 45); // nearer 3/4
  assert.equal(quitReward(60, 0, 55 * min), 60); // nearer full
  assert.equal(quitReward(60, 4, 30 * min), 60); // buddy bonus scales too
  assert.equal(quitMinutes(60, 31 * min), 30);
  assert.equal(quitMinutes(25, 20 * min), 18); // 3/4 of 25, floored
  assert.equal(quitMinutes(25, 2 * min), 0);
});

test('festivals: Easter, windows across New Year', () => {
  assert.equal(easterSunday(2025).toDateString(), new Date(2025, 3, 20).toDateString());
  assert.equal(easterSunday(2026).toDateString(), new Date(2026, 3, 5).toDateString());
  assert.equal(easterSunday(2027).toDateString(), new Date(2027, 2, 28).toDateString());
  const ids = (d) => activeEvents(d).map((e) => e.id);
  assert.ok(ids(new Date(2026, 3, 3)).includes('easter')); // Good Friday
  assert.deepEqual(ids(new Date(2026, 11, 28)).sort(), ['christmas', 'newyear']);
  assert.ok(ids(new Date(2027, 0, 1)).includes('newyear'));
  assert.equal(nextEvent(new Date(2026, 10, 1)).id, 'gurpurab');

  for (const e of EVENTS) for (const k of e.items) assert.ok(ITEMS[k], `${e.id}: ${k}`);
});

test('turning: sideways swaps the footprint, square upright things only face front or back', () => {
  assert.deepEqual(footprint({ item: 'wardrobe', rot: 1 }), { w: 1, h: 2 });
  assert.deepEqual(footprint({ item: 'wardrobe', rot: 2 }), { w: 2, h: 1 });
  assert.deepEqual([0, 1, 2, 3].map((rot) => nextRot({ item: 'tv', rot })), [1, 2, 3, 0]);
  assert.equal(nextRot({ item: 'arcade' }), 2);
  assert.equal(nextRot({ item: 'arcade', rot: 2 }), 0);
  assert.equal(nextRot({ item: 'roundRug', rot: 1 }), 2); // rugs turn all the way round
  const room = { furniture: [{ item: 'sofa', x: 0, y: 4, rot: 1 }] }; // a 3x1 sofa turned: 1 wide, 3 deep
  assert.equal(canPlace(room, 'plant', 0, 6), false); // its third tile
  assert.equal(canPlace(room, 'plant', 1, 4), true); // beside it, where it used to reach
  assert.equal(canPlace({ furniture: [] }, 'sofa', 0, 6, 1), false); // 3 deep doesn't fit at the bottom edge
});

test('pause freezes the timer until resumed', () => {
  const min = 60_000, f = { minutes: 25, endsAt: 100 * min, pausedAt: 90 * min };
  assert.equal(focusEnd(f, 92 * min) - 92 * min, 10 * min); // still 10 min left
  assert.equal(focusEnd(f, 190 * min) - 190 * min, 10 * min); // however long it's paused
  assert.equal(focusEnd({ minutes: 25, endsAt: 100 * min }, 99 * min), 100 * min);
});

test('streak bonus counts local days', () => {
  const day = 86_400_000, tz = 300; // UTC-5
  const at = (d, h) => d * day + (h + 5) * 3_600_000; // local day d, local hour h
  const s = [at(10, 23), at(11, 1), at(12, 12)].map((t) => ({ at: t }));
  assert.equal(streakDays(s, at(12, 13), tz), 3);
  assert.equal(streakDays(s, at(13, 9), tz), 3); // nothing yet today: still counts
  assert.equal(streakDays(s, at(14, 9), tz), 0);
  assert.equal(streakDays(s, at(12, 13), 0), 2); // in UTC the first two fall on one day
  assert.deepEqual([2, 3, 7, 30].map(streakBonus), [0, 0.1, 0.25, 0.5]);
});

test('a focus length is a multiple of 5 from 10 minutes to 3 hours', () => {
  for (const n of [10, 15, 35, 120, 180, ...FOCUS_LENGTHS]) assert.ok(isFocusLength(n), n);
  for (const n of [0, 5, 12, 185, 9.5, -10, NaN, '20']) assert.ok(!isFocusLength(n), n);
});

test('pet bond levels up with focus minutes and caps at 5', () => {
  assert.deepEqual([undefined, 24, 25, 100, 624, 625, 99999].map(bondLevel), [0, 0, 1, 2, 4, 5, 5]);
});

test('chat documents: safe names, keys and labels', async () => {
  const { safeDocName, CHAT_KEY, docName, attachLabel } = await import('./game.js');
  assert.equal(safeDocName('Week 3 notes (final).PDF'), 'Week_3_notes_final.pdf');
  assert.equal(safeDocName('../../evil.html'), null);
  assert.equal(safeDocName('noext'), null);
  assert.equal(safeDocName('.docx'), 'file.docx');
  assert.ok(CHAT_KEY.test('chat/p1/123-abcd/Week_3.pdf') && CHAT_KEY.test('chat/p1/123-abcd.jpg'));
  assert.ok(!CHAT_KEY.test('chat/p1/123-abcd/x.html') && !CHAT_KEY.test('chat/p1/123-abcd/../x.pdf'));
  assert.equal(docName('chat/p1/1-ab/a.xlsx'), 'a.xlsx');
  assert.equal(attachLabel('chat/p1/1-ab.jpg'), '📷 Photo');
});
