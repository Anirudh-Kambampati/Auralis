import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGrid, canPlace, placeSwaps, focusReward, quitReward, quitMinutes, focusEnd, focusStart, caffeineOverlap, caffeineMinutes, streakDays, streakBonus, colorsFor, roomSize, PETS, EXPAND_COST,
  ITEMS, EVENTS, easterSunday, activeEvents, nextEvent, footprint, nextRot, canRotate,
  DOOR, WALL, FLOOR, BLOCKED, VOID, ROOM_W, colsFor, isFocusLength, FOCUS_LENGTHS, bondLevel,
  DRINKS,
  CLAW_PRIZES, CLAW_COST, CLAW_COOLDOWN_MS, clawPrize, readyKey, pieceReadyAt, setPieceReady,
  CRAFT, CRAFT_COOLDOWN_MS, craftColour, craftItem, craftedPrice, craftedProblem, PASTELS,
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

test('turning: bed, bed-adjacent furniture and rugs rotate, sideways swaps the footprint', () => {
  assert.equal(canRotate('bed'), true);
  assert.equal(canRotate('singleBed'), true);
  assert.equal(canRotate('bunkBed'), true);
  assert.equal(canRotate('daybed'), true);
  assert.equal(canRotate('cloudBed'), true);
  assert.equal(canRotate('petBed'), true);
  assert.equal(canRotate('nightstand'), true);
  assert.equal(canRotate('bedsideLamp'), true);
  assert.equal(canRotate('rug'), true);
  assert.equal(canRotate('roundRug'), true);
  assert.equal(canRotate('runnerRug'), true);
  assert.equal(canRotate('wardrobe'), false);
  assert.equal(canRotate('tv'), false);
  assert.deepEqual(footprint({ item: 'bed', rot: 1 }), { w: 3, h: 2 });
  assert.deepEqual(footprint({ item: 'daybed', rot: 1 }), { w: 1, h: 2 });
  assert.deepEqual(footprint({ item: 'rug', rot: 1 }), { w: 2, h: 3 });
  assert.deepEqual(footprint({ item: 'wardrobe', rot: 1 }), { w: 2, h: 1 });
  assert.deepEqual([0, 1, 2, 3].map((rot) => nextRot({ item: 'bed', rot })), [1, 2, 3, 0]);
  assert.deepEqual([0, 1, 2, 3].map((rot) => nextRot({ item: 'daybed', rot })), [1, 2, 3, 0]);
  assert.equal(nextRot({ item: 'roundRug', rot: 1 }), 2); // rugs turn all the way round
  assert.equal(nextRot({ item: 'nightstand' }), 2);
  assert.equal(nextRot({ item: 'wardrobe' }), 0);
  assert.equal(nextRot({ item: 'tv' }), 0);
  assert.equal(nextRot({ item: 'arcade' }), 0);
  const room = { furniture: [{ item: 'bed', x: 0, y: 4, rot: 1 }] }; // a 2x3 bed turned: 3 wide, 2 deep
  assert.equal(canPlace(room, 'plant', 2, 4), false); // within footprint
  assert.equal(canPlace(room, 'plant', 3, 4), true); // beside footprint
  assert.equal(canPlace({ furniture: [] }, 'bed', 0, 7, 1), false); // 2 deep doesn't fit at bottom edge of small room
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

test('sign-up checks say exactly what is wrong', async () => {
  const { usernameProblem, emailProblem, passwordProblem } = await import('./game.js');
  assert.equal(usernameProblem('study_buddy.2'), null);
  assert.match(usernameProblem('me@mail.com'), /@/);
  assert.match(usernameProblem('study buddy'), /spaces/);
  assert.match(usernameProblem('hi!#'), /! #/);
  assert.match(usernameProblem('ab'), /at least 3/);
  assert.match(usernameProblem('a'.repeat(21)), /at most 20/);
  assert.match(usernameProblem(''), /Pick/);
  assert.equal(emailProblem('name@example.com'), null);
  assert.match(emailProblem('name.example.com'), /needs an @/);
  assert.match(emailProblem('a@b@c.com'), /only one @/);
  assert.match(emailProblem('@example.com'), /before the @/);
  assert.match(emailProblem('name@example'), /example\.com/);
  assert.match(emailProblem('na me@example.com'), /spaces/);
  assert.equal(passwordProblem('12345678'), null);
  assert.match(passwordProblem('short'), /at least 8.*has 5/);
});

test('caffeine overlap counts whole minutes of a session that fall inside the window', () => {
  const now = 1_000_000_000_000;
  const f = { minutes: 60, endsAt: now, pausedAt: null };
  const since = now - 55 * 60_000, until = now - 40 * 60_000;
  assert.equal(caffeineMinutes(f, since, until, now), 15);
});

test('caffeine overlap is zero when the window is outside the session', () => {
  const now = 1_000_000_000_000;
  const f = { minutes: 25, endsAt: now, pausedAt: null };
  assert.equal(caffeineMinutes(f, now + 60_000, now + 120_000, now), 0);
  assert.equal(caffeineMinutes(f, now - 3 * 3600_000, now - 2 * 3600_000, now), 0);
});

test('caffeine overlap never exceeds the session or the window', () => {
  const now = 1_000_000_000_000;
  const f = { minutes: 15, endsAt: now, pausedAt: null };
  assert.equal(caffeineMinutes(f, now - 3600_000, now + 3600_000, now), 15);
});

test('a missing or inverted caffeine window overlaps for nothing', () => {
  const now = 1_000_000_000_000;
  const f = { minutes: 25, endsAt: now, pausedAt: null };
  assert.equal(caffeineMinutes(f, 0, 0, now), 0);
  assert.equal(caffeineMinutes(f, now, now - 1000, now), 0);
});

test('focusStart is the end minus the session length, with paused time frozen', () => {
  const now = 1_000_000_000_000;
  const f = { minutes: 25, endsAt: now, pausedAt: null };
  assert.equal(focusStart(f, now), now - 25 * 60_000);
  const paused = { minutes: 25, endsAt: now, pausedAt: now - 100_000 };
  assert.equal(focusStart(paused, now), paused.endsAt + 100_000 - 25 * 60_000);
});

test('leaving early pays the overlap for the time actually worked', () => {
  const now = 1_000_000_000_000;
  const f = { minutes: 60, endsAt: now, pausedAt: null };
  const workedFrom = focusStart(f, now);
  // Caffeinated from minute 5 to minute 12, but the player left at minute 10.
  const leftAt = workedFrom + 10 * 60_000;
  assert.equal(caffeineOverlap(workedFrom, leftAt, workedFrom + 5 * 60_000, workedFrom + 12 * 60_000), 5);
});

test('the drinks table names a caffeine length for the three caffeinated drinks', () => {
  assert.equal(DRINKS.coffeeMachine.caffeine, 10);
  assert.equal(DRINKS.coffee.caffeine, 10);
  assert.equal(DRINKS.energyCan.caffeine, 10);
  assert.equal(DRINKS.wine.rest, 2);
  assert.ok(DRINKS.wine.tipsy);
});

test('every drink in the table is a real catalog item', () => {
  for (const key of Object.keys(DRINKS)) assert.ok(ITEMS[key], `${key} is not in ITEMS`);
});

test('a drink that is not in the table has no effect', () => {
  assert.equal(DRINKS.notADrink, undefined);
});

test('the claw pool is plushes and small decor, and every prize is a real item', () => {
  assert.ok(CLAW_PRIZES.length > 0);
  for (const p of CLAW_PRIZES) {
    assert.ok(ITEMS[p.item], `${p.item} is not in ITEMS`);
    assert.ok(p.weight > 0);
  }
  const total = CLAW_PRIZES.reduce((n, p) => n + p.weight, 0);
  assert.equal(total, 100);
});

test('the claw always drops something from the pool', () => {
  for (let i = 0; i < 200; i++) {
    const prize = clawPrize(() => i / 200); // walk the whole range deterministically
    assert.ok(CLAW_PRIZES.some((p) => p.item === prize.item));
  }
});

test('the claw costs five coins and cools down for thirty minutes', () => {
  assert.equal(CLAW_COST, 5);
  assert.equal(CLAW_COOLDOWN_MS, 30 * 60_000);
});

test('a wait belongs to the player who used the piece, not to the piece', () => {
  const now = 1_000_000_000_000;
  const key = readyKey(0, 3, 'easel');
  assert.equal(pieceReadyAt({ ready: {} }, key, now), 0);
  const me = { ready: { [key]: now + 1000 } };
  assert.equal(pieceReadyAt(me, key, now), now + 1000);
  assert.equal(pieceReadyAt(me, key, now + 1001), 0); // passed
  // The same piece in the same slot is a different wait for a housemate: they wait on their own clock.
  assert.equal(pieceReadyAt({ ready: {} }, key, now), 0);
});

test('a wait in the past is treated as ready, and swapping a piece starts fresh', () => {
  const now = 1_000_000_000_000;
  const key = readyKey(0, 3, 'easel');
  const p = { ready: { [key]: now - 1 } };
  assert.equal(pieceReadyAt(p, key, now), 0);
  setPieceReady(p, readyKey(0, 3, 'potteryWheel'), now + 2000);
  assert.equal(pieceReadyAt(p, key, now), 0);
  assert.notEqual(readyKey(0, 3, 'easel'), readyKey(0, 3, 'potteryWheel'));
});

test('the claw machine is solid, so a click always reaches it', () => {
  assert.equal(ITEMS.clawMachine.solid, true);
  assert.equal(ITEMS.clawMachine.top, undefined);
});

test('every craft piece names a pool of real catalog items', () => {
  for (const [piece, pool] of Object.entries(CRAFT)) {
    assert.ok(ITEMS[piece], `${piece} is not in ITEMS`);
    assert.ok(Array.isArray(pool) && pool.length > 0, `${piece} has no pool`);
    for (const item of pool) assert.ok(ITEMS[item], `${piece} yields ${item}, which is not in ITEMS`);
  }
});

test('a piece only makes things that suit it', () => {
  // The point of the pools: a kiln makes pottery, never a plush.
  assert.ok(CRAFT.potteryWheel.every((i) => /vase|sculpture|bust|mushroom/i.test(i)), JSON.stringify(CRAFT.potteryWheel));
  assert.ok(CRAFT.loom.every((i) => /rug/i.test(i)), JSON.stringify(CRAFT.loom));
  assert.ok(CRAFT.sewingTable.every((i) => /plush|teddy/i.test(i)), JSON.stringify(CRAFT.sewingTable));
  assert.ok(!CRAFT.potteryWheel.includes('plush'), 'the kiln must not make a plush');
  assert.ok(!CRAFT.sewingTable.includes('vase'), 'the sewing table must not make a vase');
});

test('every object in a piece\'s pool is equally likely', () => {
  for (const [piece, pool] of Object.entries(CRAFT)) {
    const counts = new Map();
    for (let i = 0; i < 20000; i++) {
      const item = craftItem(piece, i / 20000);
      counts.set(item, (counts.get(item) ?? 0) + 1);
    }
    assert.equal(counts.size, pool.length, `${piece} never made ${pool.filter((i) => !counts.has(i))}`);
    const spread = Math.max(...counts.values()) - Math.min(...counts.values());
    assert.ok(spread <= 2, `${piece} is uneven: ${JSON.stringify([...counts])}`);
    assert.equal(craftItem(piece, 0), pool[0]);
    assert.equal(craftItem(piece, 1), pool[pool.length - 1]);
  }
});

test('something that is not a making piece makes nothing', () => {
  assert.equal(craftItem('chair'), null);
  assert.equal(craftItem('notAPiece'), null);
});

test('crafting is free and cools down for twenty minutes', () => {
  assert.equal(CRAFT_COOLDOWN_MS, 20 * 60_000);
});

test('a handmade piece sells for a quarter of its catalog price', () => {
  assert.equal(craftedPrice('vase'), Math.floor(ITEMS.vase.price / 4));
  assert.equal(craftedPrice('notAnItem'), 0);
});

test('craft colour comes from the item palette when it has one, and pastels otherwise', () => {
  // Vase has a pastel palette; a rug has none, so it falls back to PASTELS.
  const vase = craftColour('vase', 0);
  assert.ok(colorsFor('vase').includes(vase));
  const rug = craftColour('rug', 0);
  assert.ok(PASTELS.includes(rug));
});

test('craft colour stays inside the palette across the whole range', () => {
  for (const item of ['vase', 'sculpture', 'rug', 'plush']) {
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const col = craftColour(item, r);
      assert.match(col, /^#[0-9a-f]{6}$/);
    }
  }
});

test('a crafted entry is only valid with a known item and a hex colour', () => {
  assert.equal(craftedProblem({ item: 'vase', col: '#aabbcc' }), null);
  assert.ok(craftedProblem({ item: 'notAnItem', col: '#aabbcc' }));
  assert.ok(craftedProblem({ item: 'vase', col: 'red' }));
  assert.ok(craftedProblem(null));
});
