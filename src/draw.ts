// All art is original pixel art drawn in code. Coordinates are art pixels; one tile is 16x16.
export const T = 16;
const OUT = '#3a2633';

type Ctx = CanvasRenderingContext2D;
export type Look = { skin: string; hair: string; shirt: string; style?: string; face?: string; outfit?: string };

const r = (c: Ctx, x: number, y: number, w: number, h: number, color: string) => {
  c.fillStyle = color;
  c.fillRect(x, y, w, h);
};

export function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1, 7), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt * 255))).toString(16).padStart(2, '0');
  return `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

const cache = new Map<string, HTMLCanvasElement>();
function baked(key: string, w: number, h: number, paint: (c: Ctx) => void) {
  let cv = cache.get(key);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    paint(cv.getContext('2d')!);
    cache.set(key, cv);
  }
  return cv;
}

function paintRows(c: Ctx, rows: string[], pal: Record<string, string>) {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] !== '.') r(c, x, y, 1, 1, pal[row[x]]);
  });
}

// Outlined box with rounded corners, a top highlight and a bottom shadow.
function box(c: Ctx, x: number, y: number, w: number, h: number, fill: string) {
  r(c, x + 1, y, w - 2, 1, OUT);
  r(c, x + 1, y + h - 1, w - 2, 1, OUT);
  r(c, x, y + 1, 1, h - 2, OUT);
  r(c, x + w - 1, y + 1, 1, h - 2, OUT);
  r(c, x + 1, y + 1, w - 2, h - 2, fill);
  r(c, x + 1, y + 1, w - 2, 1, shade(fill, 0.1));
  if (h > 3) r(c, x + 1, y + h - 2, w - 2, 1, shade(fill, -0.1));
}

function disc(c: Ctx, cx: number, cy: number, rad: number, color: string) {
  for (let dy = -rad; dy <= rad; dy++) {
    const half = Math.floor(Math.sqrt(rad * rad + rad * 0.6 - dy * dy));
    r(c, cx - half, cy + dy, half * 2 + 1, 1, color);
  }
}

function heart(c: Ctx, cx: number, cy: number, color: string) {
  r(c, cx - 1, cy, 1, 1, color);
  r(c, cx + 1, cy, 1, 1, color);
  r(c, cx - 2, cy + 1, 5, 1, color);
  r(c, cx - 1, cy + 2, 3, 1, color);
  r(c, cx, cy + 3, 1, 1, color);
}

// ---------- characters ----------
const HEAD_FRONT = [
  '.....oooooo.....',
  '...oohhhhhhoo...',
  '..ohhhhhhhhhho..',
  '.ohhlhhhhhhhhho.',
  '.ohllhhhhhhhhho.',
  '.ohhhhhhhhhhhho.',
  '.ohHsHhhhhHsHho.',
  '.ohssssssssssho.',
  '.ohswesssswesho.',
  '.ohseesssseesho.',
  '.ohsbssmmssbsho.',
  '..oSssssssssSo..',
];
const HEAD_BACK = [
  '.....oooooo.....',
  '...oohhhhhhoo...',
  '..ohhhhhhhhhho..',
  '.ohhlhhhhhhhhho.',
  '.ohllhhhhhhhhho.',
  '.ohhhhhhhhhhhho.',
  '.ohhhhhhhhhhhho.',
  '.ohhhhhhhhhhhho.',
  '.ohhhHhhhhHhhho.',
  '.ohhhhHhhHhhhho.',
  '.oHhhhhhhhhhhHo.',
  '..oHHhhhhhhHHo..',
];
const BODY_FRONT = [
  '..otttccccttto..',
  '.osttttttttttso.',
  '.osTttttttttTso.',
  '..oTTTTTTTTTTo..',
];
const BODY_BACK = ['..otttttttttto..', ...BODY_FRONT.slice(1)];
const LEGS = [
  ['....oppooppo....', '....oddooddo....', '.....oo..oo.....'],
  ['....oddooppo....', '.....oo.oddo....', '.........oo.....'],
  ['....oppooddo....', '....oddo.oo.....', '.....oo.........'],
];
const BLANK = '................';
export const AVATAR_H = 21;

// Overlays replace whole sprite rows by index ('.' keeps the pixel underneath).
type Overlay = Record<number, string>;
const longRows: Overlay = { 15: '.oo..........oo.' };
for (let y = 9; y < 15; y++) longRows[y] = 'ohh..........hho';
const rows = (from: number, to: number, row: string): Overlay => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [from + i, row]));
const STYLE_OVERLAY: Record<string, Overlay> = {
  short: {},
  // fringe swept to one side
  'side part': { 8: '.ohhhhhssssssho.' },
  // close crop: no fringe, skin at the temples
  buzz: { 8: '.o' + 's'.repeat(12) + 'o.', ...rows(9, 12, '..s..........s..') },
  spiky: { 0: '....o..oo..o....', 1: '...ohoohhooho...', 2: '..oohhhhhhhhoo..' },
  curly: {
    1: '....oooooooo....', 2: '..oohhHhhHhhoo..', 3: '.ohhHhhhhhhHhho.', 4: 'o' + 'h'.repeat(14) + 'o',
    ...rows(5, 7, 'ohH' + 'h'.repeat(10) + 'Hho'), ...rows(8, 11, 'oh............ho'), 12: '.oh..........ho.', 13: '.oo..........oo.',
  },
  bob: { 8: '.o' + 'h'.repeat(12) + 'o.', ...rows(9, 12, 'oh............ho'), 13: '.oo..........oo.' },
  long: longRows,
  ponytail: { 3: '..............o.', 4: '..............po', ...rows(5, 10, '..............ho'), 11: '..............o.' },
  buns: { 0: '..ooo......ooo..', 1: '.ohlho....ohlho.', 2: '.ohhho....ohhho.', 3: '..ooo......ooo..' },
};
const FACE_OVERLAY: Record<string, Overlay> = {
  happy: {},
  sleepy: { 10: '.oh' + 'ssssssssss' + 'ho.' },
  wink: { 10: '.oh' + 'swesssssss' + 'ho.' },
  grin: { 12: '.oh' + 'sbsmmmmsbs' + 'ho.' },
};
const OUTFIT_OVERLAY: Record<string, Overlay> = {
  tee: {},
  tie: { 14: '..o' + 'tttcrrcttt' + 'o..', 15: '.os' + 'ttttrrtttt' + 'so.', 16: '.os' + 'TtttrrtttT' + 'so.' },
  sweater: { 15: '.ot' + 'cccccccccc' + 'to.', 16: '.ot' + 'TttttttttT' + 'to.' },
  jacket: { 15: '.os' + 'tttTccTttt' + 'so.', 16: '.os' + 'TttTccTttT' + 'so.', 17: '..oTTTTccTTTTo..' },
  skirt: { 17: '.oTTToTTTToTTTo.', 18: 'oTTTToTTTToTTTTo' },
  dress: { 17: '.o' + 't'.repeat(12) + 'o.', 18: 'o' + 'T'.repeat(14) + 'o' },
  hoodie: { 14: '..o' + 'tttcttcttt' + 'o..', 15: '.ot' + 'tttcttcttt' + 'to.', 16: '.ot' + 'tTTTTTTTTt' + 'to.' },
  overalls: { 15: '.os' + 'tvttttttvt' + 'so.', 16: '.os' + 'vvvvvvvvvv' + 'so.', 17: '..o' + 'VVVVVVVVVV' + 'o..' },
};

for (const rows of [HEAD_FRONT, HEAD_BACK, BODY_FRONT, BODY_BACK, ...LEGS,
  ...[STYLE_OVERLAY, FACE_OVERLAY, OUTFIT_OVERLAY].flatMap((o) => Object.values(o).map((m) => Object.values(m)))]) {
  console.assert(rows.every((row) => row.length === 16), 'sprite rows must be 16 wide', rows);
}

function avatarRows(look: Look, step: number, up: boolean) {
  let rows = [BLANK, BLANK, ...(up ? HEAD_BACK : HEAD_FRONT), ...(up ? BODY_BACK : BODY_FRONT), ...LEGS[step]];
  const layers = [OUTFIT_OVERLAY[look.outfit ?? ''], STYLE_OVERLAY[look.style ?? ''], up ? null : FACE_OVERLAY[look.face ?? '']];
  for (const over of layers) {
    if (!over) continue;
    rows = rows.map((row, y) => (over[y] ? [...row].map((ch, x) => (over[y][x] !== '.' ? over[y][x] : ch)).join('') : row));
  }
  return rows;
}

// x, y = top-left of the tile the avatar stands on; the sprite overhangs the tile above.
export function drawAvatar(c: Ctx, look: Look, x: number, y: number, step: number, up: boolean) {
  const key = `av|${Object.values(look).join()}|${step}${up}`;
  const sprite = baked(key, 16, AVATAR_H, (g) =>
    paintRows(g, avatarRows(look, step, up), {
      o: OUT, h: look.hair, H: shade(look.hair, -0.15), l: shade(look.hair, 0.2),
      s: look.skin, S: shade(look.skin, -0.1), e: '#2a1e26', w: '#ffffff', b: '#f7a0a8', m: '#c8606a',
      t: look.shirt, T: shade(look.shirt, -0.15), c: '#fff4e6', d: '#7a5040',
      v: '#6a8ad0', V: '#5a78bc', r: '#e06a5a', p: look.outfit === 'overalls' ? '#5a78bc' : '#5a5080',
    }));
  r(c, x + 4, y + 14, 8, 2, 'rgba(58,38,51,0.22)');
  r(c, x + 3, y + 15, 10, 1, 'rgba(58,38,51,0.12)');
  c.drawImage(sprite, x, y + T - AVATAR_H + (step ? -1 : 0) + 1);
}

// The chair sits behind a desk and faces us: backrest at the back, seat and legs in front.
function chairBack(c: Ctx, x: number, y: number, col = '#f2b48a') {
  const Y = y - 6;
  box(c, x + 3, Y, 10, 11, col);
  r(c, x + 5, Y + 2, 6, 1, '#ffd0a8');
  heart(c, x + 8, Y + 4, '#f48a9a');
}
function chairSeat(c: Ctx, x: number, y: number, col = '#f2b48a') {
  const Y = y - 6;
  box(c, x + 3, Y + 14, 3, 8, '#9a6440');
  box(c, x + 10, Y + 14, 3, 8, '#9a6440');
  box(c, x + 2, Y + 10, 12, 6, shade(col, -0.06));
}

// Seated in a chair behind the desk, facing us: gentle bob and sparkles drifting up.
export function drawSeated(c: Ctx, look: Look, x: number, y: number, t: number, chairCol?: string) {
  const sprite = baked(`sit|${Object.values(look).join()}`, 16, 18, (g) =>
    paintRows(g, avatarRows(look, 0, false).slice(0, 18), {
      o: OUT, h: look.hair, H: shade(look.hair, -0.15), l: shade(look.hair, 0.2),
      s: look.skin, S: shade(look.skin, -0.1), e: '#2a1e26', w: '#ffffff', b: '#f7a0a8', m: '#c8606a',
      t: look.shirt, T: shade(look.shirt, -0.15), c: '#fff4e6', v: '#6a8ad0', V: '#5a78bc', r: '#e06a5a',
    }));
  chairBack(c, x, y, chairCol);
  c.drawImage(sprite, x, y - 13 + (Math.floor(t / 650) % 2));
  chairSeat(c, x, y, chairCol);
  const colors = ['#ffd34d', '#f4a6c8', '#a8dcf5'];
  for (let k = 0; k < 3; k++) {
    const p = (t / 1800 + k / 3) % 1;
    const sx = Math.round(x + 8 + Math.sin(p * 6 + k * 2) * 6);
    const sy = Math.round(y - 12 - p * 16);
    c.globalAlpha = 1 - p;
    r(c, sx - 1, sy, 3, 1, colors[k]);
    r(c, sx, sy - 1, 1, 3, colors[k]);
    c.globalAlpha = 1;
  }
}

// ---------- coin ----------
const COIN = [
  '...oooo...',
  '.ooyyyyoo.',
  '.oyllyyYo.',
  'oylyyyyyYo',
  'oyyyddyyYo',
  'oyyyddyyYo',
  'oyyyyyyyYo',
  '.oyyyyyYo.',
  '.ooYYYYoo.',
  '...oooo...',
];
const coinCanvas = () => baked('coin', 10, 10, (g) =>
  paintRows(g, COIN, { o: '#8a5a1a', y: '#ffd34d', l: '#fff3b0', Y: '#e8a628', d: '#e8a628' }));
export const coinURL = () => coinCanvas().toDataURL();

// ---------- room tiles ----------
export function drawFloor(c: Ctx, x: number, y: number, color: string, tx: number, ty: number, style = 'planks') {
  const v = (tx + ty * 3) % 2;
  const line = shade(color, -0.07);
  c.drawImage(baked(`fl|${color}|${style}|${v}|${(tx + ty) % 2}`, T, T, (g) => {
    r(g, 0, 0, T, T, color);
    if (style === 'tiles') {
      // Two-tone checker with soft grout.
      r(g, 0, 0, 8, 8, shade(color, 0.05));
      r(g, 8, 8, 8, 8, shade(color, 0.05));
      r(g, 0, 7, T, 1, line);
      r(g, 7, 0, 1, T, line);
      r(g, 0, 15, T, 1, line);
      r(g, 15, 0, 1, T, line);
    } else if (style === 'carpet') {
      for (let i = 0; i < 8; i++) r(g, (i * 5 + v * 3) % 16, (i * 7) % 16, 1, 1, shade(color, i % 2 ? 0.04 : -0.04));
    } else if (style === 'herringbone') {
      // Short planks that alternate direction every half tile.
      const flipped = (tx + ty) % 2 === 1;
      for (let q = 0; q < 4; q++) {
        const qx = (q % 2) * 8, qy = Math.floor(q / 2) * 8;
        const across = (q === 0 || q === 3) !== flipped;
        r(g, qx, qy, 8, 8, shade(color, q % 3 ? 0.03 : 0));
        if (across) { r(g, qx, qy + 3, 8, 1, line); r(g, qx, qy + 7, 8, 1, line); }
        else { r(g, qx + 3, qy, 1, 8, line); r(g, qx + 7, qy, 1, 8, line); }
      }
    } else {
      // Calm planks: two gentle tones and one seam per plank, no grain noise.
      r(g, 0, 0, T, 8, shade(color, v ? 0.02 : 0));
      r(g, 0, 7, T, 1, line);
      r(g, 0, 15, T, 1, line);
      r(g, v ? 5 : 11, 0, 1, 7, line);
      r(g, v ? 13 : 3, 8, 1, 7, line);
    }
  }), x, y);
}

// Wallpaper motif for one 16x16 tile; rows below `h` are left for trims.
function paintPattern(g: Ctx, paper: string, pattern: string, h: number) {
  r(g, 0, 0, T, h, paper);
  const ink = shade(paper, -0.07), light = shade(paper, 0.06);
  if (pattern === 'stripes') { r(g, 2, 0, 3, h, light); r(g, 10, 0, 3, h, light); }
  else if (pattern === 'dots') { for (const [a, b] of [[3, 3], [11, 7], [3, 11], [11, 15]]) if (b < h) r(g, a, b, 2, 2, ink); }
  else if (pattern === 'hearts') { heart(g, 4, 2, ink); if (h > 12) heart(g, 12, 10, ink); else heart(g, 12, 7, ink); }
  else if (pattern === 'checks') { for (let yy = 0; yy < h; yy += 8) { r(g, 0, yy, 4, Math.min(4, h - yy), light); r(g, 8, yy, 4, Math.min(4, h - yy), light); r(g, 4, yy + 4, 4, Math.min(4, h - yy - 4), light); r(g, 12, yy + 4, 4, Math.min(4, h - yy - 4), light); } }
  else if (pattern === 'stars') {
    for (const [a, b] of [[4, 4], [12, 10]]) if (b + 1 < h) { r(g, a - 1, b, 3, 1, light); r(g, a, b - 1, 1, 3, light); r(g, a, b, 1, 1, ink); }
  }
}

export function drawWallFace(c: Ctx, x: number, y: number, paper: string, pattern = 'plain') {
  c.drawImage(baked(`wf|${paper}|${pattern}`, T, T, (g) => {
    paintPattern(g, paper, pattern, 12);
    r(g, 0, 12, T, 3, shade(paper, -0.1));
    r(g, 0, 12, T, 1, '#fffaf3');
    r(g, 0, 15, T, 1, shade(paper, -0.22));
  }), x, y);
}

// Upper half of the two-tile back wall: wallpaper under a light crown trim.
export function drawWallTop(c: Ctx, x: number, y: number, paper: string, pattern = 'plain') {
  c.drawImage(baked(`wt|${paper}|${pattern}`, T, T, (g) => {
    paintPattern(g, paper, pattern, T);
    r(g, 0, 0, T, 2, shade(paper, -0.12));
    r(g, 0, 2, T, 1, '#fffaf3');
  }), x, y);
}

// Dollhouse-style walls: plain white; the outline is drawn around the house by the renderer.
export function drawWall(c: Ctx, x: number, y: number) {
  c.drawImage(baked('wall', T, T, (g) => {
    r(g, 0, 0, T, T, '#fbf7f2');
    r(g, 0, T - 2, T, 2, '#ece4da');
  }), x, y);
}

// The opening between two side-by-side rooms: each half keeps its own room's floor, with a trim seam between.
export function drawSeam(c: Ctx, x: number, y: number, tx: number, ty: number, left: { floor: string; floorStyle?: string }, right: { floor: string; floorStyle?: string }) {
  for (const [side, room] of [[0, left], [1, right]] as const) {
    c.save();
    c.beginPath();
    c.rect(x + side * 8, y, 8, T);
    c.clip();
    drawFloor(c, x, y, room.floor, tx, ty, room.floorStyle);
    c.restore();
  }
  r(c, x + 7, y, 2, T, '#fffaf3');
  r(c, x + 6, y, 1, T, 'rgba(43,37,48,0.12)');
  r(c, x + 9, y, 1, T, 'rgba(43,37,48,0.12)');
}

export function drawDoor(c: Ctx, x: number, y: number, tx: number, ty: number) {
  drawFloor(c, x, y, '#d9a46c', tx, ty);
}

export type Sky = 'day' | 'dusk' | 'night';
export function skyNow(): Sky {
  const h = new Date().getHours();
  return h >= 8 && h < 17 ? 'day' : (h >= 17 && h < 20) || (h >= 6 && h < 8) ? 'dusk' : 'night';
}

// A 2x2-tile window with curtains, filling the tall back wall above the panel strip.
export function drawWindow(c: Ctx, x: number, y: number, sky: Sky) {
  c.drawImage(baked(`win|${sky}`, 32, 32, (g) => {
    r(g, 5, 5, 22, 19, OUT);
    r(g, 6, 6, 20, 17, '#fffaf3');
    r(g, 7, 7, 18, 14, { day: '#a8dcf5', dusk: '#f7b58a', night: '#3a4280' }[sky]);
    if (sky === 'day') {
      r(g, 10, 9, 4, 1, '#ffffff'); r(g, 9, 10, 6, 1, '#ffffff'); r(g, 18, 16, 4, 1, '#ffffff'); r(g, 17, 17, 6, 1, '#ffffff');
    } else if (sky === 'dusk') {
      r(g, 18, 14, 3, 3, '#ffe08a'); r(g, 7, 18, 18, 3, '#f49a8a');
    } else {
      r(g, 10, 9, 2, 2, '#fff3b0'); r(g, 19, 9, 1, 1, '#ffffff'); r(g, 22, 15, 1, 1, '#ffffff'); r(g, 13, 17, 1, 1, '#fff3b0');
    }
    r(g, 15, 7, 2, 14, '#fffaf3');
    r(g, 7, 13, 18, 1, '#fffaf3');
    r(g, 3, 3, 26, 2, '#8a5a3c');
    for (const cx of [3, 23]) {
      r(g, cx, 5, 6, 19, '#f4a6b8');
      r(g, cx + 2, 5, 1, 19, '#e88aa0');
      r(g, cx + 4, 5, 1, 19, '#fbc4d0');
      r(g, cx, 24, 6, 1, OUT);
    }
    r(g, 4, 22, 24, 2, '#fffaf3');
    r(g, 4, 24, 24, 1, shade('#fffaf3', -0.15));
  }), x, y);
}

export function drawPainting(c: Ctx, x: number, y: number) {
  c.drawImage(baked('painting', T + 4, T, (g) => {
    r(g, 1, 1, 18, 13, OUT);
    r(g, 2, 2, 16, 11, '#d9a46c');
    r(g, 3, 3, 14, 9, '#cfe8f7');
    r(g, 3, 9, 14, 3, '#8fd0a8');
    r(g, 6, 8, 5, 1, '#8fd0a8');
    r(g, 7, 7, 3, 1, '#8fd0a8');
    r(g, 13, 5, 2, 2, '#ffd34d');
  }), x, y);
}

// ---------- furniture ----------
// Pixels each sprite reaches above its footprint (things stand "up" in the 3/4 view).
export const OVERHANG: Record<string, number> = {
  desk: 6, chair: 6, plant: 6, lamp: 12, rug: 0, bookshelf: 16, bed: 6, sofa: 8, aquarium: 14,
  books: 2, cactus: 8, sunflower: 12, globe: 8, beanbag: 0, roundRug: 0, coffeeTable: 2, armchair: 6, plush: 2,
  mirror: 14, recordPlayer: 4, guitar: 12, easel: 14, bonsai: 4, wardrobe: 18, piano: 12,
};

// col is the owner's chosen colour (undefined = the item's own default).
type Draw = (c: Ctx, x: number, y: number, t: number, col?: string) => void;
const DRAW: Record<string, Draw> = {
  desk(c, x, y, t, col = '#d9a06a') {
    const Y = y - 6;
    box(c, x + 2, Y + 14, 4, 8, shade(col, -0.2));
    box(c, x + 26, Y + 14, 4, 8, shade(col, -0.2));
    box(c, x, Y + 6, 32, 12, col);
    r(c, x + 1, Y + 14, 30, 3, shade(col, -0.12));
    r(c, x + 14, Y + 15, 4, 1, '#ffe0a8');
    box(c, x + 5, Y, 13, 9, '#6a6488');
    // Laptop seen from the front of the desk: we see the lid, the sitter sees the screen.
    r(c, x + 6, Y + 1, 11, 6, '#8a84a8');
    r(c, x + 6, Y + 1, 11, 1, '#a49ec0');
    heart(c, x + 11, Y + 2, '#f4b6c8');
    box(c, x + 4, Y + 8, 15, 4, '#d8d4e8');
    box(c, x + 21, Y + 5, 5, 6, '#fff4e6');
    r(c, x + 22, Y + 6, 3, 1, '#9a6440');
    r(c, x + 26, Y + 7, 1, 2, OUT);
    const s = Math.floor(t / 450) % 2;
    r(c, x + 22 + s, Y + 2, 1, 2, 'rgba(255,255,255,0.75)');
    r(c, x + 24 - s, Y + 1, 1, 2, 'rgba(255,255,255,0.6)');
    box(c, x + 27, Y + 9, 4, 3, '#f48a8a');
    box(c, x + 27, Y + 7, 4, 3, '#8fd0a8');
  },
  chair(c, x, y, _t, col) {
    chairBack(c, x, y, col);
    chairSeat(c, x, y, col);
  },
  books(c, x, y) {
    const Y = y - 2;
    box(c, x + 2, Y + 12, 12, 5, '#7fb2e8');
    box(c, x + 3, Y + 8, 10, 5, '#f48a8a');
    box(c, x + 2, Y + 4, 11, 5, '#ffd27a');
    r(c, x + 4, Y + 6, 7, 1, '#fffaf3');
    box(c, x + 5, Y, 6, 5, '#8fd0a8');
    heart(c, x + 8, Y + 1, '#fffaf3');
  },
  cactus(c, x, y) {
    const Y = y - 8;
    box(c, x + 3, Y + 6, 4, 6, '#6cbf7a');
    box(c, x + 10, Y + 4, 4, 7, '#6cbf7a');
    box(c, x + 6, Y + 2, 5, 17, '#6cbf7a');
    r(c, x + 7, Y + 3, 1, 14, '#8fd89a');
    for (const [a, b] of [[8, 6], [9, 11], [7, 14], [4, 8], [12, 6]]) r(c, x + a, Y + b, 1, 1, '#fffaf3');
    heart(c, x + 8, Y - 1, '#f4a6c8');
    box(c, x + 4, Y + 17, 8, 7, '#e8956e');
    r(c, x + 5, Y + 18, 6, 1, '#f2b48a');
  },
  plant(c, x, y, _t, col = '#d97a55') {
    const Y = y - 6;
    const leaves = [[8, 8, 4], [4, 10, 3], [12, 10, 3], [6, 4, 3], [10, 4, 3]];
    for (const [a, b, rad] of leaves) disc(c, x + a, Y + b, rad + 1, OUT);
    for (const [a, b, rad] of leaves) {
      disc(c, x + a, Y + b, rad, '#4f9a6a');
      disc(c, x + a, Y + b - 1, rad - 1, '#6cbf7a');
      r(c, x + a - 1, Y + b - rad + 1, 2, 1, '#a8e6a0');
    }
    box(c, x + 4, Y + 15, 8, 7, col);
    box(c, x + 3, Y + 13, 10, 4, shade(col, 0.08));
    heart(c, x + 8, Y + 17, '#fff4e6');
  },
  sunflower(c, x, y, _t, col = '#7fb2e8') {
    const Y = y - 12;
    r(c, x + 7, Y + 9, 2, 12, '#4f9a6a');
    box(c, x + 3, Y + 12, 5, 3, '#6cbf7a');
    box(c, x + 9, Y + 15, 5, 3, '#6cbf7a');
    disc(c, x + 8, Y + 6, 6, OUT);
    disc(c, x + 8, Y + 6, 5, '#ffd34d');
    disc(c, x + 8, Y + 6, 2, '#8a5a3c');
    r(c, x + 7, Y + 5, 1, 1, '#b07a4e');
    box(c, x + 4, Y + 20, 8, 8, col);
    r(c, x + 5, Y + 21, 6, 1, shade(col, 0.15));
  },
  lamp(c, x, y, t, col = '#ffd98a') {
    const Y = y - 12;
    const glow = c.createRadialGradient(x + 8, Y + 8, 1, x + 8, Y + 8, 26);
    glow.addColorStop(0, `rgba(255,236,170,${0.32 + 0.05 * Math.sin(t / 600)})`);
    glow.addColorStop(1, 'rgba(255,236,170,0)');
    c.fillStyle = glow;
    c.fillRect(x - 18, Y - 18, 52, 52);
    box(c, x + 4, Y + 24, 8, 4, '#a08cc0');
    r(c, x + 7, Y + 11, 3, 14, OUT);
    r(c, x + 8, Y + 11, 1, 14, '#d8c8f0');
    r(c, x + 3, Y + 1, 10, 1, OUT);
    for (let i = 0; i < 8; i++) {
      const hw = 4 + (i >> 1);
      r(c, x + 8 - hw - 1, Y + 2 + i, hw * 2 + 2, 1, OUT);
      r(c, x + 8 - hw, Y + 2 + i, hw * 2, 1, i === 7 ? shade(col, -0.15) : col);
    }
    r(c, x + 1, Y + 10, 14, 1, OUT);
    r(c, x + 6, Y + 3, 1, 4, 'rgba(255,255,255,0.6)');
  },
  rug(c, x, y, _t, col = '#e98a9a') {
    box(c, x + 3, y + 2, 42, 28, col);
    r(c, x + 6, y + 5, 36, 22, shade(col, 0.14));
    r(c, x + 7, y + 6, 34, 20, shade(col, 0.2));
    for (let i = 0; i < 4; i++) heart(c, x + 12 + i * 8, y + 11 + (i % 2) * 6, shade(col, 0.04));
    for (let k = 0; k < 13; k++) {
      r(c, x + 1, y + 4 + k * 2, 2, 1, '#fff4e6');
      r(c, x + 45, y + 4 + k * 2, 2, 1, '#fff4e6');
    }
  },
  roundRug(c, x, y, _t, col = '#b89af0') {
    disc(c, x + 16, y + 16, 14, OUT);
    disc(c, x + 16, y + 16, 13, col);
    disc(c, x + 16, y + 16, 10, shade(col, 0.12));
    disc(c, x + 16, y + 16, 6, col);
    disc(c, x + 16, y + 16, 3, shade(col, 0.2));
  },
  globe(c, x, y) {
    const Y = y - 8;
    box(c, x + 4, Y + 20, 8, 4, '#8a5a3c');
    r(c, x + 7, Y + 15, 2, 6, '#b07a4e');
    r(c, x + 2, Y + 3, 1, 12, '#c9a050');
    r(c, x + 3, Y + 14, 4, 1, '#c9a050');
    disc(c, x + 8, Y + 8, 6, OUT);
    disc(c, x + 8, Y + 8, 5, '#7fb2e8');
    r(c, x + 5, Y + 5, 3, 3, '#8fd0a8');
    r(c, x + 9, Y + 9, 4, 2, '#8fd0a8');
    r(c, x + 6, Y + 11, 2, 1, '#8fd0a8');
    r(c, x + 9, Y + 4, 1, 1, '#ffffff');
  },
  beanbag(c, x, y, _t, col = '#f4a6b8') {
    disc(c, x + 8, y + 9, 7, OUT);
    disc(c, x + 8, y + 9, 6, col);
    disc(c, x + 8, y + 11, 4, shade(col, -0.08));
    disc(c, x + 7, y + 6, 2, shade(col, 0.15));
  },
  bookshelf(c, x, y, _t, col = '#b07a4e') {
    const Y = y - 16;
    box(c, x, Y, 32, 32, col);
    const colors = ['#f48a8a', '#7fb2e8', '#8fd0a8', '#ffd27a', '#b89af0', '#f4b6d0', '#fff4e6'];
    for (let s = 0; s < 3; s++) {
      const sy = Y + 3 + s * 9;
      r(c, x + 3, sy, 26, 7, shade(col, -0.25));
      const end = s === 1 ? x + 21 : x + 28;
      for (let i = 0, bx = x + 4; ; i++) {
        const w = 2 + ((i * 3 + s) % 2);
        const h = 4 + ((i * 5 + s * 2) % 3);
        if (bx + w > end) break;
        const bc = colors[(i + s * 3) % colors.length];
        r(c, bx, sy + 7 - h, w, h, bc);
        r(c, bx, sy + 7 - h, w, 1, shade(bc, 0.15));
        bx += w + (i % 4 === 3 ? 2 : 0);
      }
      if (s === 1) {
        r(c, x + 24, sy + 1, 3, 4, '#6cbf7a');
        r(c, x + 23, sy + 5, 5, 2, '#d97a55');
      }
    }
  },
  coffeeTable(c, x, y, _t, col = '#d9a06a') {
    const Y = y - 2;
    box(c, x + 3, Y + 10, 3, 8, shade(col, -0.2));
    box(c, x + 26, Y + 10, 3, 8, shade(col, -0.2));
    box(c, x + 1, Y + 2, 30, 10, col);
    r(c, x + 2, Y + 9, 28, 2, shade(col, -0.12));
    box(c, x + 6, Y, 5, 5, '#fff4e6');
    r(c, x + 7, Y + 1, 3, 1, '#9a6440');
    box(c, x + 15, Y + 3, 9, 3, '#f4a6b8');
    r(c, x + 16, Y + 4, 7, 1, '#fffaf3');
  },
  armchair(c, x, y, _t, col = '#f2b48a') {
    const Y = y - 6;
    r(c, x + 3, Y + 20, 2, 2, OUT);
    r(c, x + 11, Y + 20, 2, 2, OUT);
    box(c, x + 2, Y, 12, 12, shade(col, -0.05));
    heart(c, x + 8, Y + 3, shade(col, 0.15));
    box(c, x + 3, Y + 10, 10, 9, col);
    box(c, x, Y + 7, 4, 13, shade(col, -0.15));
    box(c, x + 12, Y + 7, 4, 13, shade(col, -0.15));
  },
  plush(c, x, y, t, col = '#f2b48a') {
    const Y = y - 2 + (Math.floor(t / 900) % 2);
    for (const ex of [4, 12]) { disc(c, x + ex, Y + 4, 3, OUT); disc(c, x + ex, Y + 4, 2, col); r(c, x + ex, Y + 4, 1, 1, '#f4a6c8'); }
    disc(c, x + 8, Y + 11, 7, OUT);
    disc(c, x + 8, Y + 11, 6, col);
    disc(c, x + 8, Y + 13, 3, shade(col, 0.18));
    r(c, x + 5, Y + 9, 1, 2, OUT);
    r(c, x + 10, Y + 9, 1, 2, OUT);
    r(c, x + 7, Y + 12, 2, 1, OUT);
    r(c, x + 3, Y + 11, 2, 1, '#f7a0a8');
    r(c, x + 11, Y + 11, 2, 1, '#f7a0a8');
  },
  mirror(c, x, y, t, col = '#d9a06a') {
    const Y = y - 14;
    box(c, x + 3, Y, 10, 28, col);
    r(c, x + 5, Y + 2, 6, 24, '#d4f0fb');
    const sh = Math.floor(t / 2500) % 2;
    r(c, x + 6 + sh, Y + 4, 1, 6, '#ffffff');
    r(c, x + 8 + sh, Y + 3, 1, 3, '#ffffff');
    box(c, x + 2, Y + 26, 4, 4, shade(col, -0.2));
    box(c, x + 10, Y + 26, 4, 4, shade(col, -0.2));
  },
  recordPlayer(c, x, y, t, col = '#b07a4e') {
    const Y = y - 4;
    box(c, x + 1, Y + 8, 14, 12, col);
    r(c, x + 3, Y + 12, 10, 1, shade(col, -0.15));
    r(c, x + 3, Y + 15, 10, 1, shade(col, -0.15));
    box(c, x + 1, Y + 3, 14, 7, '#e8e3dc');
    disc(c, x + 7, Y + 6, 3, '#2b2530');
    r(c, x + 7, Y + 6, 1, 1, '#f48a8a');
    r(c, x + 12, Y + 4, 1, 4, '#8a8090');
    const n = Math.floor(t / 500) % 3;
    r(c, x + 12 + n, Y - 2 - n, 2, 2, '#b89af0');
    r(c, x + 14 + n, Y - 3 - n, 1, 3, '#b89af0');
  },
  bed(c, x, y, _t, col = '#9cc4f0') {
    const Y = y - 6;
    box(c, x, Y, 32, 14, '#c58b5a');
    heart(c, x + 16, Y + 4, '#f4a6b8');
    box(c, x + 1, Y + 8, 30, 46, '#a8714a');
    r(c, x + 3, Y + 10, 26, 42, '#fff8f0');
    box(c, x + 5, Y + 11, 22, 9, '#ffffff');
    r(c, x + 6, Y + 17, 20, 1, '#e8e0f0');
    box(c, x + 1, Y + 24, 30, 30, col);
    box(c, x + 1, Y + 22, 30, 6, shade(col, 0.1));
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) r(c, x + 6 + i * 6, Y + 32 + j * 7 + (i % 2) * 3, 2, 2, shade(col, 0.16));
  },
  guitar(c, x, y) {
    const Y = y - 12;
    r(c, x + 7, Y + 1, 2, 13, '#8a5a3c');
    box(c, x + 5, Y - 1, 6, 4, '#5a3620');
    disc(c, x + 8, Y + 21, 6, OUT);
    disc(c, x + 8, Y + 14, 4, OUT);
    disc(c, x + 8, Y + 21, 5, '#e8a050');
    disc(c, x + 8, Y + 14, 3, '#e8a050');
    disc(c, x + 8, Y + 17, 1, '#5a3620');
    r(c, x + 6, Y + 23, 4, 1, '#5a3620');
    r(c, x + 5, Y + 19, 1, 3, '#f2c48a');
  },
  easel(c, x, y) {
    const Y = y - 14;
    r(c, x + 3, Y + 12, 2, 18, '#8a5a3c');
    r(c, x + 11, Y + 12, 2, 18, '#8a5a3c');
    r(c, x + 7, Y + 14, 2, 16, '#6e4630');
    box(c, x + 1, Y, 14, 15, '#fffaf3');
    r(c, x + 3, Y + 9, 10, 4, '#8fd0a8');
    disc(c, x + 10, Y + 5, 2, '#ffd34d');
    heart(c, x + 6, Y + 3, '#f4a6c8');
    r(c, x, Y + 14, 16, 2, '#b07a4e');
  },
  sofa(c, x, y, _t, col = '#9db4ee') {
    const Y = y - 8;
    r(c, x + 4, Y + 21, 2, 3, OUT);
    r(c, x + 42, Y + 21, 2, 3, OUT);
    box(c, x + 3, Y, 42, 14, shade(col, -0.05));
    box(c, x + 6, Y + 2, 18, 11, col);
    box(c, x + 24, Y + 2, 18, 11, col);
    box(c, x + 4, Y + 11, 40, 10, shade(col, -0.1));
    box(c, x, Y + 5, 8, 17, shade(col, -0.18));
    box(c, x + 40, Y + 5, 8, 17, shade(col, -0.18));
    box(c, x + 9, Y + 5, 9, 8, '#f4a6b8');
    heart(c, x + 13, Y + 7, '#fff4e6');
  },
  bonsai(c, x, y) {
    const Y = y - 4;
    r(c, x + 7, Y + 7, 2, 8, '#8a5a3c');
    r(c, x + 5, Y + 9, 3, 1, '#8a5a3c');
    for (const [a, b, rad] of [[5, 6, 3], [11, 5, 3], [8, 3, 3]]) disc(c, x + a, Y + b, rad + 1, OUT);
    for (const [a, b, rad] of [[5, 6, 3], [11, 5, 3], [8, 3, 3]]) { disc(c, x + a, Y + b, rad, '#6cbf7a'); r(c, x + a - 1, Y + b - 2, 2, 1, '#a8e6a0'); }
    box(c, x + 2, Y + 14, 12, 6, '#7a6a8a');
    r(c, x + 3, Y + 15, 10, 1, '#9a8aaa');
  },
  wardrobe(c, x, y, _t, col = '#f0d2a8') {
    const Y = y - 18;
    box(c, x, Y, 32, 34, col);
    r(c, x + 1, Y + 1, 30, 2, shade(col, 0.1));
    r(c, x + 15, Y + 4, 2, 28, shade(col, -0.2));
    box(c, x + 3, Y + 5, 11, 26, shade(col, 0.05));
    box(c, x + 18, Y + 5, 11, 26, shade(col, 0.05));
    r(c, x + 12, Y + 16, 1, 3, OUT);
    r(c, x + 19, Y + 16, 1, 3, OUT);
    heart(c, x + 8, Y + 9, '#f4a6c8');
    heart(c, x + 24, Y + 9, '#f4a6c8');
  },
  aquarium(c, x, y, t) {
    const Y = y - 14;
    box(c, x, Y + 18, 32, 12, '#8a78b0');
    r(c, x + 15, Y + 20, 1, 8, shade('#8a78b0', -0.15));
    r(c, x + 12, Y + 23, 1, 2, '#ffe0a8');
    r(c, x + 19, Y + 23, 1, 2, '#ffe0a8');
    box(c, x + 1, Y, 30, 19, '#bfe9ff');
    r(c, x + 2, Y + 3, 28, 15, '#7ccfe8');
    r(c, x + 2, Y + 15, 28, 3, '#f2dca0');
    r(c, x + 6, Y + 16, 2, 1, '#e8a0b0');
    r(c, x + 20, Y + 16, 2, 1, '#b8a8e0');
    for (const k of [5, 25]) {
      for (let i = 0; i < 5; i++) r(c, x + k + ((Math.floor(t / 300) + i) % 2), Y + 13 - i * 2, 1, 2, '#5fbf7a');
    }
    const fish = (phase: number, fy: number, fc: string) => {
      const s = Math.sin(t / 1600 + phase);
      const fx = x + 5 + Math.round((s + 1) * 9);
      const right = Math.cos(t / 1600 + phase) > 0;
      r(c, fx, fy, 4, 3, fc);
      r(c, right ? fx - 2 : fx + 4, fy, 2, 3, shade(fc, -0.12));
      r(c, right ? fx + 2 : fx + 1, fy + 1, 1, 1, OUT);
    };
    fish(0, Y + 6, '#ff9a5a');
    fish(2, Y + 10, '#f4a6c8');
    for (let k = 0; k < 2; k++) r(c, x + 22 + k * 3, Y + 14 - Math.floor((t / 70 + k * 37) % 11), 1, 1, '#ffffff');
    r(c, x + 4, Y + 4, 1, 4, 'rgba(255,255,255,0.6)');
    r(c, x + 2, Y + 1, 28, 1, '#e8f6ff');
  },
  piano(c, x, y, _t, col = '#8a5a3c') {
    const Y = y - 12;
    box(c, x, Y, 32, 24, col);
    r(c, x + 1, Y + 1, 30, 2, shade(col, 0.12));
    box(c, x + 8, Y + 3, 16, 6, '#fffaf3');
    r(c, x + 10, Y + 5, 12, 1, '#c8c0d0');
    box(c, x + 1, Y + 12, 30, 6, '#fffaf3');
    for (let k = 0; k < 7; k++) r(c, x + 4 + k * 4, Y + 13, 2, 3, OUT);
    r(c, x + 3, Y + 24, 2, 4, OUT);
    r(c, x + 27, Y + 24, 2, 4, OUT);
  },
};

export function drawFurniture(c: Ctx, item: string, x: number, y: number, t: number, col?: string, flip = false, w = 1) {
  const draw = DRAW[item];
  if (!draw) return;
  if (!flip) { draw(c, x, y, t, col); return; }
  // Turned pieces are mirrored around the middle of their footprint.
  c.save();
  c.translate(x * 2 + w * T, 0);
  c.scale(-1, 1);
  draw(c, x, y, t, col);
  c.restore();
}

// ---------- UI icons ----------
const UI_ICONS: Record<string, { rows: string[]; pal: Record<string, string> }> = {
  clock: {
    rows: [
      '....oooo....',
      '..oowwwwoo..',
      '.owwwwkwwwo.',
      '.owwwwkwwwo.',
      'owwwwwkwwwwo',
      'owwwwwkkkwwo',
      'owwwwwwwwwwo',
      '.owwwwwwwwo.',
      '.owwwwwwwwo.',
      '..oowwwwoo..',
      '....oooo....',
      '............',
    ],
    pal: { o: OUT, w: '#fff4e6', k: '#e8735a' },
  },
  chair: {
    rows: [
      '............',
      '...oooooo...',
      '..oppppppo..',
      '..oppppppo..',
      'oooppppppooo',
      'oaooooooooao',
      'oaoPPPPPPoao',
      'oaooooooooao',
      'oooooooooooo',
      '.o.o....o.o.',
      '............',
      '............',
    ],
    pal: { o: OUT, p: '#8fd0a8', P: '#bfe8cc', a: '#6cb88a' },
  },
  bag: {
    rows: [
      '....oooo....',
      '...o....o...',
      '...o....o...',
      '.oooooooooo.',
      '.oyyyyyyyyo.',
      '.oyyyyyyyyo.',
      '.oyyhyyhyyo.',
      '.oyyhhhhyyo.',
      '.oyyyhhyyyo.',
      '.oyyyyyyyyo.',
      '.oooooooooo.',
      '............',
    ],
    pal: { o: OUT, y: '#ffd27a', h: '#f48a8a' },
  },
  face: {
    rows: [
      '.oo......oo.',
      'ohho....ohho',
      '.oohhhhhhoo.',
      '.ohhhhhhhho.',
      'ohhhhhhhhhho',
      'ohssssssssho',
      'osseesseesso',
      'osbssmmssbso',
      '.osssssssso.',
      '..oooooooo..',
      '............',
      '............',
    ],
    pal: { o: OUT, h: '#f4b6c8', s: '#ffe0c8', e: '#2a1e26', b: '#f7a0a8', m: '#c8606a' },
  },
  x: {
    rows: [
      '.oo......oo.',
      'oxxo....oxxo',
      'oxxxo..oxxxo',
      '.oxxxooxxxo.',
      '..oxxxxxxo..',
      '...oxxxxo...',
      '...oxxxxo...',
      '..oxxxxxxo..',
      '.oxxxooxxxo.',
      'oxxxo..oxxxo',
      'oxxo....oxxo',
      '.oo......oo.',
    ],
    pal: { o: OUT, x: '#e06a5a' },
  },
  chart: {
    rows: [
      '............',
      '........ooo.',
      '........oyo.',
      '....ooo.oyo.',
      '....obo.oyo.',
      'ooo.obo.oyo.',
      'opo.obo.oyo.',
      'opo.obo.oyo.',
      'opo.obo.oyo.',
      'oooooooooooo',
      '............',
      '............',
    ],
    pal: { o: OUT, p: '#f4a6b8', b: '#9db4ee', y: '#ffd27a' },
  },
  chat: {
    rows: [
      '............',
      '.oooooooooo.',
      'owwwwwwwwwwo',
      'owwwwwwwwwwo',
      'owwkwwkwwkwo',
      'owwwwwwwwwwo',
      'owwwwwwwwwwo',
      '.oooowooooo.',
      '....owo.....',
      '....oo......',
      '............',
      '............',
    ],
    pal: { o: OUT, w: '#cfdcf5', k: OUT },
  },
  house: {
    rows: [
      '.....oo.....',
      '....orro....',
      '...orrrro...',
      '..orrrrrro..',
      '.orrrrrrrro.',
      'oooooooooooo',
      '.owwwwwwwwo.',
      '.owbbwwddwo.',
      '.owbbwwddwo.',
      '.owwwwwddwo.',
      '.oooooooooo.',
      '............',
    ],
    pal: { o: OUT, r: '#b89af0', w: '#fff4e6', b: '#a8dcf5', d: '#b07a4e' },
  },
};
for (const { rows } of Object.values(UI_ICONS)) console.assert(rows.every((row) => row.length === 12), 'icon rows must be 12 wide', rows);

export const uiIconURL = (name: string) =>
  baked(`ui|${name}`, 12, 12, (g) => paintRows(g, UI_ICONS[name].rows, UI_ICONS[name].pal)).toDataURL();

// ---------- backdrop ----------
// Flat warm paper with a faint dot grid; px is the size of one art pixel in screen pixels.
export function drawPaper(c: Ctx, w: number, h: number, px: number) {
  r(c, 0, 0, w, h, '#efe6da');
  const step = px * 12;
  for (let y = step / 2; y < h; y += step) for (let x = step / 2; x < w; x += step) r(c, Math.round(x), Math.round(y), px, px, '#e3d7c8');
}

// ---------- blocky timer font ----------
const GLYPHS: Record<string, string[]> = {
  '0': ['01110', '11011', '11011', '11011', '11011', '11011', '01110'],
  '1': ['00110', '01110', '00110', '00110', '00110', '00110', '01111'],
  '2': ['01110', '11011', '00011', '00110', '01100', '11000', '11111'],
  '3': ['11110', '00011', '00011', '01110', '00011', '00011', '11110'],
  '4': ['00110', '01110', '11010', '11011', '11111', '00011', '00011'],
  '5': ['11111', '11000', '11110', '00011', '00011', '11011', '01110'],
  '6': ['01110', '11000', '11110', '11011', '11011', '11011', '01110'],
  '7': ['11111', '00011', '00011', '00110', '01100', '01100', '01100'],
  '8': ['01110', '11011', '11011', '01110', '11011', '11011', '01110'],
  '9': ['01110', '11011', '11011', '01111', '00011', '00011', '01110'],
  ':': ['0', '1', '1', '0', '1', '1', '0'],
};
// Draws text into a canvas at 1 art pixel per glyph pixel, with a drop shadow; scale it up with CSS.
export function paintBlockText(cv: HTMLCanvasElement, text: string, color: string, shadow: string) {
  const glyphs = [...text].map((ch) => GLYPHS[ch]).filter(Boolean);
  const w = glyphs.reduce((n, g) => n + g[0].length + 1, 0);
  if (cv.width !== w || cv.height !== 8) { cv.width = w; cv.height = 8; }
  const c = cv.getContext('2d')!;
  c.clearRect(0, 0, w, 8);
  for (const [dy, col] of [[1, shadow], [0, color]] as const) {
    let x = 0;
    for (const g of glyphs) {
      g.forEach((row, y) => { for (let i = 0; i < row.length; i++) if (row[i] === '1') r(c, x + i, y + dy, 1, 1, col); });
      x += g[0].length + 1;
    }
  }
}
