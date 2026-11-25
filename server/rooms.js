// Rooms are the bulk of every snapshot and they almost never change, so a snapshot names each one by a
// short revision and carries the room itself only when that viewer has not been sent this revision yet.
// `{ r }` alone means "keep the room you have, this is its revision". The map is per connection: it is
// forgotten when a socket opens or closes, so a new connection always starts from the whole house.
//
// It is also per house. A viewer's copies belong to the house they are standing in: joining another house
// drops them from the client, so the revision this map remembers from an earlier visit says nothing about
// what is on their screen now. Sending `{ r }` for a room the client no longer holds left the client to
// invent one, and an invented room has no size or colours — a row of black 10x8 slabs until a reload.
const sentRooms = new Map(); // viewerId -> { house, rooms: Map(`playerId:index` -> revision) }

export function roomRev(room) {
  const s = JSON.stringify(room); // wallpaper, floor, pattern, paints and furniture: everything a room is
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

export function roomsFor(viewerId, owner, house) {
  let seen = sentRooms.get(viewerId);
  if (!seen || seen.house !== house) sentRooms.set(viewerId, (seen = { house, rooms: new Map() }));
  const rooms = seen.rooms;
  return (owner.rooms ?? []).map((room, i) => {
    const key = `${owner.id}:${i}`, r = roomRev(room);
    if (rooms.get(key) === r) return { r };
    rooms.set(key, r);
    return { ...room, r };
  });
}

// A socket that did not see what the last one was told: start its rooms from scratch.
export const forgetRooms = (viewerId) => sentRooms.delete(viewerId);
