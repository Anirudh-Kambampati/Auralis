// Rules and house layout shared by server and client.

export const ROOM_W = 10;
export const ROOM_H = 8;
export const COLS = 3; // rooms per floor row before the house grows downward
export const WALL_H = 2; // back wall is two tiles tall so windows and wallpaper have room

// colors: which palette the owner can recolour the item with for free ('pastel' or 'wood').
export const ITEMS = {
  desk: { name: 'Desk', w: 2, h: 1, price: 0, solid: true, colors: 'wood' },
  chair: { name: 'Chair', w: 1, h: 1, price: 0, solid: true, colors: 'pastel' },
  books: { name: 'Book stack', w: 1, h: 1, price: 10, solid: true },
  cactus: { name: 'Cactus', w: 1, h: 1, price: 12, solid: true },
  plant: { name: 'Plant', w: 1, h: 1, price: 15, solid: true, colors: 'pastel' },
  sunflower: { name: 'Sunflower', w: 1, h: 1, price: 18, solid: true, colors: 'pastel' },
  lamp: { name: 'Lamp', w: 1, h: 1, price: 20, solid: true, colors: 'pastel' },
  rug: { name: 'Rug', w: 3, h: 2, price: 30, solid: false, colors: 'pastel' },
  globe: { name: 'Globe', w: 1, h: 1, price: 30, solid: true },
  beanbag: { name: 'Beanbag', w: 1, h: 1, price: 35, solid: true, colors: 'pastel' },
  roundRug: { name: 'Round rug', w: 2, h: 2, price: 35, solid: false, colors: 'pastel' },
  bookshelf: { name: 'Bookshelf', w: 2, h: 1, price: 40, solid: true, colors: 'wood' },
  coffeeTable: { name: 'Coffee table', w: 2, h: 1, price: 40, solid: true, colors: 'wood' },
  armchair: { name: 'Armchair', w: 1, h: 1, price: 45, solid: true, colors: 'pastel' },
  plush: { name: 'Plush bear', w: 1, h: 1, price: 50, solid: true, colors: 'pastel' },
  mirror: { name: 'Mirror', w: 1, h: 1, price: 50, solid: true, colors: 'wood' },
  recordPlayer: { name: 'Record player', w: 1, h: 1, price: 55, solid: true, colors: 'wood' },
  bed: { name: 'Bed', w: 2, h: 3, price: 60, solid: true, colors: 'pastel' },
  guitar: { name: 'Guitar', w: 1, h: 1, price: 60, solid: true },
  easel: { name: 'Easel', w: 1, h: 1, price: 65, solid: true },
  sofa: { name: 'Sofa', w: 3, h: 1, price: 70, solid: true, colors: 'pastel' },
  bonsai: { name: 'Bonsai', w: 1, h: 1, price: 70, solid: true },
  wardrobe: { name: 'Wardrobe', w: 2, h: 1, price: 80, solid: true, colors: 'wood' },
  aquarium: { name: 'Aquarium', w: 2, h: 1, price: 90, solid: true },
  piano: { name: 'Piano', w: 2, h: 1, price: 150, solid: true, colors: 'wood' },
};
export const PASTELS = ['#f4a6b8', '#9db4ee', '#8fd0a8', '#ffd27a', '#b89af0', '#f2b48a', '#e8e3dc', '#7a6a8a'];
export const WOODS = ['#d9a06a', '#b07a4e', '#8a5a3c', '#f0d2a8', '#fffaf3', '#9db4ee'];
export const colorsFor = (item) => ({ pastel: PASTELS, wood: WOODS })[ITEMS[item]?.colors] ?? [];

// Pets cost a lot on purpose: at 1 coin per focused minute they take real study time to earn.
export const PETS = {
  hamster: { name: 'Hamster', price: 300 },
  duckling: { name: 'Duckling', price: 400 },
  bunny: { name: 'Bunny', price: 500 },
  cat: { name: 'Cat', price: 650 },
  puppy: { name: 'Puppy', price: 750 },
  fox: { name: 'Fox', price: 950 },
  axolotl: { name: 'Axolotl', price: 1300 },
  dragon: { name: 'Baby dragon', price: 2000 },
};
export const MAX_PETS = 4;

export const WALLPAPERS = ['#f6dcc0', '#cfe8d8', '#ddd5f5', '#fbd0d4', '#cfe1f7', '#f8edc0', '#fffaf3', '#e8d3c0', '#c9e4ef', '#e6d0ea'];
export const WALL_PATTERNS = ['plain', 'stripes', 'dots', 'hearts', 'checks', 'stars'];
export const FLOORS = ['#c8935f', '#b07a58', '#e0b382', '#9fae86', '#b3a2c9', '#d8a0a0', '#e8e3dc', '#8a7a8e', '#a8c4d8', '#d9b48a'];
export const FLOOR_STYLES = ['planks', 'tiles', 'carpet', 'herringbone'];
export const SKINS = ['#ffe0c8', '#f5c9a5', '#d9a07a', '#a8714f', '#6e4630'];
export const HAIRS = ['#3a2a35', '#7a4a32', '#f2c46a', '#e8735a', '#8a7ad8', '#f4b6c8', '#7ec8c0'];
export const SHIRTS = ['#f48a8a', '#7fb2e8', '#8fd0a8', '#ffd27a', '#b89af0', '#f4b6d0'];
export const STYLES = ['short', 'side part', 'buzz', 'spiky', 'curly', 'bob', 'long', 'ponytail', 'buns'];
export const FACES = ['happy', 'sleepy', 'wink', 'grin'];
export const OUTFITS = ['tee', 'tie', 'sweater', 'jacket', 'hoodie', 'overalls', 'dress', 'skirt'];

export const FOCUS_LENGTHS = [15, 25, 45, 60];

// Room upgrades: each level makes the floor bigger. EXPAND_COST[n] is the price to reach level n.
export const ROOM_SIZES = [{ w: 10, h: 8 }, { w: 12, h: 9 }, { w: 14, h: 10 }, { w: 16, h: 11 }];
export const EXPAND_COST = [0, 250, 600, 1200];
export const roomSize = (room) => ROOM_SIZES[room?.level ?? 0] ?? ROOM_SIZES[0];

// Cell kinds
export const VOID = 0, FLOOR = 1, WALL = 2, BLOCKED = 3, DOOR = 4;

// rooms: [{ level?, furniture: [{ item, x, y }] }] in house order. Rooms pack side by side by their real size,
// COLS per row, sharing one wall. That shared wall opens up almost floor to floor so neighbours read as one
// big space; a tile of wall stays at each end of the opening (and the back wall) so each room keeps its look.
// Rows link with a 2-tile doorway, so back walls (windows, wallpaper) stay whole.
export function buildGrid(rooms) {
  const sizes = rooms.map(roomSize);
  const origins = [];
  let rowY = WALL_H;
  for (let start = 0; start < rooms.length; start += COLS) {
    let x = 1, rowH = 0;
    for (let i = start; i < Math.min(rooms.length, start + COLS); i++) {
      origins[i] = { x, y: rowY };
      x += sizes[i].w + 1;
      rowH = Math.max(rowH, sizes[i].h);
    }
    rowY += rowH + 1 + WALL_H;
  }
  const w = Math.max(ROOM_W + 2, ...origins.map((o, i) => o.x + sizes[i].w + 1));
  const h = Math.max(ROOM_H + WALL_H + 1, ...origins.map((o, i) => o.y + sizes[i].h + 1));
  const cell = new Uint8Array(w * h);
  const owner = new Int16Array(w * h).fill(-1);
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  const set = (x, y, v) => { if (inside(x, y)) cell[y * w + x] = v; };
  const wallIfVoid = (x, y) => { if (inside(x, y) && cell[y * w + x] === VOID) cell[y * w + x] = WALL; };

  rooms.forEach((_, i) => {
    const o = origins[i], s = sizes[i];
    for (let y = o.y - WALL_H; y <= o.y + s.h; y++) {
      for (let x = o.x - 1; x <= o.x + s.w; x++) {
        if (x >= o.x && x < o.x + s.w && y >= o.y && y < o.y + s.h) { set(x, y, FLOOR); owner[y * w + x] = i; }
        else set(x, y, WALL);
      }
    }
  });
  rooms.forEach((_, i) => {
    const o = origins[i], s = sizes[i];
    if (i % COLS < COLS - 1 && i + 1 < rooms.length) {
      // Open the shared wall between side-by-side rooms, leaving a post at the top and bottom.
      const X = o.x + s.w, rows = Math.min(s.h, sizes[i + 1].h);
      for (let y = o.y + 1; y < o.y + rows - 1; y++) set(X, y, DOOR);
    }
    if (i + COLS < rooms.length) {
      // Doorway down to the room below, through wherever their floors overlap.
      const b = origins[i + COLS], bs = sizes[i + COLS];
      const lo = Math.max(o.x, b.x), hi = Math.min(o.x + s.w, b.x + bs.w);
      if (hi - lo >= 4) {
        const dx = lo + (hi - lo >= 8 ? 4 : 1);
        for (let y = o.y + s.h; y < b.y; y++) {
          set(dx, y, DOOR); set(dx + 1, y, DOOR);
          wallIfVoid(dx - 1, y); wallIfVoid(dx + 2, y);
        }
      }
    }
  });
  rooms.forEach((room, i) => {
    const o = origins[i];
    for (const f of room.furniture) {
      const it = ITEMS[f.item];
      if (!it?.solid) continue;
      for (let y = 0; y < it.h; y++) for (let x = 0; x < it.w; x++) set(o.x + f.x + x, o.y + f.y + y, BLOCKED);
    }
  });
  return { w, h, cell, owner, origins, sizes, at: (x, y) => (inside(x, y) ? cell[y * w + x] : VOID) };
}

export const walkable = (k) => k === FLOOR || k === DOOR;

// Room-local placement check. Rugs only collide with rugs; solid items only with solid items.
export function canPlace(room, item, x, y) {
  const it = ITEMS[item];
  const s = roomSize(room);
  if (!it || !Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (x < 0 || y < 0 || x + it.w > s.w || y + it.h > s.h) return false;
  return !room.furniture.some((f) => {
    const o = ITEMS[f.item];
    return o && o.solid === it.solid && x < f.x + o.w && f.x < x + it.w && y < f.y + o.h && f.y < y + it.h;
  });
}

export function focusReward(minutes, withFriends) {
  return minutes + (withFriends ? Math.ceil(minutes * 0.25) : 0);
}
