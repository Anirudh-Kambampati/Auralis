// Naps name a piece by its owner and slot in that owner's room (`pet.sofa = { owner, r, index, pats }`), so a
// furniture change has to keep that slot honest — for every pet in the house, since a guest's pet may be asleep on
// someone else's bed. Picking a bed up, selling its room or having a piece swap out must not leave the pet asleep
// on whatever piece inherited the index, and clicking a bed must give each pet its own piece.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { world } from './world.js';
import { ITEMS, canPlace, placeSwaps } from '../shared/game.js';

const has = (table, key) => typeof key === 'string' && Object.hasOwn(table, key);
const room = (furniture) => ({ wallpaper: 'cream', floor: 'wood', furniture });
const pet = (sofa) => ({ kind: 'cat', sofa });
const napPieces = (r) => r.furniture.map((f) => f.item);

// A player row and the house db the handlers read: naps can belong to any member's pet.
const me = (rooms, pets = []) => ({ id: 'me', house: 'H', coins: 0, inventory: {}, rooms, pets });
const dbOf = (p, others = {}) => {
  const players = { [p.id]: p, ...others };
  return { players, houses: { H: { members: Object.keys(players) } } };
};
const guestBond = (x, id) => x.visitorBonds?.[id] ?? 0;

test('picking up the bed a pet naps on wakes it', async () => {
  const r = room([{ item: 'chair', x: 0, y: 0 }, { item: 'petBed', x: 1, y: 0 }, { item: 'petSofa', x: 2, y: 0 }]);
  const pets = [pet({ owner: 'me', r: 0, index: 1, pats: 1 })];
  const p = me([r], pets);

  await world.pickup({ db: dbOf(p), room: r, m: { index: 1, r: 0 }, p });

  assert.equal(pets[0].sofa, undefined, 'the pet is not left napping on the pet sofa that took slot 1');
  assert.deepEqual(napPieces(r), ['chair', 'petSofa']);
  assert.equal(p.inventory.petBed, 1);
});

test('picking up a piece above the bed moves the nap to the bed’s new slot', async () => {
  const r = room([{ item: 'chair', x: 0, y: 0 }, { item: 'petBed', x: 1, y: 0 }]);
  const pets = [pet({ owner: 'me', r: 0, index: 1, pats: 0 })];
  const p = me([r], pets);

  await world.pickup({ db: dbOf(p), room: r, m: { index: 0, r: 0 }, p });

  assert.deepEqual(pets[0].sofa, { owner: 'me', r: 0, index: 0, pats: 0 });
  assert.equal(r.furniture[pets[0].sofa.index].item, 'petBed');
});

test('a nap in another room is left alone', async () => {
  const r = room([{ item: 'petBed', x: 0, y: 0 }]);
  const pets = [pet({ owner: 'me', r: 1, index: 0, pats: 0 })];
  const p = me([r, room([{ item: 'petSofa', x: 0, y: 0 }])], pets);

  await world.pickup({ db: dbOf(p), room: p.rooms[0], m: { index: 0, r: 0 }, p });

  assert.deepEqual(pets[0].sofa, { owner: 'me', r: 1, index: 0, pats: 0 });
});

test('a guest’s pet napping on my bed wakes when I pick it up', async () => {
  const r = room([{ item: 'petBed', x: 0, y: 0 }, { item: 'chair', x: 1, y: 0 }]);
  const p = me([r]);
  const guest = { id: 'guest', house: 'H', pets: [pet({ owner: 'me', r: 0, index: 0, pats: 0 })] };

  await world.pickup({ db: dbOf(p, { guest }), room: r, m: { index: 0, r: 0 }, p });

  assert.equal(guest.pets[0].sofa, undefined, 'the guest pet is not left on the chair that took slot 0');
});

test('a swap that removes the bed wakes the pet', async () => {
  // A work piece swaps out the same kind of piece in its spot, so a swap can reshuffle the slots around a nap —
  // and, once a sleep piece is gone, nothing may inherit the nap's index.
  const r = room([{ item: 'chair', x: 0, y: 0 }, { item: 'laptop', x: 1, y: 0 }, { item: 'petBed', x: 2, y: 0 }]);
  const pets = [pet({ owner: 'me', r: 0, index: 2, pats: 0 })];
  const p = me([r], pets);
  p.inventory.laptop = 1;

  // Placing a laptop on the old laptop's tile takes slot 1 out; the bed moves from 2 to 1 and the nap follows.
  const ok = await world.place({
    has, ITEMS, canPlace, placeSwaps, isPlant: () => false, save: () => {},
    db: dbOf(p), room: r, p, m: { item: 'laptop', x: 1, y: 0, r: 0 },
  });

  assert.equal(ok, true);
  assert.deepEqual(pets[0].sofa, { owner: 'me', r: 0, index: 1, pats: 0 });
  assert.equal(r.furniture[pets[0].sofa.index].item, 'petBed');
  assert.deepEqual(napPieces(r), ['chair', 'petBed', 'laptop']);
});

test('selling the room a pet naps in wakes it, and renumbers a nap in a later room', async () => {
  const p = me([
    room([]),
    room([{ item: 'petBed', x: 0, y: 0 }]),
    room([{ item: 'petSofa', x: 0, y: 0 }]),
  ], [pet({ owner: 'me', r: 1, index: 0, pats: 0 }), pet({ owner: 'me', r: 2, index: 0, pats: 0 })]);
  // A guest's pet asleep in the room being sold goes too.
  const guest = { id: 'guest', house: 'H', pets: [pet({ owner: 'me', r: 1, index: 0, pats: 0 })] };

  await world.sell_room({ db: dbOf(p, { guest }), p, m: { r: 1 }, ROOM_COST: [0, 100, 150] });

  assert.equal(p.pets[0].sofa, undefined);
  assert.equal(guest.pets[0].sofa, undefined);
  assert.deepEqual(p.pets[1].sofa, { owner: 'me', r: 1, index: 0, pats: 0 });
  assert.equal(p.rooms[1].furniture[p.pets[1].sofa.index].item, 'petSofa');
});

test('each bed clicked gets its own sleeper, mine first and then a housemate’s pet', async () => {
  const bed = (x) => ({ item: 'petBed', x, y: 0 });
  const p = me([room([bed(0), bed(1), bed(2)])], [pet(undefined), pet(undefined)]);
  const guest = { id: 'guest', house: 'H', rooms: [room([])], pets: [pet(undefined)] };
  const db = dbOf(p, { guest });
  const click = (index) => ({ db, p, m: { owner: 'me', r: 0, index }, guestBond, ITEMS });

  await world.pet_sofa(click(0));
  await world.pet_sofa(click(1));
  await world.pet_sofa(click(2));

  assert.deepEqual(p.pets[0].sofa, { owner: 'me', r: 0, index: 0, pats: 0 });
  assert.deepEqual(p.pets[1].sofa, { owner: 'me', r: 0, index: 1, pats: 0 });
  assert.deepEqual(guest.pets[0].sofa, { owner: 'me', r: 0, index: 2, pats: 0 },
    'both of my pets are asleep, so the bed left over goes to the guest pet');
});

test('a pet can be sent to sleep on a housemate’s bed', async () => {
  const guestRoom = room([{ item: 'petSofa', x: 0, y: 0 }]);
  const p = me([room([])], [pet(undefined)]);
  const guest = { id: 'guest', house: 'H', rooms: [guestRoom], pets: [pet(undefined)] };
  const db = dbOf(p, { guest });

  const ok = await world.pet_sofa({ db, p, m: { owner: 'guest', r: 0, index: 0 }, guestBond, ITEMS });

  assert.equal(ok, true);
  assert.deepEqual(p.pets[0].sofa, { owner: 'guest', r: 0, index: 0, pats: 0 }, 'my pet answers before the guest’s');
  assert.equal(guest.pets[0].sofa, undefined);
});

test('a piece that already has a sleeper is not given a second one', async () => {
  const r = room([{ item: 'petBed', x: 0, y: 0 }]);
  const p = me([r], [pet({ owner: 'me', r: 0, index: 0, pats: 0 }), pet(undefined)]);

  await world.pet_sofa({ db: dbOf(p), p, m: { owner: 'me', r: 0, index: 0 }, guestBond, ITEMS });

  assert.equal(p.pets[1].sofa, undefined);
});
