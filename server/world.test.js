// Naps are stored as a slot in the owner's room (`pet.sofa = { r, index, pats }`), so a furniture change has to
// keep that slot honest. Picking a bed up, selling its room or having a piece swap out must not leave the pet
// asleep on whatever piece inherited the index.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { world } from './world.js';
import { ITEMS, canPlace, placeSwaps } from '../shared/game.js';

const has = (table, key) => typeof key === 'string' && Object.hasOwn(table, key);
const room = (furniture) => ({ wallpaper: 'cream', floor: 'wood', furniture });
const pet = (sofa) => ({ kind: 'cat', sofa });
const napPieces = (r) => r.furniture.map((f) => f.item);

test('picking up the bed a pet naps on wakes it', async () => {
  const r = room([{ item: 'chair', x: 0, y: 0 }, { item: 'petBed', x: 1, y: 0 }, { item: 'petSofa', x: 2, y: 0 }]);
  const pets = [pet({ r: 0, index: 1, pats: 1 })];
  const p = { inventory: {}, pets };

  await world.pickup({ room: r, m: { index: 1, r: 0 }, p });

  assert.equal(pets[0].sofa, undefined, 'the pet is not left napping on the pet sofa that took slot 1');
  assert.deepEqual(napPieces(r), ['chair', 'petSofa']);
  assert.equal(p.inventory.petBed, 1);
});

test('picking up a piece above the bed moves the nap to the bed’s new slot', async () => {
  const r = room([{ item: 'chair', x: 0, y: 0 }, { item: 'petBed', x: 1, y: 0 }]);
  const pets = [pet({ r: 0, index: 1, pats: 0 })];
  const p = { inventory: {}, pets };

  await world.pickup({ room: r, m: { index: 0, r: 0 }, p });

  assert.deepEqual(pets[0].sofa, { r: 0, index: 0, pats: 0 });
  assert.equal(r.furniture[pets[0].sofa.index].item, 'petBed');
});

test('a nap in another room is left alone', async () => {
  const r = room([{ item: 'petBed', x: 0, y: 0 }]);
  const pets = [pet({ r: 1, index: 0, pats: 0 })];
  const p = { inventory: {}, pets };

  await world.pickup({ room: r, m: { index: 0, r: 0 }, p });

  assert.deepEqual(pets[0].sofa, { r: 1, index: 0, pats: 0 });
});

test('a swap that removes the bed wakes the pet', async () => {
  // A work piece swaps out the same kind of piece in its spot, so a swap can reshuffle the slots around a nap —
  // and, once a sleep piece is gone, nothing may inherit the nap's index.
  const r = room([{ item: 'chair', x: 0, y: 0 }, { item: 'laptop', x: 1, y: 0 }, { item: 'petBed', x: 2, y: 0 }]);
  const pets = [pet({ r: 0, index: 2, pats: 0 })];
  const p = { inventory: { laptop: 1 }, pets };

  // Placing a laptop on the old laptop's tile takes slot 1 out; the bed moves from 2 to 1 and the nap follows.
  const ok = await world.place({
    has, ITEMS, canPlace, placeSwaps, isPlant: () => false, save: () => {},
    room: r, p, m: { item: 'laptop', x: 1, y: 0, r: 0 },
  });

  assert.equal(ok, true);
  assert.deepEqual(pets[0].sofa, { r: 0, index: 1, pats: 0 });
  assert.equal(r.furniture[pets[0].sofa.index].item, 'petBed');
  assert.deepEqual(napPieces(r), ['chair', 'petBed', 'laptop']);
});

test('selling the room a pet naps in wakes it, and renumbers a nap in a later room', async () => {
  const p = {
    coins: 0, inventory: {},
    rooms: [room([]), room([{ item: 'petBed', x: 0, y: 0 }]), room([{ item: 'petSofa', x: 0, y: 0 }])],
    pets: [pet({ r: 1, index: 0, pats: 0 }), pet({ r: 2, index: 0, pats: 0 })],
  };

  await world.sell_room({ p, m: { r: 1 }, ROOM_COST: [0, 100, 150] });

  assert.equal(p.pets[0].sofa, undefined);
  assert.deepEqual(p.pets[1].sofa, { r: 1, index: 0, pats: 0 });
  assert.equal(p.rooms[1].furniture[p.pets[1].sofa.index].item, 'petSofa');
});
