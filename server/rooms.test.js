// Rooms in a snapshot travel by revision (see server/rooms.js and docs/dataflow.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roomsFor, forgetRooms } from './rooms.js';

const H = 'H1';
const owner = {
  id: 'p1',
  rooms: [
    { wallpaper: 'plaster', floor: 'oak', furniture: [{ item: 'desk', x: 1, y: 2 }] },
    { wallpaper: 'plaster', floor: 'oak', furniture: [{ item: 'bed', x: 1, y: 2 }] },
  ],
};

test('a room is sent once, then by its revision', () => {
  forgetRooms('v1');
  const first = roomsFor('v1', owner, H);
  assert.equal(first.length, 2);
  assert.ok(first.every((r) => Array.isArray(r.furniture)), 'a new viewer gets the rooms themselves');
  assert.ok(first.every((r) => typeof r.r === 'string' && r.r), 'each room carries its revision');

  const again = roomsFor('v1', owner, H);
  assert.deepEqual(again.map((r) => Object.keys(r)), [['r'], ['r']], 'unchanged rooms are a revision alone');
  assert.deepEqual(again.map((r) => r.r), first.map((r) => r.r), 'and the revision is the same one');
});

test('only the room that changed is sent again', () => {
  forgetRooms('v2');
  roomsFor('v2', owner, H);
  owner.rooms[1].furniture.push({ item: 'lamp', x: 3, y: 1 });
  const out = roomsFor('v2', owner, H);
  assert.ok(!Array.isArray(out[0].furniture), 'the untouched room stays a revision');
  assert.equal(out[1].furniture.length, 2, 'the changed room comes with its furniture');
  owner.rooms[1].furniture.pop();
});

test('a new room, and a reconnect, get the whole room back', () => {
  forgetRooms('v3');
  roomsFor('v3', owner, H);
  owner.rooms.push({ wallpaper: 'mint', floor: 'oak', furniture: [] });
  const grown = roomsFor('v3', owner, H);
  assert.equal(grown[2].wallpaper, 'mint', 'a room index the viewer never had is sent in full');
  owner.rooms.pop();

  forgetRooms('v3'); // the socket closed and a fresh one opened
  assert.ok(roomsFor('v3', owner, H).every((r) => Array.isArray(r.furniture)), 'a new connection starts from the whole house');
});

test('another house is sent whole, however well this viewer knew it', () => {
  forgetRooms('v6');
  roomsFor('v6', owner, 'H1'); // the whole house, room by room
  roomsFor('v6', owner, 'H1'); // and then by revision
  assert.ok(roomsFor('v6', owner, 'H2').every((r) => Array.isArray(r.furniture)), 'joining another house starts from its whole house');
  assert.ok(roomsFor('v6', owner, 'H1').every((r) => Array.isArray(r.furniture)), 'and coming back to one does too: the client lost those rooms on the way out');
});

test('two viewers are told independently', () => {
  forgetRooms('v4'); forgetRooms('v5');
  roomsFor('v4', owner, H);
  assert.ok(roomsFor('v5', owner, H).every((r) => Array.isArray(r.furniture)), 'one viewer having a room does not send a revision to another');
});
