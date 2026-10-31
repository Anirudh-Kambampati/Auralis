import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGrid, canPlace, focusReward, colorsFor, roomSize, PETS, EXPAND_COST,
  DOOR, WALL, FLOOR, BLOCKED, VOID, ROOM_W, COLS,
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
  const g = buildGrid(Array.from({ length: COLS + 1 }, () => empty()));
  const o = g.origins[0], below = g.origins[COLS];
  for (let y = o.y + 8; y < below.y; y++) assert.equal(g.at(o.x + 4, y), DOOR);
  assert.equal(g.at(o.x + 4, below.y), FLOOR);
  assert.equal(g.at(o.x + 2, below.y - 1), WALL); // the rest of the back wall stays
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
});

test('recolour palettes and pet prices', () => {
  assert.equal(colorsFor('sofa').length, 8);
  assert.equal(colorsFor('desk').length, 6);
  assert.deepEqual(colorsFor('aquarium'), []);
  assert.ok(Object.values(PETS).every((p) => p.price >= 300)); // pets must be earned
});

test('friends bonus', () => {
  assert.equal(focusReward(25, false), 25);
  assert.equal(focusReward(25, true), 32);
});
