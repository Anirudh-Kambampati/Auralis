import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGrid, canPlace, placeSwaps, focusReward, colorsFor, roomSize, PETS, EXPAND_COST,
  ITEMS, EVENTS, easterSunday, activeEvents, nextEvent, footprint, nextRot,
  DOOR, WALL, FLOOR, BLOCKED, VOID, ROOM_W, colsFor,
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

test('side-by-side rooms share one wall that opens up almost floor to floor', () => {
  const g = buildGrid([empty(), empty()]);
  const o = g.origins[0], next = g.origins[1], X = o.x + ROOM_W;
  assert.equal(next.x, X + 1); // one shared wall column, no hallway
  for (let y = o.y + 1; y < o.y + 7; y++) assert.equal(g.at(X, y), DOOR);
  assert.equal(g.at(X, o.y), WALL); // post at the top of the opening
  assert.equal(g.at(X, o.y + 7), WALL); // and at the bottom
  assert.equal(g.at(X, o.y - 1), WALL); // back wall stays, so each room keeps its wallpaper
  assert.equal(g.owner[next.y * g.w + next.x], 1);
});

test('rooms on the next row connect through a doorway down', () => {
  const g = buildGrid(Array.from({ length: 3 }, () => empty()));
  assert.equal(g.cols, 2); // three rooms make a 2x2 grid: two on top, one below
  const o = g.origins[0], below = g.origins[2];
  for (let y = o.y + 8; y < below.y; y++) assert.equal(g.at(o.x + 4, y), DOOR);
  assert.equal(g.at(o.x + 4, below.y), FLOOR);
  assert.equal(g.at(o.x + 2, below.y - 1), WALL); // the rest of the back wall stays
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
  // Direct links: an opening to the side, a doorway up.
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
  assert.equal(g.at(o.x + big.w, o.y + 6), DOOR);
  assert.equal(g.at(o.x + big.w, o.y + 7), WALL);
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
