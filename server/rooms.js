// Rooms are the bulk of every snapshot and they almost never change, so a snapshot names each one by a
// short revision and carries the room itself only when that viewer has not been sent this revision yet.
// `{ r }` alone means "keep the room you have, this is its revision". The map is per connection: it is
// forgotten when a socket opens or closes, so a new connection always starts from the whole house.
const sentRooms = new Map(); // viewerId -> Map(`playerId:index` -> revision)

export function roomRev(room) {
  const s = JSON.stringify(room); // wallpaper, floor, pattern, paints and furniture: everything a room is
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

export function roomsFor(viewerId, owner) {
  let seen = sentRooms.get(viewerId);
  if (!seen) sentRooms.set(viewerId, (seen = new Map()));
  return (owner.rooms ?? []).map((room, i) => {
    const key = `${owner.id}:${i}`, r = roomRev(room);
    if (seen.get(key) === r) return { r };
    seen.set(key, r);
    return { ...room, r };
  });
}

// A socket that did not see what the last one was told: start its rooms from scratch.
export const forgetRooms = (viewerId) => sentRooms.delete(viewerId);
