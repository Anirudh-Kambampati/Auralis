// All art is original pixel art drawn in code. Coordinates are art pixels; one tile is 16x16.
export const T = 16;
const OUT = '#3a2633';

type Ctx = CanvasRenderingContext2D;
export type Look = { skin: string; hair: string; shirt: string; style?: string; face?: string; outfit?: string; body?: string; acc?: string };

// Furniture palette: while furniture is drawn, the original candy colours become warmer, muted ones (teak and walnut,
// olive, mustard, terracotta, dusty blue, cream) with warm brown outlines. Characters, pets and icons keep theirs.
const MUTED: Record<string, string> = {
  [OUT]: '#33241f', '#2b2530': '#2e211c', '#3a3448': '#3b3436', '#5a5070': '#5b5052', '#7a7090': '#7d7068', '#a8a0b8': '#a89c90',
  '#fffaf3': '#f6eee0', '#fff4e6': '#f2e6d2', '#ffffff': '#fbf6ec', '#e8e3dc': '#e6dccb',
  '#f48a8a': '#d47a62', '#f4a6b8': '#d9a49a', '#f4a6c8': '#dcaaa8', '#f7a0a8': '#d89a8c', '#f06a8a': '#c86a5e', '#e06a5a': '#c0583e',
  '#8fd0a8': '#9fb47a', '#6cbf7a': '#7f9c55', '#4f9a6a': '#5e7a45', '#a8e6a0': '#b8c890',
  '#9db4ee': '#7f9cb2', '#7fb2e8': '#6f93ad', '#cfe1f7': '#c8d6dc', '#a8dcf5': '#a9c6d2', '#d4f0fb': '#d4e2e4', '#cfeaf5': '#cddfe2', '#9cc4f0': '#8fb0c2',
  '#ffd27a': '#e0b04c', '#ffd34d': '#e8b43c', '#fff3b0': '#f4e2a8', '#ffe0a8': '#f0d4a0',
  '#b89af0': '#a08cb0', '#7a6a8a': '#5c5560',
  '#f2b48a': '#dc8a55', '#e8956e': '#d07a4c', '#d97a55': '#c06a42', '#f28a3a': '#d8742c', '#e8a050': '#d08e40',
  '#e98a9a': '#c88a72', '#d9a06a': '#c08048', '#b07a4e': '#9a6038', '#8a5a3c': '#704428', '#f0d2a8': '#e2c494', '#9a6440': '#82522f', '#5a3620': '#4a2c18', '#c58b5a': '#b07a48',
};
let furnishing = false; // true while drawFurniture runs
const tone = (color: string) => (furnishing ? MUTED[color] ?? color : color);
const r = (c: Ctx, x: number, y: number, w: number, h: number, color: string) => {
  c.fillStyle = tone(color);
  c.fillRect(x, y, w, h);
};

export function shade(hex: string, amt: number) {
  const n = parseInt(tone(hex).slice(1, 7), 16);
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

// Outlined box with rounded corners, lit from the top left: a bright top, a shaded right side and a darker base.
function box(c: Ctx, x: number, y: number, w: number, h: number, fill: string) {
  r(c, x + 1, y, w - 2, 1, OUT);
  r(c, x + 1, y + h - 1, w - 2, 1, OUT);
  r(c, x, y + 1, 1, h - 2, OUT);
  r(c, x + w - 1, y + 1, 1, h - 2, OUT);
  r(c, x + 1, y + 1, w - 2, h - 2, fill);
  if (w > 5 && h > 4) r(c, x + w - 2, y + 2, 1, h - 3, shade(fill, -0.06));
  r(c, x + 1, y + 1, w - 2, 1, shade(fill, 0.12));
  if (h > 7) r(c, x + 1, y + 2, w - 2, 1, shade(fill, 0.05));
  if (h > 3) r(c, x + 1, y + h - 2, w - 2, 1, shade(fill, -0.12));
  if (h > 9) r(c, x + 1, y + h - 3, w - 2, 1, shade(fill, -0.05));
}

function disc(c: Ctx, cx: number, cy: number, rad: number, color: string) {
  for (let dy = -rad; dy <= rad; dy++) {
    const half = Math.floor(Math.sqrt(rad * rad + rad * 0.6 - dy * dy));
    r(c, cx - half, cy + dy, half * 2 + 1, 1, color);
  }
}

function pix(c: Ctx, x: number, y: number, rows: string[], pal: Record<string, string>) {
  rows.forEach((row, dy) => {
    for (let i = 0; i < row.length;) {
      let j = i;
      while (j < row.length && row[j] === row[i]) j++;
      if (row[i] !== '.') r(c, x + i, y + dy, j - i, 1, pal[row[i]]);
      i = j;
    }
  });
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
  short: { 2: '.....oooooo.....', 3: '...oohhhhhhoo...', 4: '..ohhhhhhlhhho..', 5: '.ohhhhhhhllhhho.', 6: '.ohhhhhhhhhhhho.', 7: '.ohHhhhhhHhhhho.', 8: '.ohsHhhhHshhhHo.', 9: '.ohssHhHssssHho.' },
  'side part': { 2: '.....oooooo.....', 3: '...oohhhhhhoo...', 4: '..ohhhhhlhhhho..', 5: '.ohhhhhhllhhhho.', 6: '.ohhhhhhhhhhhho.', 7: '.ohHHhhhhhhhhho.', 8: '.ohhhHHhhhhhHho.', 9: '.osssssHHhhhHho.' },
  // close crop: no fringe, skin at the temples
  buzz: { 8: '.o' + 's'.repeat(12) + 'o.', ...rows(9, 12, '..s..........s..') },
  spiky: { 0: '....o...o..o....', 1: '...oho.oho.oho..', 2: '..ohlhoohhoohho.', 3: '.ohllhhhhhhhhho.', 4: 'ohhlhhhhhhhhhhho', 5: 'ohhhhhhhhhhhHhho', 6: '.ohhhHhhhhHhhHo.', 7: '.ohhHhhhhhhHhho.', 8: '.oHhsHhHhHshHho.', 9: '.oHsssHsHsssHso.' },
  curly: {
    1: '....oooooooo....', 2: '..oohhHhhHhhoo..', 3: '.ohhHhhhhhhHhho.', 4: 'o' + 'h'.repeat(14) + 'o',
    ...rows(5, 7, 'ohH' + 'h'.repeat(10) + 'Hho'), ...rows(8, 11, 'oh............ho'), 12: '.oh..........ho.', 13: '.oo..........oo.',
  },
  bob: { 8: '.o' + 'h'.repeat(12) + 'o.', ...rows(9, 12, 'oh............ho'), 13: '.oo..........oo.' },
  long: longRows,
  ponytail: { 3: '..............o.', 4: '..............po', ...rows(5, 10, '..............ho'), 11: '..............o.' },
  buns: { 0: '..ooo......ooo..', 1: '.ohlho....ohlho.', 2: '.ohhho....ohhho.', 3: '..ooo......ooo..' },
  messy: { 1: '.....oooooo.....', 2: '...oohhhhhhooo..', 3: '..ohhlhhhhhhhho.', 4: '.ohhllhhhhhhhhho', 5: '.ohhhhhhhhhHhhho', 6: 'ohhhhhhhHHhhhHo.', 7: 'ohHhhhhHhhhhHho.', 8: '.ohHhhHhsHhhHho.', 9: '.ohsHHssssHsHho.' },
  undercut: { 3: '...oohhhhhhoo...', 4: '..ohhhlhhhhhho..', 5: '.ohhhllhhhhhhho.', 6: '.ohhhhhhhhhhHho.', 7: '.osHhhhhhhhHHso.', 8: '.ossHhhhhHHssso.' },
  quiff: { 1: '.....ooooooo....', 2: '...oohhhhllhoo..', 3: '..ohhhhhhhhlhho.', 4: '.ohhhhhhhhhhhho.', 5: '.ohhhhHhhhhhhho.', 6: '.ohhHhhhhhhHhho.', 7: '.ohHhhhhhhhhHho.', 8: '.ohsHhhhhhhHsho.', 9: '.ohssHsssssHsho.' },
  fauxhawk: { 0: '.o..o.oo..o..o..', 1: '.oho.ohho.ohoho.', 2: '..ohhhhlhhhhho..', 3: 'oohhhllhhhhhhhoo', 4: 'ohhhlhhhhhhhhhho', 5: '.ohhhhhHhhhhhho.', 6: 'ohhHhhhhhhhHhhho', 7: '.ohhHhhhhhhHhho.', 8: '.oHhshHhhHhshHo.', 9: '.oHssshsshsssHo.' },
  topknot: { 0: '......oooo......', 1: '.....ohlhho.....', 2: '...oooHhhHooo...', 3: '..ohhhhhhhhhho..', 4: '.ohhlhhhhhhhhho.', 5: '.ohllhhhhhhhhho.', 6: '.ohhhhhhhhhhhho.', 7: '.ohhhHhhhhHhhho.', 8: '.oHhsHhhhHshhHo.', 9: '.oHssshHhssssHo.' },
  slick: { 3: '...oohhhhhhoo...', 4: '..ohhhlhhhhhho..', 5: '.ohhhllhhhhhhho.', 6: '.ohhhhhhhhhhhho.', 7: '.ohHhhhhhhhhHho.', 8: '.ohsHHhhhhHHsho.', 9: '.ohssssssssssho.' },
  curtains: { 2: '.....oooooo.....', 3: '...oohhhhhhoo...', 4: '..ohhlhhhhhhho..', 5: '.ohhllhhhhhhhho.', 6: '.ohhlhhhhhhhhho.', 7: '.ohhhhhHHhhhhho.', 8: '.ohhhhHssHhhhho.', 9: '.oHhhHssssHhhHo.' },
  crop: { 2: '....oooooooo....', 3: '...ohhlhhhhhoo..', 4: '..ohhllhhhhhhho.', 5: '.ohhhhhhhhhhhho.', 6: '.ohhHhhhHhhhHho.', 7: '.oHhhhHhhhHhhho.', 8: '.ohHshhHsHhsHho.', 9: '.ohsssHssssHsho.' },
  // shaved sides with a strip standing up down the middle
  mohawk: {
    0: '......oooo......', 1: '.....ohhhho.....', 2: '....ohhhhhho....', 3: '...osshhhhsso...', 4: '..osssshhsssso..',
    ...rows(5, 6, '.osssshhhhsssso.'), 7: '.ossssshhssssso.', 8: '.o' + 's'.repeat(12) + 'o.',
  },
  afro: {
    0: '...oooooooooo...', 1: '..ohhhhhhhhhho..', 2: '.ohhlhhhhhhhhho.', 3: 'ohhllhhhhhhhhhho', ...rows(4, 7, 'o' + 'h'.repeat(14) + 'o'),
    8: 'ohHssssssssssHho', ...rows(9, 11, 'oh............ho'),
  },
  wavy: { 2: '.....oooooo.....', 3: '...oohhhhhhoo...', 4: '..ohhlhhhhhhho..', 5: '.ohhllhhhhhhhho.', 6: '.ohhhhhHhhhhhho.', 7: '.ohHhhHhhhHhhHo.', 8: 'ohHhsHhhhHshhHho', 9: 'ohhssssssssssHho', 10: 'oHh..........hHo', 11: 'ohH..........Hho', 12: 'oHh..........hHo', 13: '.oo..........oo.' },
  shaggy: { 1: '....o.oooo.o....', 2: '...ohohhhhohoo..', 3: '..ohhhhhhhhhhho.', 4: '.ohhlhhhhhhhhhho', 5: 'ohhllhhhhhhhhhho', 6: 'ohhhhhHhhHhhhhHo', 7: 'oHhhHhhHhhHhhHho', 8: '.oHHsHhHhHshHHo.', 9: '.oHssHsHssHssHo.', 10: 'oHh..........hHo', 11: '.oH..........Ho.', 12: '..o..........o..' },
  pixie: { 2: '.....oooooo.....', 3: '...oohhhhhhoo...', 4: '..ohhhhhhlhhho..', 5: '.ohhhhhhhllhhho.', 6: '.ohhhhhhhhhhhho.', 7: '.oHHhhhhhhhhhho.', 8: '.osHHHhhhhhhhho.', 9: '.osssHHHhhhHHho.' },
  emo: { 2: '.....oooooo.....', 3: '...oohhhhhhoo...', 4: '..ohhhhhhlhhho..', 5: '.ohhhhhhllhhhho.', 6: '.ohhhhhhhhhhhho.', 7: '.ohhhhhhhhhhhho.', 8: '.ohhhhhhhhHHsho.', 9: '.ohhhhhhHHsssho.', 10: '.ohhhhhH........', 11: '.ohhhhH.........' },
  bowl: { 2: '.....oooooo.....', 3: '...oohhhhhhoo...', 4: '..ohhlhhhhhhho..', 5: '.ohhllhhhhhhhho.', 6: '.ohhhhhhhhhhhho.', 7: '.ohhhhhhhhhhhho.', 8: '.ohhhhhhhhhhhho.', 9: '.oHHHHHHHHHHHHo.' },
  twintails: { 5: 'ho............oh', 6: 'ho............oh', 7: 'ho............oh', 8: 'hho..........ohh', 9: 'hho..........ohh', 10: 'Hho..........ohH', 11: 'Hho..........ohH', 12: 'oHo..........oHo', 13: '.o............o.' },
  halfup: { 0: '......ooo.......', 1: '.....ohlho......', 2: '.....oooooo.....', 3: '...oohhhhhhoo...', 4: '..ohhlhhhhhhho..', 5: '.ohhllhhhhhhhho.', 6: '.ohhhhhhhhhhhho.', 7: '.ohhHhhhhhhHhho.', 8: '.ohHsHhhhhHsHho.', 9: 'oh............ho', 10: 'oh............ho', 11: 'oh............ho', 12: 'oh............ho', 13: 'oh............ho', 14: '.o............o.' },
  manbun: { 0: '.......ooo......', 1: '......ohlho.....', 2: '.....ooHhHoo....', 3: '...oohhhhhhoo...', 4: '..ohhhlhhhhhho..', 5: '.ohhhllhhhhhhho.', 6: '.ohhhhhhhhhhhho.', 7: '.ohHhhhhhhhhHho.', 8: '.ohsHHhhhhHHsho.', 9: '.ohssssssssssho.' },
  wolf: { 1: '.....oooooo.....', 2: '...oohhhhhhoo...', 3: '..ohhhlhhhhhho..', 4: '.ohhhllhhhhhhho.', 5: '.ohhhhhhhhhhhho.', 6: 'ohhHhhhhHhhhHhho', 7: 'oHhhHhhHhhHhhhHo', 8: 'ohHhsHhHhhsHhHho', 9: 'oHhssHssssHsshHo', 10: 'oh............ho', 11: '.oh..........ho.', 12: '..o..........o..' },
  sidelong: { 2: '.....oooooo.....', 3: '...oohhhhhhoo...', 4: '..ohhhhhhhlhho..', 5: '.ohhhhhhhhllhho.', 6: '.ohhhhhhhhhhhho.', 7: '.ohhhhhhhhhhhho.', 8: '.ohhhhhhhHHHsho.', 9: '.ohhhhhHHssssho.', 10: 'oh............ho', 11: 'oh............ho', 12: 'oh............ho', 13: 'oh............ho', 14: 'oh............ho', 15: '.oo..........oo.' },
  braids: { 9: 'oh............ho', 10: 'oh............ho', 11: 'oh............ho', 12: 'oh............ho', 13: 'oho..........oho', 14: 'oHo..........oHo', 15: 'oho..........oho', 16: '.y............y.' },
};
// Short styles keep the hair off the cheeks: no long sideburns down the face.
const CROPPED = new Set(['short', 'side part', 'spiky', 'messy', 'undercut', 'quiff', 'fauxhawk', 'topknot', 'slick', 'curtains', 'crop', 'mohawk', 'bowl', 'manbun', 'pixie']);
const FACE_OVERLAY: Record<string, Overlay> = {
  happy: {},
  sleepy: { 10: '.oh' + 'ssssssssss' + 'ho.' },
  wink: { 10: '.oh' + 'swesssssss' + 'ho.' },
  grin: { 12: '.oh' + 'sbsmmmmsbs' + 'ho.' },
  // proper shades: a frame across, two lenses with a glint, and a smirk below
  cool: { 10: '.oheeeeeeeeeeho.', 11: '.oheweesseweeho.', 12: '.ohseesssseesho.', 13: '..oSssssmmssSo..' },
  surprised: { 9: '.oh' + 'seessssees' + 'ho.', 13: '..oSsssmmsssSo..' },
  // happy closed eyes (^ ^) and big rosy cheeks
  blush: { 10: '.ohssessssessho.', 11: '.ohsesessesesho.', 12: '.ohbbssmmssbbho.' },
  smirk: { 12: '.oh' + 'sbsssmmmbs' + 'ho.' },
  fierce: { 9: '.oh' + 'seessssees' + 'ho.', 12: '.oh' + 'sbsmmmmsbs' + 'ho.' },
  // a wink, a wide grin and the tongue poking out
  silly: { 10: '.ohswesssssssho.', 12: '.ohsbsmmmmsbsho.', 13: '..oSssssbbssSo..' },
  calm: { 12: '.ohssssmmssssho.' },
  laugh: { 10: '.ohssessssessho.', 11: '.ohsesessesesho.', 12: '.ohbbsmmmmsbbho.', 13: '..oSssmmmmssSo..' },
  sad: { 12: '.ohssssssssssho.', 13: '..oSssmssmssSo..' },
  cry: { 12: '.ohsqssssssqsho.', 13: '..oSqsmssmsqSo..' },
  angry: { 9: '.ohseeesseeesho.', 12: '.ohssssssssssho.', 13: '..oSssmmmmssSo..' },
  shy: { 10: '.ohsewssssewsho.', 12: '.ohbbssmsssbbho.' },
  pout: { 12: '.ohsbssssssbsho.', 13: '..oSssssmsssSo..' },
  starry: { 10: '.ohsyessssyesho.', 12: '.ohsbsmmmmsbsho.' },
};
const OUTFIT_OVERLAY: Record<string, Overlay> = {
  tee: {},
  tie: { 14: '..o' + 'tttcrrcttt' + 'o..', 15: '.os' + 'ttttrrtttt' + 'so.', 16: '.os' + 'TtttrrtttT' + 'so.' },
  sweater: { 15: '.ot' + 'cccccccccc' + 'to.', 16: '.ot' + 'TttttttttT' + 'to.' },
  jacket: { 15: '.os' + 'tttTccTttt' + 'so.', 16: '.os' + 'TttTccTttT' + 'so.', 17: '..oTTTTccTTTTo..' },
  skirt: { 17: '.oTTToTTTToTTTo.', 18: 'oTTTToTTTToTTTTo' },
  dress: { 17: '.o' + 't'.repeat(12) + 'o.', 18: 'o' + 'T'.repeat(14) + 'o' },
  hoodie: { 14: '..o' + 'tttcttcttt' + 'o..', 15: '.ot' + 'tttcttcttt' + 'to.', 16: '.ot' + 'tTTTTTTTTt' + 'to.' },
  striped: { 14: '..otttccccttto..', 15: '.osccccccccccso.', 16: '.osttttttttttso.', 17: '..occcccccccco..' },
  vest: { 14: '..otttccccttto..', 15: '.osTTTccccTTTso.', 16: '.osTTTcyccTTTso.', 17: '..oTTTTccTTTTo..' },
  tank: { 14: '..ossttttttsso..', 15: '.osttttttttttso.', 16: '.osttttttttttso.', 17: '..oTTTTTTTTTTo..' },
  kimono: { 14: '..otttcsscttto..', 15: '.osttttcTTTTTso.', 16: '.osyyyyyyyyyyso.', 17: '..ottttTTTTTTo..' },
  polo: { 14: '..ottccttcctto..', 15: '.osttttccttttso.', 16: '.osttttccttttso.', 17: '..oTTTTTTTTTTo..' },
  suit: { 14: '..okkkcrrckkko..', 15: '.oskkkcrrckkkso.', 16: '.oskkkkcckkkkso.', 17: '..okkkkkkkkkko..' },
  cardigan: { 14: '..otttccccttto..', 15: '.ostttyccytttso.', 16: '.ostttcccctttso.', 17: '..oTTTccccTTTo..' },
  apron: { 14: '..otttccccttto..', 15: '.osttccccccttso.', 16: '.osttccrrccttso.', 17: '..oTTccccccTTo..' },
  raincoat: { 14: '..oyyyccccyyyo..', 15: '.osyyyyykyyyyso.', 16: '.osyyyyykyyyyso.', 17: '..oyyyyyyyyyyo..' },
  sailor: { 14: '..oVVVccccVVVo..', 15: '.ostVVcrrcVVtso.', 16: '.osttttrrttttso.', 17: '..oTTTTTTTTTTo..' },
  hawaiian: { 14: '..otttccccttto..', 15: '.ostyttgttyttso.', 16: '.osttgttyttgtso.', 17: '..oTTTTTTTTTTo..' },
  puffer: { 14: '..otttTTTTttto..', 15: '.osttttttttttso.', 16: '.osTTTTTTTTTTso.', 17: '..otttttttttto..' },
  overalls: { 15: '.os' + 'tvttttttvt' + 'so.', 16: '.os' + 'vvvvvvvvvv' + 'so.', 17: '..o' + 'VVVVVVVVVV' + 'o..' },
  flannel: { 14: '..otTtccctTto...', 15: '.osTtTttTtTtTso.', 16: '.ostTtTTtTtTtso.', 17: '..oTtTtTtTtTto..' },
  varsity: { 14: '..occtccccctcco.', 15: '.occtttcctttcco.', 16: '.occttttttttcco.', 17: '..occcccccccco..' },
  denim: { 14: '..ovvvccccvvvo..', 15: '.osvvvttttvvvso.', 16: '.osvvvttttvvvso.', 17: '..oVVVttttVVVo..' },
  turtleneck: { 13: '....oTTTTTTo....', 14: '..otttTTTTttto..', 15: '.osttttttttttso.', 16: '.osttttttttttso.', 17: '..oTTTTTTTTTTo..' },
};
// Accessories go on top of everything; hats, headphones and ears also show from behind. a = the accessory's colour.
const ACC_OVERLAY: Record<string, Overlay> = {
  glasses: { 10: '...kwekkkkwek...', 11: '...keeksskeek...' },
  round: { 9: '....kk....kk....', 10: '...kwek..kwek...', 11: '...keekkkkeek...' },
  shades: { 10: '..kkkkkkkkkkkk..', 11: '...kwkk..kwkk...' },
  bandage: { 11: '..........c.....', 12: '.........cbc....', 13: '..........c.....' },
  mask: { 11: '..c..........c..', 12: '..cccccccccccc..', 13: '...cccccccccc...' },
  earring: { 13: '.y..............', 14: '.y..............' },
  headphones: { 2: '....oaaaaaao....', 3: '...oa......ao...', 4: '..oa........ao..', 5: '.oa..........ao.', 6: '.oa..........ao.', 7: '.oa..........ao.', 8: '.oa..........ao.', 9: 'oaao........oaao', 10: 'oAbo........obAo', 11: 'oaao........oaao' },
  cap: { 2: '.....oooooo.....', 3: '...ooaaaaaaoo...', 4: '..oaaaaaaaaaao..', 5: '.oaalaaaaaaaaao.', 6: '.oaaaaaaaaaaaao.', 7: '.oAAAAAAAAAAAAo.', 8: 'oAAAAAAAAAAAAAo.' },
  beanie: { 0: '......owwo......', 1: '.....owwwwo.....', 2: '....ooaaaaoo....', 3: '...oaaaaaaaao...', 4: '..oaaaaaaaaaao..', 5: '.oaaaaaaaaaaaao.', 6: '.oaaaaaaaaaaaao.', 7: '.oAaAaAaAaAaAAo.', 8: '.oAAAAAAAAAAAAo.' },
  catears: { 0: '...o........o...', 1: '..oao......oao..', 2: '..oabo....obao..' },
};
const ACC_BACK = new Set(['headphones', 'cap', 'beanie', 'catears']);
const ACC_COL: Record<string, string> = { glasses: '#3a3448', round: '#b07a4e', shades: '#2b2530', headphones: '#e8e3dc', cap: '#e06a5a', beanie: '#5a5070', catears: '#3a3448', bandage: '#f2d8c0', mask: '#fffaf3', earring: '#ffd34d' };
// Body types reshape the torso a pixel at a time, so they work with every outfit.
const edges = (row: string) => [row.search(/[^.]/), row.length - 1 - [...row].reverse().join('').search(/[^.]/)];
function widen(row: string) {
  const s = [...row], [i, j] = edges(row);
  if (i < 0) return row;
  if (i > 0) { s[i - 1] = 'o'; s[i] = row[i + 1]; }
  if (j < 15) { s[j + 1] = 'o'; s[j] = row[j - 1]; }
  return s.join('');
}
function narrow(row: string) {
  const s = [...row], [i, j] = edges(row);
  if (i < 0) return row;
  s[i] = '.'; s[i + 1] = 'o'; s[j] = '.'; s[j - 1] = 'o';
  return s.join('');
}
const BODY_SHAPE: Record<string, Record<number, (row: string) => string>> = {
  lean: { 16: narrow, 17: narrow }, athletic: { 14: widen, 15: widen }, chubby: { 15: widen, 16: widen, 17: widen },
};

for (const rows of [HEAD_FRONT, HEAD_BACK, BODY_FRONT, BODY_BACK, ...LEGS,
  ...[STYLE_OVERLAY, FACE_OVERLAY, OUTFIT_OVERLAY, ACC_OVERLAY].flatMap((o) => Object.values(o).map((m) => Object.values(m)))]) {
  console.assert(rows.every((row) => row.length === 16), 'sprite rows must be 16 wide', rows);
}

function avatarRows(look: Look, step: number, up: boolean) {
  let rows = [BLANK, BLANK, ...(up ? HEAD_BACK : HEAD_FRONT), ...(up ? BODY_BACK : BODY_FRONT), ...LEGS[step]];
  const style = STYLE_OVERLAY[look.style ?? ''];
  const shaved = look.style === 'buzz' || look.style === 'mohawk' || look.style === 'undercut';
  const backStyle = style && up && !shaved ? Object.fromEntries(Object.entries(style).filter(([y]) => Number(y) < 8)) : style;
  const layers = [OUTFIT_OVERLAY[look.outfit ?? ''], backStyle, up ? null : FACE_OVERLAY[look.face ?? '']];
  for (const over of layers) {
    if (!over) continue;
    rows = rows.map((row, y) => (over[y] ? [...row].map((ch, x) => (over[y][x] !== '.' ? over[y][x] : ch)).join('') : row));
  }
  if (!up && CROPPED.has(look.style ?? 'short')) rows = rows.map((row, y) => (y >= 9 && y <= 12 ? `${row.slice(0, 2)}s${row.slice(3, 13)}s${row.slice(14)}` : row));
  const acc = ACC_OVERLAY[look.acc ?? ''];
  if (acc && (!up || ACC_BACK.has(look.acc!))) rows = rows.map((row, y) => (acc[y] ? [...row].map((ch, x) => (acc[y][x] !== '.' ? acc[y][x] : ch)).join('') : row));
  const shape = BODY_SHAPE[look.body ?? ''];
  if (shape) rows = rows.map((row, y) => shape[y]?.(row) ?? row);
  return rows;
}

// x, y = top-left of the tile the avatar stands on; the sprite overhangs the tile above.
const lookPal = (look: Look): Record<string, string> => {
  const acc = ACC_COL[look.acc ?? ''] ?? '#5a5070';
  return {
    o: OUT, h: look.hair, H: shade(look.hair, -0.15), l: shade(look.hair, 0.2),
    s: look.skin, S: shade(look.skin, -0.1), e: '#2a1e26', w: '#ffffff', b: '#f7a0a8', m: '#c8606a', q: '#7fc4f0',
    t: look.shirt, T: shade(look.shirt, -0.15), c: '#fff4e6', d: '#7a5040', a: acc, A: shade(acc, -0.15),
    v: '#6a8ad0', V: '#5a78bc', r: '#e06a5a', y: '#ffd34d', k: '#3a3448', g: '#8fd0a8', p: look.outfit === 'overalls' ? '#5a78bc' : '#5a5080',
  };
};
export function drawAvatar(c: Ctx, look: Look, x: number, y: number, step: number, up: boolean) {
  const key = `av|${Object.values(look).join()}|${step}${up}`;
  const sprite = baked(key, 16, AVATAR_H, (g) => paintRows(g, avatarRows(look, step, up), lookPal(look)));
  r(c, x + 4, y + 14, 8, 2, 'rgba(58,38,51,0.22)');
  r(c, x + 3, y + 15, 10, 1, 'rgba(58,38,51,0.12)');
  c.drawImage(sprite, x, y + T - AVATAR_H + (step ? -1 : 0) + 1);
}

// Chairs face us: backrest drawn behind the sitter, seat and legs in front.
type ChairPart = (c: Ctx, x: number, y: number, col: string) => void;
const CHAIRS: Record<string, { col: string; back: ChairPart; seat: ChairPart }> = {
  chair: {
    col: '#f2b48a',
    back(c, x, y, col) {
      box(c, x + 3, y - 6, 10, 11, col);
      r(c, x + 5, y - 4, 6, 1, shade(col, 0.12));
      heart(c, x + 8, y - 2, '#f48a9a');
    },
    seat(c, x, y, col) {
      box(c, x + 3, y + 8, 3, 8, '#9a6440');
      box(c, x + 10, y + 8, 3, 8, '#9a6440');
      box(c, x + 2, y + 4, 12, 6, shade(col, -0.06));
    },
  },
  officeChair: {
    col: '#9db4ee',
    back(c, x, y, col) {
      box(c, x + 3, y - 7, 10, 12, col);
      r(c, x + 5, y - 5, 6, 1, shade(col, 0.12));
    },
    seat(c, x, y, col) {
      r(c, x + 7, y + 9, 2, 4, '#5a5070');
      r(c, x + 3, y + 13, 10, 1, '#5a5070');
      for (const wx of [2, 7, 12]) r(c, x + wx, y + 14, 2, 2, OUT);
      box(c, x + 2, y + 4, 12, 6, shade(col, -0.08));
      box(c, x, y + 1, 3, 6, '#5a5070');
      box(c, x + 13, y + 1, 3, 6, '#5a5070');
    },
  },
  gamingChair: {
    col: '#f48a8a',
    back(c, x, y, col) {
      box(c, x + 2, y - 11, 12, 16, '#3a3448');
      r(c, x + 4, y - 9, 2, 12, col);
      r(c, x + 10, y - 9, 2, 12, col);
      box(c, x + 5, y - 10, 6, 3, shade(col, 0.1));
    },
    seat(c, x, y, col) {
      r(c, x + 7, y + 9, 2, 4, '#3a3448');
      r(c, x + 2, y + 13, 12, 1, '#3a3448');
      for (const wx of [1, 7, 13]) r(c, x + wx, y + 14, 2, 2, OUT);
      box(c, x + 2, y + 4, 12, 6, '#3a3448');
      r(c, x + 4, y + 5, 8, 1, col);
      box(c, x, y, 3, 7, col);
      box(c, x + 13, y, 3, 7, col);
    },
  },
};

// Head and body only, for poses where something hides the legs.
function seatedSprite(look: Look) {
  return baked(`sit|${Object.values(look).join()}`, 16, 18, (g) =>
    paintRows(g, avatarRows(look, 0, false).slice(0, 18), lookPal(look)));
}

// Seated in a chair facing us: gentle bob, and sparkles drifting up while studying.
export function drawSeated(c: Ctx, look: Look, x: number, y: number, t: number, chairCol?: string, kind = 'chair', sparkle = true) {
  const ch = CHAIRS[kind] ?? CHAIRS.chair, col = chairCol ?? ch.col;
  ch.back(c, x, y, col);
  c.drawImage(seatedSprite(look), x, y - 13 + (Math.floor(t / 650) % 2));
  ch.seat(c, x, y, col);
  if (!sparkle) return;
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

// Default colours of the seats, for the cushion drawn over the sitter's lap.
const SEAT_COL: Record<string, string> = { sofa: '#9db4ee', armchair: '#f2b48a', beanbag: '#f4a6b8' };
const PANTS = '#5a5080';

// A character using a piece of furniture: x, y = top-left of the furniture tile they are on.
// The furniture itself is drawn first, except chairs, which wrap around the sitter.
export function drawActing(c: Ctx, look: Look, act: string, item: string, x: number, y: number, t: number, col?: string, studying = false) {
  if (CHAIRS[item]) return drawSeated(c, look, x, y, t, col, item, studying);
  const beat = Math.floor(t / 260) % 2;
  if (act === 'sleep') {
    // Tucked in: head on the pillow, blanket up to the chin, z's drifting up.
    c.drawImage(seatedSprite(look), 0, 0, 16, 14, x, y - 3, 16, 14);
    box(c, x, y + 9, 16, 9, col ?? '#9cc4f0');
    r(c, x + 1, y + 9, 14, 2, '#fffaf3');
    const p = (t / 1600) % 1;
    c.globalAlpha = 1 - p;
    const zx = Math.round(x + 12 + p * 4), zy = Math.round(y - 6 - p * 8);
    r(c, zx, zy, 3, 1, '#fffaf3'); r(c, zx + 1, zy + 1, 1, 1, '#fffaf3'); r(c, zx, zy + 2, 3, 1, '#fffaf3');
    c.globalAlpha = 1;
    return;
  }
  if (act === 'sit') {
    c.drawImage(seatedSprite(look), x, y - 11 + (Math.floor(t / 900) % 2));
    box(c, x + 1, y + 4, 14, 7, shade(col ?? SEAT_COL[item] ?? '#f2b48a', -0.1));
    return;
  }
  if (act === 'bounce') {
    const b = Math.round(Math.abs(Math.sin(t / 170)) * 4);
    r(c, x + 4, y + 2 - b, 3, 4, PANTS);
    r(c, x + 9, y + 2 - b, 3, 4, PANTS);
    c.drawImage(seatedSprite(look), x, y - 15 - b);
  } else if (act === 'bike') {
    c.drawImage(seatedSprite(look), x, y - 14 + beat);
    r(c, x + 4, y + 3 + beat * 2, 3, 4, PANTS);
    r(c, x + 9, y + 5 - beat * 2, 3, 4, PANTS);
  } else if (act === 'stretch') {
    drawAvatar(c, look, x, y - 2 + (Math.floor(t / 500) % 2) * 3, 0, false);
  } else if (act === 'run') {
    drawAvatar(c, look, x, y - 3, 1 + (Math.floor(t / 110) % 2), false);
  } else if (act === 'lift') {
    drawAvatar(c, look, x, y - 2, 0, false);
    const dy = beat ? -14 : -6;
    for (const dx of [-2, 13]) {
      r(c, x + dx, y + dy + 1, 5, 1, '#5a5070');
      box(c, x + dx - 1, y + dy - 1, 2, 4, col ?? '#f48a8a');
      box(c, x + dx + 4, y + dy - 1, 2, 4, col ?? '#f48a8a');
    }
  } else if (act === 'punch') {
    drawAvatar(c, look, x + 5 - beat * 2, y + 1, 0, true);
    if (beat) { r(c, x + 2, y - 8, 2, 1, '#fff3b0'); r(c, x + 1, y - 10, 1, 1, '#fff3b0'); }
  }
  r(c, x + 15, y - 14 + (Math.floor(t / 120) % 5), 1, 2, '#a8dcf5'); // working up a sweat
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
    } else if (style === 'marble') {
      // Polished slabs with a soft vein running across.
      r(g, 0, 0, T, T, shade(color, 0.12));
      for (let i = 0; i < T; i++) r(g, i, (3 + v * 6 + Math.floor(i / 2)) % T, 1, 1, shade(color, -0.06));
      r(g, 0, 15, T, 1, shade(color, -0.04));
      r(g, 15, 0, 1, T, shade(color, -0.04));
    } else if (style === 'parquet') {
      // Basket weave: four squares of three slats, alternating direction.
      for (let q = 0; q < 4; q++) {
        const qx = (q % 2) * 8, qy = Math.floor(q / 2) * 8, across = (q === 0 || q === 3);
        r(g, qx, qy, 8, 8, shade(color, q % 3 ? 0.04 : -0.02));
        for (const k of [2, 5, 7]) across ? r(g, qx, qy + k, 8, 1, line) : r(g, qx + k, qy, 1, 8, line);
      }
    } else if (style === 'stone') {
      // Flagstones of two sizes, with a few speckles.
      r(g, 0, 7, T, 1, line);
      r(g, 0, 15, T, 1, line);
      r(g, v ? 5 : 10, 0, 1, 7, line);
      r(g, v ? 12 : 3, 8, 1, 7, line);
      for (const [a, b] of [[2, 2], [8, 4], [13, 10], [6, 12]]) r(g, (a + v * 4) % 16, b, 1, 1, shade(color, (a + b) % 2 ? 0.08 : -0.08));
    } else if (style === 'checker') {
      // Bold two-colour squares, a tile each.
      if ((tx + ty) % 2) r(g, 0, 0, T, T, shade(color, -0.22));
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
    // Little five-point stars, darker than the paper so they read, with a twinkle between.
    const star = shade(paper, -0.18);
    for (const [a, b] of [[4, 5], [11, 9]]) if (b + 2 < h) {
      r(g, a, b - 2, 1, 1, star); r(g, a - 1, b - 1, 3, 1, star); r(g, a - 2, b, 5, 1, star);
      r(g, a - 1, b + 1, 3, 1, star); r(g, a - 1, b + 2, 1, 1, star); r(g, a + 1, b + 2, 1, 1, star);
      r(g, a, b, 1, 1, '#fffaf3');
    }
    if (14 < h) r(g, 13, 14, 1, 1, star);
    r(g, 1, 9, 1, 1, light);
  }
  else if (pattern === 'flowers') {
    for (const [a, b] of [[4, 4], [12, 10]]) if (b + 1 < h) {
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) r(g, a + dx, b + dy, 1, 1, shade(paper, -0.16));
      r(g, a, b, 1, 1, '#fffaf3');
    }
  }
  else if (pattern === 'waves') { for (const yy of [3, 11]) for (let x = 0; x < T; x++) { const b = yy + [0, 1, 2, 1][x % 4]; if (b < h) r(g, x, b, 1, 1, ink); } }
  else if (pattern === 'diamonds') { for (let yy = 0; yy < h; yy++) for (let x = 0; x < T; x++) if ((x + yy) % 8 === 0 || (x - yy + 16) % 8 === 0) r(g, x, yy, 1, 1, light); }
  else if (pattern === 'brick') {
    for (let k = 0; k * 4 < h; k++) {
      r(g, 0, k * 4 + 3, T, 1, ink);
      for (const bx of [0, 8]) r(g, (k % 2) * 4 + bx, k * 4, 1, Math.min(3, h - k * 4), ink);
    }
  }
  else if (pattern === 'grid') { for (let yy = 7; yy < h; yy += 8) r(g, 0, yy, T, 1, ink); r(g, 7, 0, 1, h, ink); r(g, 15, 0, 1, h, ink); }
}

// A 2x2 preview of a floor style or wall pattern in some colour, for Decorate's pickers.
const tileURLs = new Map<string, string>();
export function tileURL(kind: 'floor' | 'wall', color: string, style: string) {
  const key = `${kind}|${color}|${style}`;
  let url = tileURLs.get(key);
  if (!url) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 2 * T;
    const g = cv.getContext('2d')!;
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      if (kind === 'floor') { drawFloor(g, x * T, y * T, color, x, y, style); continue; }
      g.save();
      g.translate(x * T, y * T);
      paintPattern(g, color, style, T);
      g.restore();
    }
    url = cv.toDataURL();
    tileURLs.set(key, url);
  }
  return url;
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

// A 2x2-tile window with curtains (drawn shut when closed), filling the tall back wall above the panel strip.
export function drawWindow(c: Ctx, x: number, y: number, sky: Sky, closed = false) {
  c.drawImage(baked(`win|${sky}|${closed}`, 32, 32, (g) => {
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
    if (closed) for (const cx of [3, 16]) {
      r(g, cx, 5, 13, 19, '#f4a6b8');
      for (let k = cx + 2; k < cx + 13; k += 3) { r(g, k, 5, 1, 19, '#e88aa0'); r(g, k + 1, 5, 1, 19, '#fbc4d0'); }
      r(g, cx, 24, 13, 1, OUT);
    }
    else for (const cx of [3, 23]) {
      r(g, cx, 5, 6, 19, '#f4a6b8');
      r(g, cx + 2, 5, 1, 19, '#e88aa0');
      r(g, cx + 4, 5, 1, 19, '#fbc4d0');
      r(g, cx, 24, 6, 1, OUT);
    }
    r(g, 4, 22, 24, 2, '#fffaf3');
    r(g, 4, 24, 24, 1, shade('#fffaf3', -0.15));
  }), x, y);
}

// A little water drop over a thirsty plant; x = its centre, y = its bottom.
export function drawDroplet(c: Ctx, x: number, y: number) {
  x = Math.round(x) - 3;
  r(c, x + 2, y - 7, 2, 1, OUT); r(c, x + 1, y - 6, 4, 1, OUT); r(c, x, y - 5, 6, 4, OUT); r(c, x + 1, y - 1, 4, 1, OUT);
  r(c, x + 2, y - 6, 2, 1, '#6fb6f0'); r(c, x + 1, y - 5, 4, 4, '#6fb6f0'); r(c, x + 2, y - 4, 1, 2, '#dff0ff');
}

// A little heart, e.g. over a pet that was just fed; x = its centre, y = its bottom.
export function drawHeart(c: Ctx, x: number, y: number) {
  x = Math.round(x) - 4; y = Math.round(y);
  r(c, x + 1, y - 8, 2, 1, OUT); r(c, x + 5, y - 8, 2, 1, OUT); r(c, x, y - 7, 8, 3, OUT); r(c, x + 1, y - 4, 6, 1, OUT); r(c, x + 2, y - 3, 4, 1, OUT); r(c, x + 3, y - 2, 2, 1, OUT);
  r(c, x + 1, y - 7, 2, 1, '#f06a8a'); r(c, x + 5, y - 7, 2, 1, '#f06a8a'); r(c, x + 1, y - 6, 6, 2, '#f06a8a'); r(c, x + 2, y - 4, 4, 1, '#f06a8a'); r(c, x + 3, y - 3, 2, 1, '#f06a8a');
  r(c, x + 1, y - 7, 1, 1, '#ffd0dc');
}

// Night tint over a tile: deep blue at night, a softer violet at dusk.
export const NIGHT_TINT: Record<Sky, string> = { day: '', dusk: 'rgba(90,60,120,0.16)', night: 'rgba(20,24,70,0.42)' };

// Warm light added on top of the night tint ('lighter' blending brightens what is underneath).
export function drawGlow(c: Ctx, x: number, y: number, rad: number, alpha: number) {
  const g = c.createRadialGradient(x, y, 1, x, y, rad);
  g.addColorStop(0, `rgba(255,214,140,${alpha})`);
  g.addColorStop(1, 'rgba(255,214,140,0)');
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = g;
  c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  c.restore();
}

// Little gooseneck lamp switched on during late study sessions; x, y = where its base sits.
export function drawDeskLamp(c: Ctx, x: number, y: number) {
  box(c, x, y - 2, 6, 3, '#7a6a8a');
  r(c, x + 2, y - 8, 1, 6, OUT);
  r(c, x + 3, y - 9, 3, 1, OUT);
  box(c, x + 4, y - 11, 6, 4, '#ffd27a');
  r(c, x + 5, y - 7, 4, 1, '#fff3b0');
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
  desk: 6, chair: 6, plant: 8, lamp: 12, rug: 0, bookshelf: 16, bed: 26, sofa: 8, aquarium: 14,
  books: 2, cactus: 8, sunflower: 12, globe: 8, beanbag: 0, roundRug: 0, coffeeTable: 2, armchair: 6, plush: 2,
  mirror: 14, recordPlayer: 4, guitar: 12, cello: 14, easel: 14, bonsai: 4, wardrobe: 18, piano: 12,
  workTable: 6, pcDesk: 14, gamingDesk: 12, officeChair: 7, gamingChair: 11, miniFridge: 6,
  coffee: 0, energyCan: 0, soda: 0, wine: 1, gymBall: 0, dumbbells: 4, punchingBag: 16, exerciseBike: 9, treadmill: 12,
  petBall: 0, petBed: 0, doghouse: 10, catTower: 14,
  counter: 8, sink: 6, stove: 10, fridge: 16, diningTable: 9, barStool: 2, microwave: 0, teapot: 0, fruitBowl: 0, cake: 0,
  bathtub: 6, toilet: 8, vanity: 14, towelRack: 10, nightstand: 4, dresser: 6, clothesRack: 14,
  tv: 14, fireplace: 20, floorCushion: 0, standingFan: 12, grandClock: 20, sideTable: 2,
  arcade: 18, gameConsole: 0, speaker: 10, drumKit: 10, synth: 8, djDeck: 6, telescope: 14, poolTable: 6, foosball: 8, trampoline: 0,
  palm: 16, tulips: 10, fig: 16, terrarium: 0, succulent: 0, pumpkin: 0, christmasTree: 21, snowman: 12, giftBox: 0,
};
// How far a tabletop item is lifted when it stands on one of these.
export const SURFACE: Record<string, number> = { desk: 9, workTable: 9, pcDesk: 9, gamingDesk: 9, coffeeTable: 7, miniFridge: 19, counter: 10, sideTable: 7, diningTable: 9, nightstand: 10, dresser: 10, island: 13, consoleTable: 11, standingDesk: 13 };

// col is the owner's chosen colour (undefined = the item's own default).
// bare: tiles of a desk with something placed on them (bit 1 = left, 2 = right); its built-in clutter there isn't drawn.
type Draw = (c: Ctx, x: number, y: number, t: number, col?: string, bare?: number) => void;
// Pixel maps for the instruments: one character per art pixel, '.' is empty (palettes below).
const GUITAR_ROWS = [
  '......oooo......',
  '.....ohhhho.....',
  '....gohhhhog....',
  '.....ohhhho.....',
  '....gohhhhog....',
  '.....oohhoo.....',
  '......onno......',
  '......onno......',
  '......ommo......',
  '......onno......',
  '......onno......',
  '......ommo......',
  '....ooonnooo....',
  '...oLLLnnbbbo...',
  '..oLLLLnnbbbbo..',
  '..oLLLLnnbbbbo..',
  '..oLLLoSSobbbo..',
  '..oLLLSSSSbbbo..',
  '..oLLLoSSobbbo..',
  '...oLLLwwbbbo...',
  '...oLLLwwbbdo...',
  '..oLLLbwwbbbdo..',
  '.oLLLbbwwbbbbdo.',
  '.oLLbBBBBBBbbdo.',
  '.oLbbbbbbbbbbdo.',
  '.obbbbbbbbbbddo.',
  '..obbbbbbbbddo..',
  '...oooooooooo...',
];
const ELECTRIC_ROWS = [
  '.......ooo......',
  '......oRRRo.....',
  '.....goRRo......',
  '......oRRog.....',
  '.....goRRo......',
  '......oRRog.....',
  '......onno......',
  '......onno......',
  '......ommo......',
  '......onno......',
  '......onno......',
  '......ommo......',
  '..oo..onno..oo..',
  '..oRo.onno.oRo..',
  '..oRRoRnnRoRRo..',
  '..oRRRRnnRRRRo..',
  '..oRRRRnnRRRRo..',
  '..oRRRppppRRRo..',
  '..oRRRRwwRRRRo..',
  '...oRRRwwRRRo...',
  '..oRRRRwwRRRRo..',
  '.oRRRRppppRRRRo.',
  '.oRRRRRwwRRRRDo.',
  '.oRRRRBBBBRRRDo.',
  '.oRRRRRRRRRRRDo.',
  '..oRRRRRRRRRDo..',
  '...oRRRRRRRDo...',
  '....oooooooo....',
];
const CELLO_ROWS = [
  '................',
  '.....oooo.....v.',
  '....ohhhho....v.',
  '....oohhoo....v.',
  '...gohhhhog...v.',
  '....oohhoo....v.',
  '.....onno.....v.',
  '.....onno.....v.',
  '.....onno.....v.',
  '.....onno.....v.',
  '.....onno.....v.',
  '....oonnoo....v.',
  '...obbnnbbo...v.',
  '..obbbnnbbbo..v.',
  '..oLbbnnbbdo..v.',
  '..oLbbnnbbdo..v.',
  '...oLbwwbdo...v.',
  '...oLbwwbdo...v.',
  '..oLbbwwbbdo..v.',
  '.oLbfbwwbfbdo.v.',
  '.oLbfbwwbfbdo.v.',
  '.oLbbBBBBbbdo.v.',
  '.oLbbbTTbbbdo.h.',
  '.oLbbbTTbbbdo.h.',
  '.obbbbbbbbbdo.v.',
  '..obbbbbbbdo....',
  '...oooooooo.....',
  '......oo........',
  '......oo........',
  '................',
];
const UPRIGHT_ROWS = [
  '.oooooooooooooooooooooooooooooo.',
  'oLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLo',
  'oWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWo',
  'oDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDo',
  '.oWWWWWWWWWWWWWWWWWWWWWWWWWWWWo.',
  '.oWWgggWWWWWWWWWWWWWWWWWWgggWWo.',
  '.oWgWWWgWWWWMMMMMMMMWWWWgWWWgWo.',
  '.oWgWWWWWWWWMNMNMNMMWWWWWWWWgWo.',
  '.oWWgggWWWWWMMMMMMMMWWWWWgggWWo.',
  '.oDDDDDDDDDDDDDDDDDDDDDDDDDDDDo.',
  'oLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLo',
  'oKkKkKKkKkKkKKkKkKKkKkKKkKkKkKKo',
  'oKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKo',
  'oDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDo',
  '.oWWWWWWWWWWWWWWWWWWWWWWWWWWWWo.',
  '.oWddddddddddddWWddddddddddddWo.',
  '.oWdWWWWWWWWWWdWWdWWWWWWWWWWdWo.',
  '.oWdWWWWWWWWWWdWWdWWWWWWWWWWdWo.',
  '.oWddddddddddddWWddddddddddddWo.',
  '.oWWWWWWWWWWWWWWWWWWWWWWWWWWWWo.',
  '.oWWWWWWWWWWoPPPPPPoWWWWWWWWWWo.',
  '.oDDDDDDDDDDooooooooDDDDDDDDDDo.',
  'oWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWo',
  'oDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDo',
  '.oooooooooooooooooooooooooooooo.',
  '.oWDo......................oWDo.',
  '..oo........................oo..',
  '................................',
];
const GRAND_ROWS = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '.......................oooo.....',
  '...................ooooLLLLo....',
  '...............ooooLLLLLLLLo....',
  '...........ooooLLLLLLLLLLLLo....',
  '.......ooooLLLLLLLLLLLLLLLLo....',
  '......oDDDDDDDDDDDDDDDDDDDDo....',
  '......oGsGGGGGGGGGGGGGGGGGGGo...',
  '.oooooGsGGGGGGGGGGGGGGGGGGGGGoo.',
  'oKKKKoWWWWWWWWWWWWWWWWWWWWWWWWWo',
  'okkkkoWWWWWWWWWWWWWWWWWWWWWWWWWo',
  'oKKKKoWWWWWWWWWWWWWWWWWWWWWWWWDo',
  'oDDDDoDDDDDDDDDDDDDDDDDDDDDDDDDo',
  '.oooooooooooooooooooooooooooooo.',
  '..oWo......oo...........oWo.oWo.',
  '..oWo......oo...........oWo.oWo.',
  '..oWo......oo...........oWo.oWo.',
  '..oWo......oo...........oWo.oWo.',
  '..oWo.....oPPo..........oWo.oWo.',
  '..oPo...................oPo.oPo.',
  '..ooo...................ooo.ooo.',
  '................................',
];
const STRINGED: Record<string, string> = { o: OUT, h: '#5a3620', g: '#e8b43c', n: '#3a3448', m: '#a8a0b8', w: '#fff4e6' };
const keysPal = (col: string): Record<string, string> => ({
  o: OUT, W: col, L: shade(col, 0.12), D: shade(col, -0.18), K: '#fffaf3', k: '#2b2530', P: '#e8b43c',
});

const DRAW: Record<string, Draw> = {
  desk(c, x, y, t, col = '#d9a06a', bare = 0) {
    const Y = y - 6;
    box(c, x + 2, Y + 14, 4, 8, shade(col, -0.2));
    box(c, x + 26, Y + 14, 4, 8, shade(col, -0.2));
    box(c, x, Y + 6, 32, 12, col);
    r(c, x + 1, Y + 14, 30, 3, shade(col, -0.12));
    r(c, x + 14, Y + 15, 4, 1, '#ffe0a8');
    if (!(bare & 1)) {
      box(c, x + 5, Y, 13, 9, '#6a6488');
      // Laptop seen from the front of the desk: we see the lid, the sitter sees the screen.
      r(c, x + 6, Y + 1, 11, 6, '#8a84a8');
      r(c, x + 6, Y + 1, 11, 1, '#a49ec0');
      heart(c, x + 11, Y + 2, '#f4b6c8');
      box(c, x + 4, Y + 8, 15, 4, '#d8d4e8');
    }
    if (bare & 2) return;
    box(c, x + 21, Y + 5, 5, 6, '#fff4e6');
    r(c, x + 22, Y + 6, 3, 1, '#9a6440');
    r(c, x + 26, Y + 7, 1, 2, OUT);
    const s = Math.floor(t / 450) % 2;
    r(c, x + 22 + s, Y + 2, 1, 2, 'rgba(255,255,255,0.75)');
    r(c, x + 24 - s, Y + 1, 1, 2, 'rgba(255,255,255,0.6)');
    box(c, x + 27, Y + 9, 4, 3, '#f48a8a');
    box(c, x + 27, Y + 7, 4, 3, '#8fd0a8');
  },
  chair(c, x, y, _t, col = CHAIRS.chair.col) { CHAIRS.chair.back(c, x, y, col); CHAIRS.chair.seat(c, x, y, col); },
  officeChair(c, x, y, _t, col = CHAIRS.officeChair.col) { CHAIRS.officeChair.back(c, x, y, col); CHAIRS.officeChair.seat(c, x, y, col); },
  gamingChair(c, x, y, _t, col = CHAIRS.gamingChair.col) { CHAIRS.gamingChair.back(c, x, y, col); CHAIRS.gamingChair.seat(c, x, y, col); },
  workTable(c, x, y, _t, col = '#f0d2a8', bare = 0) {
    const Y = y - 6;
    box(c, x + 2, Y + 12, 3, 10, shade(col, -0.2));
    box(c, x + 27, Y + 12, 3, 10, shade(col, -0.2));
    box(c, x, Y + 6, 32, 9, col);
    r(c, x + 1, Y + 12, 30, 2, shade(col, -0.12));
    if (!(bare & 1)) {
      box(c, x + 4, Y + 3, 9, 4, '#9db4ee');
      box(c, x + 5, Y, 8, 4, '#f4a6b8');
    }
    if (bare & 2) return;
    box(c, x + 23, Y + 1, 5, 6, '#fffaf3');
    r(c, x + 24, Y - 2, 1, 3, '#ffd34d');
    r(c, x + 26, Y - 1, 1, 2, '#8fd0a8');
  },
  pcDesk(c, x, y, t, col = '#b07a4e') {
    const Y = y - 6;
    box(c, x + 2, Y + 12, 3, 10, shade(col, -0.2));
    box(c, x + 27, Y + 12, 3, 10, shade(col, -0.2));
    box(c, x, Y + 6, 32, 9, col);
    r(c, x + 1, Y + 12, 30, 2, shade(col, -0.12));
    box(c, x + 4, Y - 8, 16, 11, '#3a3448');
    r(c, x + 5, Y - 7, 14, 8, Math.floor(t / 1500) % 2 ? '#7fb2e8' : '#8fc4f0');
    r(c, x + 7, Y - 5, 6, 1, '#fffaf3');
    r(c, x + 7, Y - 3, 9, 1, '#cfe1f7');
    r(c, x + 11, Y + 3, 2, 3, '#5a5070');
    r(c, x + 5, Y + 7, 14, 2, '#d8d4e8');
    box(c, x + 23, Y - 6, 7, 13, '#5a5070');
    r(c, x + 26, Y - 4, 1, 1, '#8fd0a8');
    r(c, x + 25, Y + 1, 3, 1, '#7a7090');
  },
  gamingDesk(c, x, y, t) {
    const Y = y - 6;
    box(c, x + 2, Y + 12, 3, 10, '#2b2530');
    box(c, x + 27, Y + 12, 3, 10, '#2b2530');
    box(c, x, Y + 6, 32, 9, '#3a3448');
    const rgb = ['#f48a8a', '#ffd27a', '#8fd0a8', '#7fb2e8', '#b89af0'];
    for (let i = 0; i < 6; i++) r(c, x + 1 + i * 5, Y + 13, 5, 1, rgb[(i + Math.floor(t / 250)) % rgb.length]);
    for (const mx of [2, 16]) {
      box(c, x + mx, Y - 6, 14, 10, '#2b2530');
      r(c, x + mx + 1, Y - 5, 12, 7, mx === 2 ? '#b89af0' : '#f48a8a');
      r(c, x + mx + 3, Y - 3, 4, 2, '#fffaf3');
    }
    r(c, x + 15, Y + 3, 2, 3, '#2b2530');
    r(c, x + 6, Y + 7, 12, 2, '#5a5070');
    r(c, x + 6 + (Math.floor(t / 200) % 12), Y + 7, 1, 1, rgb[Math.floor(t / 400) % rgb.length]);
    box(c, x + 21, Y + 7, 4, 3, '#5a5070');
  },
  miniFridge(c, x, y, _t, col = '#cfe1f7') {
    const Y = y - 6;
    box(c, x + 2, Y, 12, 21, col);
    r(c, x + 3, Y + 7, 10, 1, shade(col, -0.2));
    r(c, x + 11, Y + 2, 1, 4, OUT);
    r(c, x + 11, Y + 10, 1, 6, OUT);
    heart(c, x + 6, Y + 11, '#f48a8a');
    r(c, x + 4, Y + 2, 3, 2, '#ffd34d');
  },
  coffee(c, x, y, t) {
    box(c, x + 5, y + 7, 6, 7, '#fff4e6');
    r(c, x + 6, y + 8, 4, 1, '#7a4a32');
    r(c, x + 11, y + 9, 1, 3, OUT);
    heart(c, x + 8, y + 10, '#f4a6b8');
    const s = Math.floor(t / 450) % 2;
    r(c, x + 7 + s, y + 3, 1, 3, 'rgba(255,255,255,0.75)');
  },
  energyCan(c, x, y) {
    box(c, x + 5, y + 4, 6, 10, '#f4f6fa');
    r(c, x + 6, y + 4, 4, 1, '#c8c8d0');
    for (let k = 0; k < 3; k++) r(c, x + 6 + k, y + 7 + (k % 2), 1, 4, '#9ddcf0');
    r(c, x + 9, y + 7, 1, 4, '#9ddcf0');
  },
  soda(c, x, y) {
    r(c, x + 7, y, 2, 1, '#f48a8a');
    box(c, x + 6, y + 1, 4, 4, '#8fd0a8');
    box(c, x + 5, y + 4, 6, 10, '#8fd0a8');
    r(c, x + 6, y + 8, 4, 3, '#ffd34d');
    r(c, x + 6, y + 5, 1, 3, '#c8f0d0');
  },
  wine(c, x, y) {
    box(c, x + 4, y - 1, 3, 5, '#5a1e2c');
    box(c, x + 3, y + 3, 5, 11, '#7a2a3a');
    r(c, x + 4, y + 7, 3, 3, '#fff4e6');
    box(c, x + 9, y + 5, 5, 4, '#e8e3dc');
    r(c, x + 10, y + 6, 3, 2, '#c8304a');
    r(c, x + 11, y + 9, 1, 3, '#e8e3dc');
    r(c, x + 9, y + 12, 5, 1, '#e8e3dc');
  },
  gymBall(c, x, y, _t, col = '#9db4ee') {
    disc(c, x + 8, y + 8, 7, OUT);
    disc(c, x + 8, y + 8, 6, col);
    r(c, x + 2, y + 9, 12, 1, shade(col, -0.12));
    disc(c, x + 6, y + 5, 2, shade(col, 0.18));
  },
  dumbbells(c, x, y, _t, col = '#f48a8a') {
    const Y = y - 4;
    box(c, x + 1, Y + 10, 14, 8, '#7a7090');
    r(c, x + 3, Y + 16, 2, 3, OUT);
    r(c, x + 11, Y + 16, 2, 3, OUT);
    for (const dy of [3, 8]) {
      r(c, x + 4, Y + dy + 1, 8, 1, '#5a5070');
      box(c, x + 2, Y + dy - 1, 3, 5, col);
      box(c, x + 11, Y + dy - 1, 3, 5, col);
    }
  },
  punchingBag(c, x, y, t, col = '#f48a8a') {
    const Y = y - 14;
    r(c, x + 2, Y - 2, 12, 2, '#5a5070');
    const sw = Math.round(Math.sin(t / 380));
    r(c, x + 7 + sw, Y, 2, 3, '#8a8090');
    box(c, x + 4 + sw, Y + 3, 8, 18, col);
    r(c, x + 5 + sw, Y + 6, 6, 1, shade(col, -0.2));
    r(c, x + 5 + sw, Y + 17, 6, 1, shade(col, -0.2));
    r(c, x + 5 + sw, Y + 4, 1, 12, shade(col, 0.15));
  },
  exerciseBike(c, x, y, t, col = '#8fd0a8') {
    const Y = y - 8;
    r(c, x + 2, y + 13, 12, 2, '#5a5070');
    r(c, x + 7, Y + 6, 2, 16, '#7a7090');
    disc(c, x + 8, y + 8, 4, OUT);
    disc(c, x + 8, y + 8, 3, col);
    r(c, x + 8, y + 6 + (Math.floor(t / 200) % 4), 1, 1, '#fffaf3');
    box(c, x + 4, Y + 4, 8, 3, '#2b2530');
    r(c, x + 2, Y, 12, 2, '#5a5070');
    r(c, x + 2, Y - 1, 2, 2, OUT);
    r(c, x + 12, Y - 1, 2, 2, OUT);
  },
  treadmill(c, x, y, t) {
    const Y = y - 12;
    r(c, x + 1, Y + 3, 2, 14, '#7a7090');
    r(c, x + 13, Y + 3, 2, 14, '#7a7090');
    box(c, x, Y, 16, 5, '#5a5070');
    r(c, x + 4, Y + 1, 8, 2, '#8fd0a8');
    box(c, x, y + 3, 16, 12, '#4a4458');
    r(c, x + 2, y + 5, 12, 8, '#2b2530');
    for (let k = 0; k < 2; k++) r(c, x + 2, y + 5 + ((k * 4 + Math.floor(t / 90)) % 8), 12, 1, '#4a4458');
  },
  petBall(c, x, y, t) {
    const bx = x + 8 + Math.round(Math.sin(t / 350) * 3);
    disc(c, bx, y + 11, 3, OUT);
    disc(c, bx, y + 11, 2, '#ffd34d');
    r(c, bx - 2, y + 11, 5, 1, '#f48a8a');
  },
  petBed(c, x, y, _t, col = '#b89af0') {
    box(c, x, y + 6, 16, 9, col);
    r(c, x + 2, y + 8, 12, 5, shade(col, 0.18));
    heart(c, x + 8, y + 9, shade(col, 0.05));
  },
  doghouse(c, x, y, _t, col = '#d9a06a') {
    const Y = y - 10;
    box(c, x + 1, Y + 7, 14, 17, col);
    for (let i = 0; i < 7; i++) {
      r(c, x + 7 - i, Y + i, 2 + i * 2, 1, OUT);
      if (i) r(c, x + 8 - i, Y + i, i * 2, 1, '#e06a5a');
    }
    r(c, x, Y + 7, 16, 1, OUT);
    r(c, x + 4, Y + 13, 8, 11, '#3a2633');
    r(c, x + 5, Y + 12, 6, 1, '#3a2633');
    r(c, x + 5, Y + 9, 6, 2, '#fff4e6');
  },
  catTower(c, x, y, _t, col = '#b89af0') {
    const Y = y - 14;
    box(c, x + 1, y + 9, 14, 6, col);
    r(c, x + 6, Y + 4, 4, 20, '#e8d3b0');
    for (let k = 0; k < 6; k++) r(c, x + 6, Y + 6 + k * 3, 4, 1, '#c8a878');
    box(c, x + 1, Y + 11, 9, 3, col);
    box(c, x + 3, Y, 12, 5, col);
    r(c, x + 13, Y + 5, 1, 5, '#8a8090');
    disc(c, x + 13, Y + 11, 1, '#ffd34d');
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
    // Woven: a border band, a field of soft stripes and a row of diamonds, with fringe at the ends.
    box(c, x + 3, y + 2, 42, 28, col);
    r(c, x + 6, y + 5, 36, 22, shade(col, 0.16));
    for (let k = 0; k < 5; k++) r(c, x + 7, y + 7 + k * 4, 34, 1, shade(col, 0.06));
    for (let i = 0; i < 5; i++) {
      const dx = x + 11 + i * 6, dy = y + 15;
      r(c, dx, dy - 2, 1, 1, shade(col, -0.06)); r(c, dx - 1, dy - 1, 3, 1, shade(col, -0.06));
      r(c, dx - 2, dy, 5, 1, shade(col, -0.06)); r(c, dx - 1, dy + 1, 3, 1, shade(col, -0.06)); r(c, dx, dy + 2, 1, 1, shade(col, -0.06));
    }
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
    // Low table: a wide top with plank lines, a shelf underneath, a mug and a book.
    const Y = y - 2;
    box(c, x + 3, Y + 10, 3, 8, shade(col, -0.2));
    box(c, x + 26, Y + 10, 3, 8, shade(col, -0.2));
    r(c, x + 5, Y + 14, 22, 2, shade(col, -0.16));
    box(c, x + 1, Y + 1, 30, 9, shade(col, 0.05));
    r(c, x + 2, Y + 4, 28, 1, shade(col, -0.03));
    box(c, x + 2, Y + 8, 28, 4, shade(col, -0.12));
    box(c, x + 6, Y - 1, 5, 5, '#fff4e6');
    r(c, x + 7, Y, 3, 1, '#9a6440');
    box(c, x + 15, Y + 2, 10, 4, '#7f9cb2');
    r(c, x + 16, Y + 3, 8, 1, '#fffaf3');
  },
  armchair(c, x, y, _t, col = '#f2b48a') {
    // Mid-century lounge chair: tall cushioned back, a seat you see the top of, wooden arms and tapered legs.
    const Y = y - 6;
    r(c, x + 2, Y + 19, 2, 3, '#5a3620');
    r(c, x + 12, Y + 19, 2, 3, '#5a3620');
    box(c, x + 2, Y, 12, 11, shade(col, -0.06));
    r(c, x + 7, Y + 3, 2, 1, shade(col, -0.16));
    box(c, x + 3, Y + 9, 10, 5, shade(col, 0.08));
    box(c, x + 3, Y + 13, 10, 6, shade(col, -0.12));
    for (const ax of [x, x + 12]) {
      box(c, ax, Y + 8, 4, 12, '#b07a4e');
      r(c, ax + 1, Y + 9, 2, 1, shade('#b07a4e', 0.14));
    }
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
    // Wooden headboard with a panel, two plump pillows, a folded-back quilt and a footboard.
    const Y = y - 6, wood = '#c58b5a';
    box(c, x, Y, 32, 13, wood);
    box(c, x + 3, Y + 2, 26, 7, shade(wood, 0.06));
    box(c, x + 1, Y + 8, 30, 46, shade(wood, -0.1));
    r(c, x + 3, Y + 10, 26, 42, '#fff8f0');
    for (const px of [x + 4, x + 17]) {
      box(c, px, Y + 11, 11, 8, '#ffffff');
      r(c, px + 2, Y + 16, 7, 1, '#e8e0f0');
    }
    box(c, x + 2, Y + 22, 28, 30, col);
    box(c, x + 2, Y + 21, 28, 6, '#fff8f0');
    r(c, x + 3, Y + 26, 26, 1, shade(col, -0.1));
    for (const qy of [33, 41]) r(c, x + 3, Y + qy, 26, 1, shade(col, -0.07));
    r(c, x + 16, Y + 27, 1, 24, shade(col, -0.07));
    box(c, x + 1, Y + 50, 30, 4, wood);
  },
  guitar(c, x, y) {
    pix(c, x, y - 12, GUITAR_ROWS, { ...STRINGED, b: '#e8a050', L: '#f2c48a', d: '#c88a4a', S: OUT, B: '#5a3620' });
  },
  cello(c, x, y) {
    pix(c, x, y - 14, CELLO_ROWS, { ...STRINGED, b: '#b07a4e', L: '#c58b5a', d: '#8a5a3c', f: OUT, B: '#f0d2a8', T: '#3a3448', v: '#a8a0b8' });
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
    // Seen from a little above: tufted back, two seat cushions with their tops showing, rounded arms, wooden feet.
    const Y = y - 8;
    r(c, x + 5, Y + 21, 3, 3, '#5a3620');
    r(c, x + 40, Y + 21, 3, 3, '#5a3620');
    box(c, x + 3, Y, 42, 12, shade(col, -0.08));
    for (const bx of [x + 6, x + 25]) {
      box(c, bx, Y + 1, 17, 9, col);
      r(c, bx + 8, Y + 4, 1, 1, shade(col, -0.16));
    }
    box(c, x + 5, Y + 9, 38, 7, shade(col, 0.07));
    r(c, x + 24, Y + 10, 1, 5, shade(col, -0.08));
    box(c, x + 4, Y + 14, 40, 8, shade(col, -0.12));
    for (const ax of [x, x + 40]) {
      box(c, ax, Y + 5, 8, 17, shade(col, -0.04));
      r(c, ax + 1, Y + 6, 6, 3, shade(col, 0.1));
    }
    box(c, x + 8, Y + 4, 9, 8, '#e0b04c');
    r(c, x + 10, Y + 7, 5, 1, shade('#e0b04c', -0.12));
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
    // A crown on top, two panelled doors with brass knobs, a plinth and little feet.
    const Y = y - 18;
    box(c, x, Y, 32, 5, shade(col, 0.04));
    box(c, x + 1, Y + 4, 30, 27, col);
    for (const dx of [x + 3, x + 17]) {
      box(c, dx, Y + 6, 12, 23, shade(col, 0.04));
      r(c, dx + 2, Y + 8, 8, 8, shade(col, -0.05));
      r(c, dx + 2, Y + 18, 8, 9, shade(col, -0.05));
    }
    r(c, x + 13, Y + 16, 1, 2, '#e8b43c');
    r(c, x + 18, Y + 16, 1, 2, '#e8b43c');
    box(c, x + 1, Y + 29, 30, 4, shade(col, -0.1));
    r(c, x + 3, Y + 32, 3, 2, '#5a3620');
    r(c, x + 26, Y + 32, 3, 2, '#5a3620');
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
  piano(c, x, y, _t, col = '#8a5a3c') { // upright: carved panel, sheet music, keys, gold pedals, little feet
    pix(c, x, y - 12, UPRIGHT_ROWS, { ...keysPal(col), g: shade(col, 0.2), d: shade(col, -0.1), M: '#cfeaf5', N: '#5a5070' });
  },
  // ---- kitchen ----
  counter(c, x, y, _t, col = '#d9a06a') {
    const Y = y - 6;
    box(c, x, Y + 4, 32, 18, col);
    box(c, x, Y + 2, 32, 4, '#e8e3dc');
    r(c, x + 15, Y + 7, 1, 14, shade(col, -0.2));
    r(c, x + 6, Y + 10, 4, 1, OUT);
    r(c, x + 22, Y + 10, 4, 1, OUT);
    box(c, x + 3, Y - 2, 6, 5, '#f4a6b8');
    r(c, x + 22, Y, 6, 2, '#d9a06a');
  },
  sink(c, x, y, t) {
    const Y = y - 6;
    box(c, x + 1, Y + 6, 14, 16, '#fffaf3');
    r(c, x + 3, Y + 7, 10, 3, '#cfe1f7');
    r(c, x + 7, Y + 1, 2, 6, '#a8a0b8');
    r(c, x + 7, Y + 1, 5, 1, '#a8a0b8');
    r(c, x + 7, Y + 12, 1, 9, shade('#fffaf3', -0.12));
    r(c, x + 11, Y + 3 + (Math.floor(t / 140) % 4), 1, 1, '#7fb2e8');
  },
  stove(c, x, y, t) {
    const Y = y - 6;
    box(c, x + 1, Y + 4, 14, 18, '#fffaf3');
    r(c, x + 2, Y + 5, 12, 3, '#3a3448');
    r(c, x + 3, Y + 6, 3, 1, '#e06a5a');
    box(c, x + 3, Y + 11, 10, 8, '#3a3448');
    r(c, x + 4, Y + 12, 8, 1, '#5a5070');
    for (const k of [3, 7, 11]) r(c, x + k, Y + 9, 1, 1, OUT);
    box(c, x + 8, Y, 6, 5, '#f48a8a');
    const s = Math.floor(t / 400) % 2;
    r(c, x + 10 + s, Y - 4, 1, 3, 'rgba(255,255,255,0.75)');
  },
  fridge(c, x, y, _t, col = '#cfe1f7') {
    const Y = y - 16;
    box(c, x + 1, Y, 14, 32, col);
    r(c, x + 2, Y + 11, 12, 1, shade(col, -0.2));
    r(c, x + 12, Y + 3, 1, 6, OUT);
    r(c, x + 12, Y + 14, 1, 8, OUT);
    r(c, x + 4, Y + 4, 2, 2, '#f48a8a');
    r(c, x + 7, Y + 5, 2, 2, '#ffd27a');
    box(c, x + 3, Y + 14, 5, 6, '#fffaf3');
    r(c, x + 4, Y + 16, 3, 1, '#9db4ee');
  },
  diningTable(c, x, y, _t, col = '#b07a4e') {
    // A deep plank top you look down on, a runner and a vase, a shaded apron and tapered legs.
    const Y = y - 4;
    box(c, x + 3, Y + 11, 3, 9, shade(col, -0.2));
    box(c, x + 26, Y + 11, 3, 9, shade(col, -0.2));
    box(c, x, Y + 1, 32, 10, shade(col, 0.05));
    for (const py of [4, 7]) r(c, x + 1, Y + py, 30, 1, shade(col, -0.03));
    box(c, x + 1, Y + 9, 30, 4, shade(col, -0.12));
    r(c, x + 9, Y + 2, 14, 7, '#fffaf3');
    r(c, x + 9, Y + 5, 14, 1, '#9fb47a');
    box(c, x + 14, Y - 3, 4, 7, '#9db4ee');
    r(c, x + 15, Y - 6, 2, 3, '#6cbf7a');
    r(c, x + 15, Y - 7, 2, 1, '#e8b43c');
  },
  barStool(c, x, y, _t, col = '#f4a6b8') {
    const Y = y - 4;
    r(c, x + 4, Y + 6, 1, 13, '#5a5070');
    r(c, x + 11, Y + 6, 1, 13, '#5a5070');
    r(c, x + 4, Y + 14, 8, 1, '#5a5070');
    box(c, x + 2, Y + 2, 12, 5, col);
  },
  microwave(c, x, y, t) {
    box(c, x + 1, y + 4, 14, 10, '#e8e3dc');
    r(c, x + 3, y + 6, 8, 6, '#3a3448');
    if (Math.floor(t / 1800) % 3 === 0) r(c, x + 4, y + 7, 6, 4, '#ffd27a');
    r(c, x + 12, y + 6, 1, 1, '#8fd0a8');
    r(c, x + 12, y + 8, 1, 3, '#a8a0b8');
  },
  teapot(c, x, y, t, col = '#9db4ee') {
    disc(c, x + 8, y + 10, 4, OUT);
    disc(c, x + 8, y + 10, 3, col);
    r(c, x + 12, y + 8, 3, 1, OUT);
    r(c, x + 1, y + 9, 3, 3, OUT);
    r(c, x + 7, y + 5, 2, 1, OUT);
    heart(c, x + 8, y + 9, '#fffaf3');
    r(c, x + 14, y + 4 + (Math.floor(t / 400) % 2), 1, 3, 'rgba(255,255,255,0.7)');
  },
  fruitBowl(c, x, y) {
    disc(c, x + 5, y + 8, 2, '#f48a8a');
    disc(c, x + 9, y + 7, 2, '#ffd27a');
    disc(c, x + 11, y + 9, 2, '#8fd0a8');
    box(c, x + 2, y + 9, 12, 5, '#fffaf3');
    r(c, x + 3, y + 11, 10, 1, '#9db4ee');
  },
  cake(c, x, y, t) {
    box(c, x + 3, y + 7, 10, 7, '#fff4e6');
    r(c, x + 4, y + 8, 8, 2, '#f4a6b8');
    r(c, x + 5, y + 10, 1, 1, '#f4a6b8');
    r(c, x + 9, y + 10, 1, 2, '#f4a6b8');
    r(c, x + 8, y + 3, 1, 4, '#9db4ee');
    r(c, x + 8, y + 1 + (Math.floor(t / 200) % 2), 1, 2, '#ffd34d');
  },
  // ---- bathroom ----
  bathtub(c, x, y, t, col = '#f4a6b8') {
    const Y = y - 6;
    r(c, x + 3, Y + 20, 3, 2, '#d9a06a');
    r(c, x + 26, Y + 20, 3, 2, '#d9a06a');
    box(c, x, Y + 4, 32, 17, '#fffaf3');
    r(c, x + 3, Y + 6, 26, 5, '#a8dcf5');
    box(c, x + 1, Y + 11, 30, 9, col);
    for (let k = 0; k < 4; k++) disc(c, x + 7 + k * 6, Y + 5 - (Math.floor(t / 500 + k) % 2), 1, '#ffffff');
    r(c, x + 3, Y - 1, 2, 6, '#a8a0b8');
    r(c, x + 21, Y + 5, 3, 2, '#ffd34d');
  },
  toilet(c, x, y) {
    const Y = y - 8;
    box(c, x + 3, Y, 10, 9, '#fffaf3');
    r(c, x + 11, Y + 2, 1, 2, '#a8a0b8');
    box(c, x + 2, Y + 8, 12, 8, '#fffaf3');
    r(c, x + 3, Y + 9, 10, 2, '#e8e3dc');
    box(c, x + 5, Y + 15, 6, 8, '#fffaf3');
  },
  vanity(c, x, y, t, col = '#f0d2a8') {
    const Y = y - 14;
    disc(c, x + 8, Y + 5, 6, OUT);
    disc(c, x + 8, Y + 5, 5, '#d4f0fb');
    r(c, x + 5 + (Math.floor(t / 2500) % 2), Y + 2, 1, 4, '#ffffff');
    box(c, x + 1, Y + 12, 14, 18, col);
    r(c, x + 4, Y + 13, 8, 2, '#fffaf3');
    r(c, x + 7, Y + 20, 2, 1, OUT);
  },
  towelRack(c, x, y, _t, col = '#9db4ee') {
    const Y = y - 10;
    r(c, x + 2, Y, 2, 25, '#a8a0b8');
    r(c, x + 12, Y, 2, 25, '#a8a0b8');
    r(c, x + 2, Y + 1, 12, 1, '#a8a0b8');
    box(c, x + 3, Y + 1, 10, 11, col);
    r(c, x + 3, Y + 9, 10, 1, shade(col, 0.2));
    box(c, x + 4, Y + 12, 8, 7, '#fffaf3');
  },
  // ---- bedroom ----
  nightstand(c, x, y, t, col = '#d9a06a') {
    const Y = y - 4;
    r(c, x + 3, Y + 17, 2, 3, '#5a3620');
    r(c, x + 11, Y + 17, 2, 3, '#5a3620');
    box(c, x + 1, Y + 3, 14, 4, shade(col, 0.06));
    box(c, x + 2, Y + 6, 12, 12, col);
    box(c, x + 3, Y + 7, 10, 5, shade(col, 0.03));
    box(c, x + 3, Y + 12, 10, 5, shade(col, 0.03));
    r(c, x + 7, Y + 9, 2, 1, '#e8b43c');
    r(c, x + 7, Y + 14, 2, 1, '#e8b43c');
    box(c, x + 4, Y, 6, 5, '#f48a8a');
    r(c, x + 5, Y + 1, 4, 2, '#fffaf3');
    r(c, x + 7, Y + 1, 1, 1 + (Math.floor(t / 1000) % 2), OUT);
  },
  dresser(c, x, y, _t, col = '#f0d2a8') {
    // A top you can see, three rows of drawers with brass pulls, and tapered legs.
    const Y = y - 6;
    r(c, x + 3, Y + 21, 2, 2, '#5a3620');
    r(c, x + 27, Y + 21, 2, 2, '#5a3620');
    box(c, x, Y + 3, 32, 4, shade(col, 0.06));
    box(c, x + 1, Y + 6, 30, 16, col);
    for (const j of [7, 12, 17]) for (const dx of [x + 2, x + 16]) box(c, dx, Y + j, 14, 5, shade(col, 0.03));
    for (const k of [8, 22]) for (const j of [9, 14, 19]) r(c, x + k, Y + j, 2, 1, '#e8b43c');
    box(c, x + 4, Y, 7, 6, '#fffaf3');
    heart(c, x + 7, Y + 1, '#f4a6b8');
  },
  clothesRack(c, x, y) {
    const Y = y - 14;
    r(c, x + 2, Y + 1, 2, 29, '#a8a0b8');
    r(c, x + 28, Y + 1, 2, 29, '#a8a0b8');
    r(c, x + 2, Y + 1, 28, 2, '#a8a0b8');
    const cols = ['#f48a8a', '#7fb2e8', '#ffd27a', '#b89af0', '#8fd0a8'];
    cols.forEach((cc, k) => { r(c, x + 7 + k * 4, Y + 3, 1, 2, OUT); box(c, x + 5 + k * 4, Y + 5, 5, 13, cc); });
  },
  // ---- living room ----
  tv(c, x, y, t, col = '#b07a4e') {
    const Y = y - 14;
    box(c, x + 1, Y + 16, 30, 12, col);
    r(c, x + 3, Y + 21, 26, 1, shade(col, -0.2));
    box(c, x + 3, Y, 26, 17, '#2b2530');
    r(c, x + 5, Y + 2, 22, 12, ['#7fb2e8', '#f7b58a', '#b89af0'][Math.floor(t / 3000) % 3]);
    r(c, x + 5, Y + 10, 22, 4, '#6cbf7a');
    disc(c, x + 21, Y + 6, 2, '#ffd34d');
    r(c, x + 6, Y + 3, 1, 4, 'rgba(255,255,255,0.5)');
  },
  fireplace(c, x, y, t) {
    const Y = y - 20;
    // Brick chimney breast, staggered courses with a few lighter and darker bricks.
    box(c, x, Y, 32, 31, '#b5523f');
    for (let row = 0; row < 7; row++) {
      const by = Y + 1 + row * 4;
      r(c, x + 1, by + 3, 30, 1, '#8a3a30');
      for (let bx = (row % 2) * 4; bx < 30; bx += 8) {
        r(c, x + 1 + bx, by, 1, 3, '#8a3a30');
        const tone = (row * 5 + bx) % 7;
        if (tone < 2) r(c, x + 2 + bx, by, Math.min(7, 29 - bx), 1, tone ? '#c96a52' : '#a2483a');
      }
    }
    // Arched opening: a ring of lighter bricks, then the dark firebox.
    const arch = (inset: number, top: number, col: string) => {
      const steps = [5, 3, 2, 1, 1, 0];
      for (let k = 0; k < 24 - top; k++) {
        const s = (steps[k] ?? 0) + inset;
        r(c, x + 4 + s, Y + top + k, 24 - s * 2, 1, col);
      }
    };
    arch(0, 3, OUT);
    arch(1, 4, '#d98a6a');
    for (let k = 0; k < 7; k++) r(c, x + 6 + k * 3 + (k > 3 ? 1 : 0), Y + 4 + [4, 2, 1, 0, 1, 2, 4][k], 1, 2, '#a85a48'); // seams between the arch bricks
    arch(3, 7, OUT);
    arch(4, 8, '#2b1418');
    const glow = 0.5 + 0.5 * Math.sin(t / 180) * Math.sin(t / 77);
    r(c, x + 8, Y + 20, 16, 7, glow > 0.5 ? '#5a2420' : '#4a1e1e'); // firelight on the back wall
    for (const [bx, by] of [[9, 14], [15, 14], [21, 14], [12, 18], [18, 18]]) r(c, x + bx, Y + by, 4, 1, '#3c1a1c');
    // Flames: a red edge, orange body, yellow heart and a pale core, each column flickering on its own.
    const base = Y + 26;
    for (let i = 0; i < 14; i++) {
      const h = Math.max(0, Math.round((12 - Math.abs(i - 6.5) * 1.5) * (0.82 + 0.18 * Math.sin(t / 110 + i * 1.9)) + 1.4 * Math.sin(t / 63 + i * 2.7)));
      const fx = x + 9 + i;
      r(c, fx, base - h, 1, h, '#e0533a');
      if (i > 0 && i < 13 && h > 2) r(c, fx, base - h + 2, 1, h - 2, '#f28a3a');
      if (i > 2 && i < 11 && h > 5) r(c, fx, base - Math.round(h * 0.6), 1, Math.round(h * 0.6), '#ffd34d');
      if (i > 4 && i < 9 && h > 7) r(c, fx, base - Math.round(h * 0.3), 1, Math.round(h * 0.3), '#fff3b0');
    }
    // Sparks drifting up out of the flames.
    for (let k = 0; k < 3; k++) {
      const p = (t / 1100 + k / 3) % 1;
      if (p < 0.75) r(c, x + 12 + k * 4 + Math.round(Math.sin(t / 200 + k * 2) * 1.5), base - 8 - Math.round(p * 10), 1, 1, p < 0.4 ? '#fff3b0' : '#ffb347');
    }
    // Logs, with their cut ends facing us.
    box(c, x + 8, base - 1, 16, 4, '#6a3a26');
    box(c, x + 10, base - 3, 12, 3, '#7a4a32');
    for (const lx of [9, 21]) { r(c, x + lx, base, 2, 2, '#c08a5a'); r(c, x + lx, base, 1, 1, '#e0b080'); }
    r(c, x + 12, base + 1, 8, 1, glow > 0.3 ? '#f28a3a' : '#c0502e'); // embers between the logs
    // Hearth: a stone ledge that sticks out in front.
    box(c, x - 1, Y + 29, 34, 7, '#c66a54');
    r(c, x, Y + 30, 32, 2, '#d98a6a');
    for (let bx = 4; bx < 32; bx += 7) r(c, x + bx, Y + 32, 1, 3, '#9a4a3c');
  },
  floorCushion(c, x, y, _t, col = '#ffd27a') {
    box(c, x + 1, y + 6, 14, 9, col);
    r(c, x + 2, y + 7, 12, 1, shade(col, 0.15));
    r(c, x + 7, y + 10, 2, 1, shade(col, -0.2));
    for (const k of [1, 14]) r(c, x + k, y + 6, 1, 1, '#fffaf3');
  },
  standingFan(c, x, y, t) {
    const Y = y - 12;
    r(c, x + 7, Y + 10, 2, 16, '#a8a0b8');
    box(c, x + 3, y + 12, 10, 3, '#a8a0b8');
    disc(c, x + 8, Y + 6, 6, OUT);
    disc(c, x + 8, Y + 6, 5, '#e8f6ff');
    if (Math.floor(t / 70) % 2) { r(c, x + 3, Y + 6, 11, 1, '#9db4ee'); r(c, x + 8, Y + 1, 1, 11, '#9db4ee'); }
    else for (let k = -3; k <= 3; k++) { r(c, x + 8 + k, Y + 6 + k, 1, 1, '#9db4ee'); r(c, x + 8 + k, Y + 6 - k, 1, 1, '#9db4ee'); }
    r(c, x + 7, Y + 5, 2, 2, OUT);
  },
  grandClock(c, x, y, t, col = '#8a5a3c') {
    const Y = y - 20;
    box(c, x + 3, Y, 10, 36, col);
    disc(c, x + 8, Y + 6, 4, OUT);
    disc(c, x + 8, Y + 6, 3, '#fffaf3');
    r(c, x + 8, Y + 4, 1, 3, OUT);
    r(c, x + 8, Y + 6, 2, 1, OUT);
    r(c, x + 5, Y + 13, 6, 16, shade(col, -0.25));
    const px = Math.round(Math.sin(t / 500) * 2);
    r(c, x + 8 + px, Y + 14, 1, 10, '#ffd27a');
    disc(c, x + 8 + px, Y + 25, 1, '#ffd27a');
  },
  sideTable(c, x, y, _t, col = '#d9a06a') {
    const Y = y - 2;
    r(c, x + 3, Y + 9, 2, 9, shade(col, -0.2));
    r(c, x + 11, Y + 9, 2, 9, shade(col, -0.2));
    r(c, x + 4, Y + 14, 8, 1, shade(col, -0.2));
    box(c, x + 1, Y + 1, 14, 7, shade(col, 0.05));
    box(c, x + 2, Y + 6, 12, 4, shade(col, -0.12));
  },
  // ---- games and music ----
  arcade(c, x, y, t, col = '#b89af0') {
    const Y = y - 18;
    box(c, x + 1, Y, 14, 34, col);
    r(c, x + 2, Y + 1, 12, 4, '#ffd27a');
    box(c, x + 3, Y + 6, 10, 9, '#2b2530');
    r(c, x + 4 + (Math.floor(t / 300) % 6), Y + 8, 2, 2, '#8fd0a8');
    r(c, x + 8, Y + 12 - (Math.floor(t / 150) % 3), 1, 1, '#f48a8a');
    r(c, x + 2, Y + 16, 12, 3, shade(col, -0.2));
    r(c, x + 5, Y + 14, 1, 3, OUT);
    r(c, x + 9, Y + 17, 1, 1, '#f48a8a');
    r(c, x + 11, Y + 17, 1, 1, '#7fb2e8');
  },
  gameConsole(c, x, y, t) {
    box(c, x + 2, y + 9, 12, 5, '#3a3448');
    r(c, x + 4, y + 11, 1, 1, Math.floor(t / 800) % 2 ? '#8fd0a8' : '#5a5070');
    box(c, x + 5, y + 5, 7, 4, '#7a7090');
    r(c, x + 6, y + 6, 1, 1, OUT);
    r(c, x + 10, y + 6, 1, 1, '#f48a8a');
  },
  speaker(c, x, y, t) {
    const Y = y - 10;
    box(c, x + 3, Y, 10, 26, '#3a3448');
    disc(c, x + 8, Y + 6, 3, '#5a5070');
    disc(c, x + 8, Y + 6, 1, OUT);
    const p = Math.floor(t / 250) % 2;
    disc(c, x + 8, Y + 16, 4 + p, '#5a5070');
    disc(c, x + 8, Y + 16, 2, OUT);
  },
  drumKit(c, x, y, _t, col = '#f48a8a') {
    const Y = y - 10;
    r(c, x + 4, Y + 3, 1, 20, '#a8a0b8');
    r(c, x + 27, Y + 3, 1, 20, '#a8a0b8');
    r(c, x + 1, Y + 2, 8, 1, '#ffd34d');
    r(c, x + 23, Y + 2, 8, 1, '#ffd34d');
    disc(c, x + 8, Y + 10, 4, OUT);
    disc(c, x + 8, Y + 10, 3, col);
    disc(c, x + 24, Y + 10, 4, OUT);
    disc(c, x + 24, Y + 10, 3, col);
    disc(c, x + 16, Y + 17, 8, OUT);
    disc(c, x + 16, Y + 17, 7, '#fffaf3');
    disc(c, x + 16, Y + 17, 5, col);
    heart(c, x + 16, Y + 15, '#fffaf3');
  },
  synth(c, x, y, t) {
    const Y = y - 8;
    r(c, x + 6, Y + 12, 2, 12, '#5a5070');
    r(c, x + 24, Y + 12, 2, 12, '#5a5070');
    box(c, x, Y + 3, 32, 10, '#3a3448');
    r(c, x + 2, Y + 8, 28, 4, '#fffaf3');
    for (let k = 0; k < 7; k++) r(c, x + 4 + k * 4, Y + 8, 2, 2, OUT);
    for (let k = 0; k < 5; k++) r(c, x + 4 + k * 3, Y + 5, 1, 1, ['#ffd27a', '#f48a8a', '#8fd0a8'][k % 3]);
    r(c, x + 22 + (Math.floor(t / 200) % 6), Y + 5, 1, 1, '#7fb2e8');
  },
  djDeck(c, x, y, t) {
    const Y = y - 6;
    box(c, x, Y + 6, 32, 16, '#3a3448');
    const rgb = ['#f48a8a', '#ffd27a', '#8fd0a8', '#7fb2e8', '#b89af0'];
    r(c, x + 2, Y + 18, 28, 1, rgb[Math.floor(t / 200) % rgb.length]);
    for (const px of [8, 24]) {
      disc(c, x + px, Y + 9, 5, OUT);
      disc(c, x + px, Y + 9, 4, '#2b2530');
      const a = t / 200;
      r(c, x + px + Math.round(Math.cos(a) * 3), Y + 9 + Math.round(Math.sin(a) * 2), 1, 1, '#fffaf3');
    }
    r(c, x + 14, Y + 3, 4, 8, '#5a5070');
    r(c, x + 15, Y + 4 + (Math.floor(t / 300) % 5), 2, 1, '#ffd27a');
  },
  telescope(c, x, y, t, col = '#9db4ee') {
    const Y = y - 14;
    r(c, x + 3, Y + 14, 1, 14, '#5a5070');
    r(c, x + 12, Y + 14, 1, 14, '#5a5070');
    r(c, x + 8, Y + 14, 1, 14, '#5a5070');
    for (let k = 0; k < 8; k++) r(c, x + 3 + k, Y + 12 - k, 5, 3, col);
    r(c, x + 9, Y + 4, 5, 1, shade(col, 0.2));
    r(c, x + 1, Y + 13, 3, 2, OUT);
    if (Math.floor(t / 900) % 2) r(c, x + 14, Y, 1, 1, '#fff3b0');
  },
  poolTable(c, x, y, _t, col = '#8a5a3c') {
    const Y = y - 6;
    for (const lx of [3, 42]) r(c, x + lx, Y + 32, 3, 6, OUT);
    box(c, x, Y + 4, 48, 30, col);
    r(c, x + 3, Y + 7, 42, 24, '#4f9a6a');
    for (const [px, py] of [[3, 7], [23, 6], [43, 7], [3, 29], [23, 30], [43, 29]]) r(c, x + px, Y + py, 2, 2, OUT);
    disc(c, x + 12, Y + 19, 1, '#fffaf3');
    const balls = ['#ffd27a', '#f48a8a', '#7fb2e8', '#b89af0', '#f28a3a', '#2b2530'];
    balls.forEach((b, k) => { const row = k < 1 ? 0 : k < 3 ? 1 : 2; const i = k < 1 ? 0 : k < 3 ? k - 1 : k - 3; r(c, x + 30 + row * 3, Y + 18 - row * 2 + i * 3, 2, 2, b); });
    r(c, x + 8, Y + 22, 20, 1, '#f0d2a8');
  },
  foosball(c, x, y, t) {
    const Y = y - 8;
    r(c, x + 3, Y + 18, 2, 6, OUT);
    r(c, x + 27, Y + 18, 2, 6, OUT);
    box(c, x, Y + 4, 32, 15, '#8a5a3c');
    r(c, x + 2, Y + 6, 28, 11, '#6cbf7a');
    r(c, x + 15, Y + 6, 1, 11, '#a8e6a0');
    for (let k = 0; k < 4; k++) {
      r(c, x + 6 + k * 7, Y + 3, 1, 15, '#a8a0b8');
      r(c, x + 5 + k * 7, Y + 9, 3, 3, k % 2 ? '#f48a8a' : '#7fb2e8');
    }
    disc(c, x + 16 + Math.round(Math.sin(t / 300) * 8), Y + 11, 1, '#fffaf3');
  },
  trampoline(c, x, y, _t, col = '#8fd0a8') {
    for (const lx of [3, 27]) r(c, x + lx, y + 26, 2, 4, OUT);
    box(c, x + 1, y + 4, 30, 24, col);
    r(c, x + 4, y + 7, 24, 18, '#3a3448');
    for (let k = 0; k < 9; k++) { r(c, x + 3 + k * 3, y + 5, 1, 1, '#fffaf3'); r(c, x + 3 + k * 3, y + 26, 1, 1, '#fffaf3'); }
    r(c, x + 8, y + 10, 16, 1, '#4a4458');
  },
  // ---- more plants ----
  palm(c, x, y, _t, col = '#e8956e') {
    const Y = y - 16;
    r(c, x + 7, Y + 8, 2, 18, '#b07a4e');
    for (let k = 0; k < 5; k++) r(c, x + 7, Y + 10 + k * 3, 2, 1, '#8a5a3c');
    r(c, x + 1, Y + 5, 7, 2, '#4f9a6a');
    r(c, x + 8, Y + 5, 7, 2, '#4f9a6a');
    r(c, x + 3, Y + 2, 5, 2, '#6cbf7a');
    r(c, x + 8, Y + 2, 5, 2, '#6cbf7a');
    r(c, x + 6, Y, 4, 3, '#6cbf7a');
    r(c, x, Y + 7, 2, 3, '#4f9a6a');
    r(c, x + 14, Y + 7, 2, 3, '#4f9a6a');
    disc(c, x + 7, Y + 8, 1, '#8a5a3c');
    box(c, x + 4, Y + 24, 8, 8, col);
  },
  tulips(c, x, y, _t, col = '#9db4ee') {
    const Y = y - 8;
    for (const k of [5, 8, 11]) r(c, x + k, Y + 3, 1, 10, '#4f9a6a');
    box(c, x + 3, Y, 4, 5, '#f48a8a');
    box(c, x + 6, Y - 2, 4, 5, '#ffd27a');
    box(c, x + 9, Y + 1, 4, 5, '#b89af0');
    box(c, x + 3, Y + 12, 10, 10, col);
    r(c, x + 4, Y + 13, 8, 1, shade(col, 0.15));
  },
  fig(c, x, y, _t, col = '#fffaf3') {
    const Y = y - 16;
    r(c, x + 7, Y + 12, 2, 12, '#8a5a3c');
    const leaves = [[8, 6, 5], [4, 10, 4], [12, 10, 4], [5, 3, 3], [11, 3, 3]];
    for (const [a, b, rad] of leaves) disc(c, x + a, Y + b, rad + 1, OUT);
    for (const [a, b, rad] of leaves) { disc(c, x + a, Y + b, rad, '#3f8a5a'); r(c, x + a - 1, Y + b - rad + 1, 2, 1, '#6cbf7a'); }
    box(c, x + 3, Y + 22, 10, 10, col);
  },
  terrarium(c, x, y) {
    disc(c, x + 8, y + 8, 5, OUT);
    disc(c, x + 8, y + 8, 4, '#d4f0fb');
    r(c, x + 5, y + 10, 6, 2, '#8a5a3c');
    r(c, x + 6, y + 7, 2, 3, '#6cbf7a');
    r(c, x + 9, y + 8, 1, 2, '#8fd0a8');
    r(c, x + 6, y + 5, 1, 1, '#ffffff');
    box(c, x + 3, y + 12, 10, 3, '#b07a4e');
  },
  succulent(c, x, y, _t, col = '#f2b48a') {
    box(c, x + 5, y + 9, 6, 5, col);
    disc(c, x + 8, y + 8, 3, '#8fd0a8');
    r(c, x + 7, y + 6, 2, 2, '#a8e6a0');
    r(c, x + 5, y + 8, 1, 1, '#f4a6b8');
  },
  // ---- seasonal ----
  pumpkin(c, x, y, t) {
    disc(c, x + 8, y + 9, 6, OUT);
    disc(c, x + 8, y + 9, 5, '#f28a3a');
    r(c, x + 5, y + 5, 1, 9, '#d9702a');
    r(c, x + 10, y + 5, 1, 9, '#d9702a');
    r(c, x + 7, y + 1, 2, 3, '#4f9a6a');
    const glow = Math.floor(t / 300) % 3 ? '#ffd34d' : '#fff3b0';
    r(c, x + 5, y + 7, 2, 2, glow);
    r(c, x + 9, y + 7, 2, 2, glow);
    r(c, x + 5, y + 11, 6, 1, glow);
    r(c, x + 6, y + 12, 1, 1, glow);
    r(c, x + 9, y + 12, 1, 1, glow);
  },
  christmasTree(c, x, y, t) {
    const Y = y - 20;
    for (const [top, half] of [[2, 4], [8, 6], [14, 7]]) {
      for (let i = 0; i < 7; i++) {
        const w = Math.round((half * (i + 1)) / 7);
        r(c, x + 8 - w - 1, Y + top + i, w * 2 + 2, 1, OUT);
        r(c, x + 8 - w, Y + top + i, w * 2, 1, i % 3 ? '#4f9a6a' : '#6cbf7a');
      }
    }
    const lights = ['#f48a8a', '#ffd34d', '#7fb2e8', '#f4a6c8'];
    [[6, 6], [10, 11], [5, 13], [9, 17], [4, 19], [12, 19]].forEach(([a, b], k) => r(c, x + a, Y + b, 1, 1, lights[(k + Math.floor(t / 400)) % 4]));
    r(c, x + 7, Y - 1, 2, 3, '#ffd34d');
    r(c, x + 6, Y, 4, 1, '#ffd34d');
    r(c, x + 7, Y + 21, 2, 3, '#8a5a3c');
    box(c, x + 4, Y + 24, 8, 6, '#e06a5a');
  },
  snowman(c, x, y) {
    const Y = y - 12;
    disc(c, x + 8, Y + 20, 6, OUT);
    disc(c, x + 8, Y + 20, 5, '#fffaf3');
    disc(c, x + 8, Y + 10, 4, OUT);
    disc(c, x + 8, Y + 10, 3, '#fffaf3');
    r(c, x + 6, Y + 9, 1, 1, OUT);
    r(c, x + 9, Y + 9, 1, 1, OUT);
    r(c, x + 8, Y + 11, 3, 1, '#f28a3a');
    r(c, x + 4, Y + 14, 8, 2, '#f48a8a');
    r(c, x + 10, Y + 16, 2, 3, '#f48a8a');
    box(c, x + 5, Y + 2, 6, 5, '#3a3448');
    r(c, x + 4, Y + 6, 8, 1, '#3a3448');
    for (const k of [18, 21]) r(c, x + 8, Y + k, 1, 1, OUT);
  },
  giftBox(c, x, y, _t, col = '#b89af0') {
    box(c, x + 3, y + 6, 10, 8, col);
    r(c, x + 7, y + 6, 2, 8, '#fffaf3');
    r(c, x + 3, y + 9, 10, 1, '#fffaf3');
    r(c, x + 5, y + 4, 2, 2, '#fffaf3');
    r(c, x + 9, y + 4, 2, 2, '#fffaf3');
  },
};

// Extra styles: ALT[item][s - 1] draws style s (style 0 is the item's own DRAW entry).
const ALT: Record<string, Draw[]> = {
  guitar: [(c, x, y) => pix(c, x, y - 12, ELECTRIC_ROWS, { ...STRINGED, R: '#e06a5a', D: '#a04a3a', p: '#a8a0b8', B: '#3a3448' })],
  piano: [(c, x, y, _t, col = '#8a5a3c') => pix(c, x, y - 12, GRAND_ROWS, { ...keysPal(col), G: '#e8b43c', s: '#a8a0b8' })],
  sofa: [
    (c, x, y, _t, col = '#9db4ee') => { // modern: low, square, dark legs
      const Y = y - 6;
      r(c, x + 4, Y + 20, 2, 4, '#3a3448');
      r(c, x + 42, Y + 20, 2, 4, '#3a3448');
      box(c, x + 2, Y, 44, 12, shade(col, -0.05));
      box(c, x + 2, Y + 10, 44, 11, col);
      r(c, x + 17, Y + 11, 1, 9, shade(col, -0.15));
      r(c, x + 31, Y + 11, 1, 9, shade(col, -0.15));
      box(c, x, Y + 4, 5, 17, shade(col, -0.15));
      box(c, x + 43, Y + 4, 5, 17, shade(col, -0.15));
      box(c, x + 34, Y + 3, 8, 7, '#ffd27a');
    },
    (c, x, y, _t, col = '#b07a4e') => { // chesterfield: tufted back, rolled arms
      const Y = y - 8;
      r(c, x + 5, Y + 21, 3, 3, OUT);
      r(c, x + 40, Y + 21, 3, 3, OUT);
      box(c, x + 3, Y, 42, 14, shade(col, -0.08));
      for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) r(c, x + 9 + i * 6 + j * 3, Y + 3 + j * 4, 1, 1, shade(col, -0.3));
      box(c, x + 4, Y + 11, 40, 10, col);
      r(c, x + 5, Y + 15, 38, 1, shade(col, -0.15));
      box(c, x, Y + 9, 8, 13, shade(col, -0.1));
      box(c, x + 40, Y + 9, 8, 13, shade(col, -0.1));
      disc(c, x + 4, Y + 9, 4, OUT);
      disc(c, x + 4, Y + 9, 3, shade(col, 0.08));
      disc(c, x + 44, Y + 9, 4, OUT);
      disc(c, x + 44, Y + 9, 3, shade(col, 0.08));
    },
  ],
  armchair: [
    (c, x, y, _t, col = '#9db4ee') => { // wingback
      const Y = y - 8;
      r(c, x + 3, Y + 22, 2, 2, OUT);
      r(c, x + 11, Y + 22, 2, 2, OUT);
      box(c, x + 2, Y, 12, 15, col);
      for (let k = 0; k < 3; k++) r(c, x + 4 + k * 4, Y + 2, 1, 11, shade(col, 0.12));
      box(c, x, Y + 3, 4, 12, shade(col, -0.12));
      box(c, x + 12, Y + 3, 4, 12, shade(col, -0.12));
      box(c, x + 1, Y + 13, 14, 9, shade(col, -0.05));
    },
    (c, x, y, _t, col = '#fffaf3') => { // egg chair on a stand
      r(c, x + 7, y + 9, 2, 5, '#5a5070');
      r(c, x + 3, y + 13, 10, 2, '#5a5070');
      disc(c, x + 8, y + 2, 8, OUT);
      disc(c, x + 8, y + 2, 7, col);
      disc(c, x + 8, y + 3, 5, shade(col, -0.12));
      box(c, x + 4, y + 4, 8, 4, '#f4a6b8');
    },
  ],
  bed: [
    (c, x, y, t, col = '#f4a6b8') => { // canopy
      DRAW.bed(c, x, y, t, col);
      for (const px of [0, 30]) { r(c, x + px, y - 24, 2, 24, '#c58b5a'); r(c, x + px, y + 38, 2, 9, '#c58b5a'); }
      box(c, x - 1, y - 26, 34, 5, '#fffaf3');
      for (let k = 0; k < 8; k++) r(c, x + 1 + k * 4, y - 21, 2, 2, col);
      r(c, x + 2, y - 21, 3, 20, 'rgba(255,250,243,0.7)');
      r(c, x + 27, y - 21, 3, 20, 'rgba(255,250,243,0.7)');
    },
    (c, x, y, _t, col = '#8fd0a8') => { // futon: low mattress on a slatted frame
      box(c, x, y + 4, 32, 44, '#c8935f');
      box(c, x + 1, y + 2, 30, 42, '#fff8f0');
      box(c, x + 4, y + 4, 24, 8, '#ffffff');
      box(c, x + 1, y + 16, 30, 28, col);
      for (let k = 0; k < 4; k++) r(c, x + 2, y + 21 + k * 6, 28, 1, shade(col, 0.15));
    },
  ],
  lamp: [
    (c, x, y, t, col = '#f48a8a') => { // lava lamp
      const Y = y - 10;
      box(c, x + 4, Y + 19, 8, 7, '#5a5070');
      box(c, x + 5, Y + 3, 6, 17, '#3a3448');
      r(c, x + 6, Y + 5, 4, 14, shade(col, -0.3));
      disc(c, x + 8, Y + 17 - (Math.floor(t / 300) % 11), 1, col);
      disc(c, x + 8, Y + 7 + (Math.floor(t / 420) % 9), 1, shade(col, 0.15));
      box(c, x + 5, Y, 6, 4, '#5a5070');
    },
    (c, x, y, t) => { // paper lantern on a stand
      const Y = y - 12;
      r(c, x + 7, Y + 14, 2, 14, '#8a5a3c');
      box(c, x + 4, y + 12, 8, 3, '#8a5a3c');
      disc(c, x + 8, Y + 7, 7, OUT);
      disc(c, x + 8, Y + 7, 6, '#fff4e6');
      disc(c, x + 8, Y + 7, 3, Math.floor(t / 700) % 2 ? '#ffe8b0' : '#ffeec4');
      r(c, x + 2, Y + 4, 12, 1, '#ead9c4');
      r(c, x + 2, Y + 10, 12, 1, '#ead9c4');
    },
  ],
  plant: [
    (c, x, y, _t, col = '#fffaf3') => { // monstera
      const Y = y - 8;
      const leaves = [[5, 7, 4], [11, 6, 4], [8, 2, 3]];
      for (const [a, b, rad] of leaves) disc(c, x + a, Y + b, rad + 1, OUT);
      for (const [a, b, rad] of leaves) {
        disc(c, x + a, Y + b, rad, '#3f8a5a');
        r(c, x + a, Y + b - rad + 1, 1, rad, '#2f6a44');
        r(c, x + a - rad + 1, Y + b, 2, 1, '#2f6a44');
      }
      box(c, x + 4, Y + 14, 8, 10, col);
      r(c, x + 5, Y + 15, 6, 1, shade(col, -0.1));
    },
    (c, x, y, _t, col = '#7a6a8a') => { // snake plant
      const Y = y - 8;
      for (const [k, top] of [[3, 5], [6, 0], [9, 3], [12, 7]]) {
        box(c, x + k, Y + top, 3, 18 - top, '#4f9a6a');
        r(c, x + k + 1, Y + top + 2, 1, 12 - top, '#c8e070');
      }
      box(c, x + 3, Y + 15, 10, 9, col);
    },
  ],
  rug: [
    (c, x, y, _t, col = '#9db4ee') => { // stripes
      box(c, x + 3, y + 2, 42, 28, col);
      for (let k = 0; k < 6; k++) r(c, x + 4, y + 4 + k * 4, 40, 2, shade(col, k % 2 ? 0.18 : -0.04));
      for (let k = 0; k < 13; k++) { r(c, x + 1, y + 4 + k * 2, 2, 1, '#fff4e6'); r(c, x + 45, y + 4 + k * 2, 2, 1, '#fff4e6'); }
    },
    (c, x, y, _t, col = '#8fd0a8') => { // checks
      box(c, x + 3, y + 2, 42, 28, col);
      for (let i = 0; i < 10; i++) for (let j = 0; j < 6; j++) if ((i + j) % 2) r(c, x + 4 + i * 4, y + 4 + j * 4, 4, 4, shade(col, 0.2));
    },
  ],
  bookshelf: [
    (c, x, y, _t, col = '#d9a06a') => { // ladder shelf
      const Y = y - 16;
      r(c, x + 2, Y, 2, 32, col);
      r(c, x + 28, Y, 2, 32, col);
      const colors = ['#f48a8a', '#7fb2e8', '#ffd27a', '#b89af0'];
      for (let s = 0; s < 4; s++) {
        const sy = Y + 6 + s * 7;
        r(c, x + 1, sy, 30, 2, shade(col, -0.15));
        if (s === 0) { r(c, x + 8, sy - 4, 3, 4, '#6cbf7a'); r(c, x + 7, sy - 1, 5, 1, '#d97a55'); }
        else if (s === 2) box(c, x + 16, sy - 5, 6, 5, '#fffaf3');
        else for (let i = 0; i < 4; i++) r(c, x + 6 + i * 3 + s * 2, sy - 5, 2, 5, colors[(i + s) % 4]);
      }
    },
    (c, x, y, _t, col = '#fffaf3') => { // cubbies with bins
      const Y = y - 16;
      box(c, x, Y + 2, 32, 30, col);
      const bins = ['#f4a6b8', '#9db4ee', '#ffd27a', '#8fd0a8', '#b89af0'];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        r(c, x + 2 + i * 10, Y + 4 + j * 9, 8, 7, shade(col, -0.25));
        if ((i + j) % 2 === 0) { box(c, x + 2 + i * 10, Y + 6 + j * 9, 8, 5, bins[(i * 3 + j) % 5]); r(c, x + 5 + i * 10, Y + 7 + j * 9, 2, 1, '#fffaf3'); }
      }
    },
  ],
  wardrobe: [
    (c, x, y, t, col = '#fffaf3') => { // mirrored doors
      DRAW.wardrobe(c, x, y, t, col);
      r(c, x + 5, y - 11, 7, 22, '#d4f0fb');
      r(c, x + 20, y - 11, 7, 22, '#d4f0fb');
      r(c, x + 6 + (Math.floor(t / 2500) % 2), y - 9, 1, 7, '#ffffff');
      r(c, x + 21, y - 9, 1, 4, '#ffffff');
    },
    (c, x, y, _t, col = '#8a5a3c') => { // sliding panels
      const Y = y - 18;
      box(c, x, Y, 32, 34, col);
      r(c, x + 1, Y + 1, 30, 2, shade(col, 0.1));
      for (const k of [11, 21]) r(c, x + k, Y + 3, 1, 29, shade(col, -0.25));
      for (let k = 0; k < 3; k++) r(c, x + 3 + k * 10, Y + 10, 6, 1, shade(col, 0.12));
      r(c, x + 9, Y + 15, 1, 5, OUT);
      r(c, x + 23, Y + 15, 1, 5, OUT);
    },
  ],
  coffeeTable: [
    (c, x, y) => { // glass top on a metal frame
      const Y = y - 2;
      r(c, x + 3, Y + 9, 2, 9, '#7a7090');
      r(c, x + 27, Y + 9, 2, 9, '#7a7090');
      r(c, x + 3, Y + 14, 26, 2, '#7a7090');
      box(c, x + 8, Y + 11, 8, 3, '#f4a6b8');
      box(c, x + 1, Y + 2, 30, 8, '#cfeaf5');
      r(c, x + 4, Y + 3, 8, 1, '#ffffff');
    },
    (c, x, y, _t, col = '#f0d2a8') => { // round pedestal
      const Y = y - 2;
      r(c, x + 14, Y + 10, 4, 8, shade(col, -0.2));
      r(c, x + 10, Y + 16, 12, 2, shade(col, -0.2));
      for (let i = 0; i < 9; i++) {
        const hw = Math.round(14 * Math.sqrt(1 - ((i - 4) / 4.6) ** 2));
        r(c, x + 15 - hw, Y + 2 + i, hw * 2 + 2, 1, i === 0 || i === 8 ? OUT : i > 5 ? shade(col, -0.1) : col);
        r(c, x + 14 - hw, Y + 2 + i, 1, 1, OUT);
        r(c, x + 17 + hw, Y + 2 + i, 1, 1, OUT);
      }
      box(c, x + 13, Y, 5, 5, '#fff4e6');
    },
  ],
};

// ---------- using things ----------
// Characters standing in front of a piece of furniture (use) and what floats around them while they do it.
type Fx = 'note' | 'heart' | 'spark' | 'bubble' | 'steam' | 'drop' | 'flake' | 'star';
const USE_LOOK: Record<string, { back?: boolean; fx: Fx; col: string; prop?: string; bob?: boolean }> = {
  water: { back: true, fx: 'drop', col: '#7fb2e8', prop: 'can' },
  read: { fx: 'spark', col: '#ffd34d', prop: 'book' },
  strum: { fx: 'note', col: '#b89af0', prop: 'guitar', bob: true },
  music: { back: true, fx: 'note', col: '#f48a8a', bob: true },
  drum: { back: true, fx: 'star', col: '#ffd34d', bob: true },
  dj: { back: true, fx: 'note', col: '#7fb2e8', bob: true },
  dance: { fx: 'note', col: '#f4a6c8', bob: true },
  paint: { back: true, fx: 'spark', col: '#f48a8a', prop: 'brush' },
  primp: { back: true, fx: 'heart', col: '#f4a6c8' },
  feed: { back: true, fx: 'flake', col: '#ffd27a' },
  cook: { back: true, fx: 'steam', col: '#ffffff', prop: 'pan' },
  snack: { fx: 'heart', col: '#f48a8a', prop: 'cup' },
  wash: { back: true, fx: 'bubble', col: '#cfeaf5' },
  dress: { back: true, fx: 'spark', col: '#b89af0' },
  game: { back: true, fx: 'star', col: '#8fd0a8', prop: 'pad' },
  warm: { back: true, fx: 'spark', col: '#f28a3a' },
  stargaze: { back: true, fx: 'star', col: '#fff3b0' },
  play: { back: true, fx: 'spark', col: '#ffd27a' },
  wind: { back: true, fx: 'spark', col: '#ffd27a' },
  hug: { fx: 'heart', col: '#f48a8a' },
  tea: { fx: 'steam', col: '#ffffff', prop: 'cup' },
  cool: { back: true, fx: 'flake', col: '#cfeaf5' },
  admire: { back: true, fx: 'heart', col: '#f4a6c8' },
};

function particle(c: Ctx, fx: Fx, x: number, y: number, col: string) {
  if (fx === 'note') { r(c, x, y - 3, 1, 4, col); r(c, x - 2, y, 3, 2, col); r(c, x + 1, y - 3, 2, 1, col); }
  else if (fx === 'heart') heart(c, x, y, col);
  else if (fx === 'bubble') { r(c, x - 1, y, 3, 1, col); r(c, x - 1, y + 2, 3, 1, col); r(c, x - 2, y + 1, 1, 1, col); r(c, x + 2, y + 1, 1, 1, col); }
  else if (fx === 'steam') { r(c, x, y, 1, 2, col); r(c, x + 1, y - 2, 1, 2, col); }
  else if (fx === 'drop') { r(c, x, y, 1, 2, col); r(c, x, y + 2, 1, 1, shade(col, -0.15)); }
  else if (fx === 'flake') r(c, x, y, 1, 1, col);
  else if (fx === 'star') { r(c, x - 1, y, 3, 1, col); r(c, x, y - 1, 1, 3, col); }
  else { r(c, x - 1, y, 3, 1, col); r(c, x, y - 1, 1, 3, col); r(c, x, y, 1, 1, '#ffffff'); }
}

// x, y = top-left of the tile the character stands on; the thing they use is on the tile above.
export function drawUsing(c: Ctx, look: Look, use: string, x: number, y: number, t: number) {
  const u = USE_LOOK[use] ?? USE_LOOK.admire;
  const beat = Math.floor(t / 280) % 2;
  const dx = u.bob ? (beat ? 1 : -1) : 0;
  drawAvatar(c, look, x + dx, y, u.bob && beat ? 1 : 0, !!u.back);
  // Props in hand.
  if (u.prop === 'can') { box(c, x + 11, y - 3, 6, 5, '#7fb2e8'); r(c, x + 9, y - 5, 3, 1, '#7fb2e8'); r(c, x + 7, y - 6, 2, 1, '#7fb2e8'); }
  else if (u.prop === 'book') { box(c, x + 3, y + 4, 10, 6, '#f48a8a'); r(c, x + 4, y + 5, 8, 4, '#fffaf3'); r(c, x + 8, y + 5, 1, 4, '#e8e3dc'); }
  else if (u.prop === 'guitar') { disc(c, x + 6, y + 8, 3, '#e8a050'); r(c, x + 8, y + 3, 6, 2, '#8a5a3c'); r(c, x + 6, y + 8, 1, 1, '#5a3620'); }
  else if (u.prop === 'brush') { r(c, x + 13, y - 4 + beat, 1, 5, '#8a5a3c'); r(c, x + 13, y - 5 + beat, 1, 1, '#f48a8a'); }
  else if (u.prop === 'pan') { r(c, x + 12, y - 1, 6, 1, OUT); box(c, x + 9, y - 3, 5, 3, '#5a5070'); }
  else if (u.prop === 'cup') { box(c, x + 11, y + 5, 4, 4, '#fff4e6'); r(c, x + 15, y + 6, 1, 2, OUT); }
  else if (u.prop === 'pad') box(c, x + 5, y + 6, 6, 3, '#7a7090');
  // Particles drift up (or fall, for water and fish food) above the thing being used.
  for (let k = 0; k < 3; k++) {
    const p = (t / 1400 + k / 3) % 1;
    const falls = u.fx === 'drop' || u.fx === 'flake';
    const px = Math.round(x + 4 + k * 4 + Math.sin(p * 6 + k) * 2);
    const py = Math.round(falls ? y - 10 + p * 8 : y - 8 - p * 14);
    c.globalAlpha = 1 - p * 0.8;
    particle(c, u.fx, px, py, u.col);
    c.globalAlpha = 1;
  }
}

// ---------- recipe sprites ----------
// Most of the catalog is described as a short list of shapes instead of hand-written draw code.
// [overhang, default colour, shapes]. Shapes are 'kind x,y,...,colour' joined by '|', relative to the top of the sprite:
// b box, r rect, d disc, o outlined disc, h heart, f blinking rect, s sliding rect.
// Colours: '$' = the owner's colour ($d/$D darker, $l lighter), O = outline, or a hex colour.
const RECIPES: Record<string, [number, string, string]> = {
  rockingChair: [8, '#f4a6b8', 'b3,0,10,12,$|r5,2,6,1,$l|r4,12,1,10,#8a5a3c|r11,12,1,10,#8a5a3c|b2,10,12,6,$d|r1,22,14,1,#8a5a3c|r0,21,1,1,#8a5a3c|r15,21,1,1,#8a5a3c'],
  bench: [6, '#b07a4e', 'r2,0,28,2,$d|r2,4,28,2,$d|r3,0,2,14,$D|r27,0,2,14,$D|b1,10,30,5,$|r3,15,2,7,$D|r27,15,2,7,$D'],
  loveseat: [8, '#b89af0', 'b2,0,28,13,$d|b4,2,12,10,$|b16,2,12,10,$|b2,11,28,10,$d|b0,5,6,17,$D|b26,5,6,17,$D|r4,21,2,3,O|r26,21,2,3,O'],
  pouf: [2, '#ffd27a', 'o8,10,6,$|r3,8,10,1,$l|r4,12,8,1,$d|d8,10,1,$D'],
  swingChair: [16, '#fffaf3', 'r2,0,12,2,#8a8090|r7,2,1,6,#8a8090|r7,24,2,6,#8a8090|r3,30,10,2,#8a8090|o8,16,7,#d9b48a|d8,17,5,#c89a6a|b4,15,8,5,$'],
  throne: [16, '#f48a8a', 'b2,0,12,22,#ffd34d|b4,3,8,16,$|d8,2,1,#7fb2e8|b1,18,14,7,#ffd34d|b3,19,10,4,$|r3,25,2,6,#d9a628|r11,25,2,6,#d9a628'],
  sectional: [8, '#8fd0a8', 'b2,0,44,13,$d|b4,2,13,10,$|b17,2,13,10,$|b2,11,44,10,$d|b30,9,16,13,$|b0,5,6,17,$D|r4,21,2,3,O|r42,21,2,3,O'],
  diningChair: [8, '#d9a06a', 'b3,0,10,13,$|r5,2,1,9,$d|r8,2,1,9,$d|r10,2,1,9,$d|b2,12,12,4,$l|r3,16,2,8,$D|r11,16,2,8,$D'],
  chaise: [4, '#f4a6b8', 'b2,0,10,14,$d|b2,8,28,10,$|r3,10,26,1,$l|b26,6,5,12,$d|r4,18,2,4,O|r26,18,2,4,O'],
  hammock: [10, '#ffd27a', 'r2,0,2,26,#8a5a3c|r44,0,2,26,#8a5a3c|r4,6,4,1,#d9b48a|r40,6,4,1,#d9b48a|b8,8,32,8,$|r9,10,30,1,$l|r10,13,4,1,$d|r20,13,4,1,$d|r30,13,4,1,$d'],
  giantBeanbag: [4, '#9db4ee', 'o16,11,9,$|d16,13,6,$d|d12,7,3,$l'],
  saucerChair: [6, '#b89af0', 'r5,16,1,6,#5a5070|r10,16,1,6,#5a5070|r3,21,10,1,#5a5070|o8,10,7,$|d8,11,5,$d|r4,6,8,1,$l'],
  stumpSeat: [2, '', 'b2,6,12,11,#a87a58|r3,8,1,7,#8a5a3c|r8,9,1,6,#8a5a3c|o8,6,6,#d9b48a|d8,6,3,#c8a078|d8,6,1,#a87a58'],
  clubChair: [6, '#b07a4e', 'b2,0,12,12,$|r4,2,1,1,$D|r8,2,1,1,$D|r11,2,1,1,$D|r6,5,1,1,$D|r10,5,1,1,$D|b0,6,4,14,$d|b12,6,4,14,$d|b3,10,10,9,$l|r3,20,2,2,O|r11,20,2,2,O'],
  ottoman: [2, '#f2b48a', 'b1,4,14,11,$|r2,5,12,2,$l|r5,9,1,1,$D|r10,9,1,1,$D|r2,15,2,2,O|r12,15,2,2,O'],
  bunkBed: [20, '#9db4ee', 'r0,0,2,66,#c58b5a|r30,0,2,66,#c58b5a|b1,4,30,16,#fff8f0|b1,10,30,10,$|b4,5,10,5,#ffffff|r1,22,30,2,#c58b5a|r26,2,2,22,#8a5a3c|b1,26,30,40,#fff8f0|b4,28,10,6,#ffffff|b1,36,30,30,$l|r1,44,30,1,$|r1,54,30,1,$'],
  singleBed: [6, '#f4a6b8', 'b0,0,16,10,#c58b5a|h8,4,#f4a6b8|b1,6,14,30,#a8714a|r2,8,12,26,#fff8f0|b3,9,10,6,#ffffff|b1,18,14,18,$|r2,22,12,1,$l|r2,28,12,1,$l'],
  daybed: [10, '#cfe1f7', 'b0,0,32,12,#fffaf3|r2,2,1,8,#e8e3dc|r6,2,1,8,#e8e3dc|r10,2,1,8,#e8e3dc|r14,2,1,8,#e8e3dc|r18,2,1,8,#e8e3dc|r22,2,1,8,#e8e3dc|r26,2,1,8,#e8e3dc|b0,10,32,12,$|b3,8,8,5,#ffffff|r2,22,2,3,O|r28,22,2,3,O'],
  cloudBed: [6, '#f2c4d0', 'o8,8,6,#ffffff|o16,6,7,#ffffff|o24,8,6,#ffffff|b1,10,30,26,#ffffff|b2,12,28,8,#f8f4ff|b1,20,30,16,$|r2,24,28,1,$l|d6,30,1,$d|d26,30,1,$d'],
  makeupTable: [16, '#fffaf3', 'o16,7,7,#ffd27a|d16,7,6,#d4f0fb|r13,3,1,4,#ffffff|f8,1,2,2,#fff3b0|f23,1,2,2,#fff3b0|b0,14,32,8,$|r2,22,2,10,$d|r28,22,2,10,$d|r12,16,8,1,$d|b4,11,3,4,#f48a8a|b24,11,4,4,#b89af0'],
  jewelryBox: [0, '#f48a8a', 'b3,7,10,7,$|r3,9,10,1,$d|r7,10,2,1,#ffd34d|d6,6,1,#7fb2e8|r9,5,2,2,#ffd34d'],
  bedsideLamp: [0, '#ffd27a', 'r7,8,2,5,#a8a0b8|r5,13,6,1,#a8a0b8|b3,2,10,7,$|r4,3,8,1,$l'],
  hamper: [4, '', 'b3,4,10,16,#d9b48a|r4,6,8,1,#c8a078|r4,10,8,1,#c8a078|r4,14,8,1,#c8a078|r4,2,5,3,#f48a8a|r8,1,4,3,#7fb2e8'],
  shoeRack: [4, '#d9a06a', 'b1,4,30,16,$|r2,11,28,1,$D|b3,6,5,4,#f48a8a|b9,6,5,4,#7fb2e8|b17,6,6,4,#2b2530|b24,6,5,4,#ffd27a|b4,13,6,5,#8fd0a8|b12,13,5,5,#fffaf3|b20,13,6,5,#b89af0'],
  tallDrawers: [18, '#f0d2a8', 'b1,2,14,30,$|r2,8,12,1,$D|r2,14,12,1,$D|r2,20,12,1,$D|r2,26,12,1,$D|r7,5,2,1,O|r7,11,2,1,O|r7,17,2,1,O|r7,23,2,1,O|r7,29,2,1,O|r4,0,3,3,#8fd0a8'],
  blanketLadder: [18, '#9db4ee', 'r2,0,2,34,#d9a06a|r12,0,2,34,#d9a06a|r2,6,12,1,#d9a06a|r2,14,12,1,#d9a06a|r2,22,12,1,#d9a06a|b3,5,10,8,$|b4,13,8,7,#f4a6b8|r3,21,10,6,#fffaf3'],
  dressingScreen: [18, '#f4a6b8', 'b0,2,11,30,$|b10,2,12,30,$l|b21,2,11,30,$|h5,10,#fffaf3|h16,14,#fffaf3|h26,10,#fffaf3|r10,0,2,4,#d9a06a'],
  toyChest: [6, '#9db4ee', 'b2,6,28,16,$|r2,10,28,2,$d|r14,12,4,3,#ffd34d|b6,2,5,6,#f48a8a|b20,3,6,4,#8fd0a8|o24,4,2,#ffd27a'],
  alarmClock: [0, '#f48a8a', 'r4,4,2,2,#ffd34d|r10,4,2,2,#ffd34d|o8,9,4,$|d8,9,3,#fffaf3|r8,7,1,2,O|r8,9,2,1,O|r5,13,1,2,O|r10,13,1,2,O'],
  arcLamp: [20, '#ffd27a', 'r3,4,2,30,#5a5070|r3,2,8,2,#5a5070|r10,2,2,4,#5a5070|b6,5,10,6,$|r7,6,8,1,$l|b1,33,6,3,#5a5070'],
  tallBookcase: [20, '#8a5a3c', 'b0,0,16,36,$|r2,3,12,7,$D|r2,12,12,7,$D|r2,21,12,7,$D|r3,5,2,5,#f48a8a|r5,4,2,6,#7fb2e8|r8,6,2,4,#ffd27a|r10,5,2,5,#8fd0a8|r3,14,3,5,#b89af0|r7,15,2,4,#f4b6d0|r10,13,3,6,#fffaf3|r3,23,8,5,#6cbf7a|r12,24,1,4,#ffd27a'],
  recordCrate: [4, '#d9a06a', 'r3,4,2,8,#2b2530|r5,3,2,9,#f48a8a|r7,4,2,8,#7fb2e8|r9,3,2,9,#ffd27a|r11,4,2,8,#b89af0|b2,8,12,12,$|r2,12,12,1,$D'],
  mediaConsole: [6, '#b07a4e', 'b0,4,32,16,$|r15,6,1,12,$D|r2,8,12,8,$D|r17,8,13,8,$D|b3,9,6,6,#3a3448|r10,11,3,3,#9db4ee|r19,10,9,5,#fffaf3|r3,20,2,2,O|r27,20,2,2,O|b20,0,8,6,#3a3448'],
  radiator: [4, '', 'b1,2,30,16,#fffaf3|r4,4,1,12,#e8e3dc|r8,4,1,12,#e8e3dc|r12,4,1,12,#e8e3dc|r16,4,1,12,#e8e3dc|r20,4,1,12,#e8e3dc|r24,4,1,12,#e8e3dc|r28,4,1,12,#e8e3dc|r3,18,2,2,#a8a0b8|r27,18,2,2,#a8a0b8|f10,0,1,2,#f7b58a|f20,0,1,2,#f7b58a'],
  heater: [8, '#f48a8a', 'b2,2,12,20,$|r4,5,8,10,#3a2633|f5,7,6,1,#f28a3a|f5,10,6,1,#ffd34d|f5,13,6,1,#f28a3a|r6,17,4,2,#fffaf3|r3,22,10,2,#5a5070'],
  airPurifier: [10, '', 'b3,0,10,24,#fffaf3|o8,5,3,#e8e3dc|d8,5,1,#cfe1f7|r5,10,6,1,#e8e3dc|r5,13,6,1,#e8e3dc|r5,16,6,1,#e8e3dc|f7,20,2,1,#8fd0a8'],
  projector: [0, '', 'b2,7,12,7,#e8e3dc|o5,10,2,#5a5070|d5,10,1,#cfe1f7|r10,9,3,1,#a8a0b8|f12,11,1,1,#8fd0a8'],
  magazineRack: [4, '#d9a06a', 'r2,8,1,12,$D|r13,8,1,12,$D|b3,2,5,12,#f48a8a|b7,3,5,11,#7fb2e8|b10,4,4,10,#ffd27a|b2,12,12,6,$|r3,14,10,1,$l'],
  consoleTable: [4, '#f0d2a8', 'r2,8,2,14,$d|r28,8,2,14,$d|r4,16,24,2,$d|b0,2,32,6,$|b6,13,6,3,#9db4ee|b20,12,7,4,#fffaf3'],
  candles: [0, '', 'b3,8,3,6,#fffaf3|b7,5,3,9,#fff4e6|b11,9,3,5,#fffaf3|f4,6,1,2,#ffd34d|f8,3,1,2,#ffd34d|f12,7,1,2,#ffd34d|r2,14,12,1,#d9a06a'],
  photoFrames: [0, '', 'b2,5,6,8,#d9a06a|r3,6,4,6,#a8dcf5|r3,10,4,2,#8fd0a8|b8,7,6,7,#fffaf3|r9,8,4,5,#f4a6b8|h11,9,#fffaf3'],
  fishBowl: [0, '', 'o8,9,5,#d4f0fb|r4,6,9,1,#bfe9ff|s7,9,3,2,#ff9a5a|r5,13,7,1,#f2dca0|r10,6,1,1,#ffffff'],
  island: [6, '#fffaf3', 'b0,4,32,18,$|b0,2,32,4,#e8e3dc|r10,8,1,13,$D|r21,8,1,13,$D|r4,12,3,1,O|r14,12,3,1,O|r25,12,3,1,O|d24,1,2,#f48a8a'],
  dishwasher: [6, '', 'b1,2,14,20,#e8e3dc|r2,4,12,2,#3a3448|f3,4,1,1,#8fd0a8|r3,9,10,1,#a8a0b8|r2,11,12,1,#c8c0d0'],
  oven: [18, '', 'b1,0,14,34,#e8e3dc|b3,3,10,9,#3a3448|f4,4,8,7,#f7b58a|r3,13,10,1,#a8a0b8|b3,16,10,9,#3a3448|r4,17,8,1,#5a5070|r3,27,10,1,#a8a0b8'],
  coffeeMachine: [0, '', 'b3,2,10,12,#3a3448|r4,3,8,3,#5a5070|f5,4,1,1,#f48a8a|r6,7,4,2,#5a5070|b6,10,4,4,#fff4e6|f7,8,1,2,#7a4a32'],
  toaster: [0, '#f48a8a', 'f4,4,3,2,#d9a06a|f9,4,3,2,#d9a06a|b2,7,12,7,$|r4,6,3,1,#2b2530|r9,6,3,1,#2b2530|r13,9,2,1,O'],
  kettle: [0, '#9db4ee', 'o8,10,4,$|r6,5,4,2,$d|r12,8,3,1,O|r2,8,2,3,O|f13,4,1,3,#ffffff'],
  blender: [0, '#8fd0a8', 'b5,1,6,9,#d4f0fb|r6,5,4,4,$|r6,2,4,1,#a8a0b8|b4,9,8,5,#5a5070|f7,11,2,1,#8fd0a8'],
  riceCooker: [0, '', 'o8,9,5,#fffaf3|r3,8,10,1,#e8e3dc|r7,4,2,1,O|f7,1,1,2,#ffffff|f9,2,1,2,#ffffff|r6,11,4,1,#f48a8a'],
  spiceRack: [14, '#d9a06a', 'b1,2,14,16,$|r2,8,12,1,$D|b3,3,2,4,#f48a8a|b6,3,2,4,#ffd27a|b9,3,2,4,#8fd0a8|b12,3,2,4,#7a4a32|b3,10,2,5,#f28a3a|b6,10,2,5,#e8e3dc|b9,10,2,5,#b89af0|r4,18,1,12,$D|r11,18,1,12,$D'],
  pantry: [20, '#fffaf3', 'b0,0,16,36,$|r2,3,12,8,$D|r2,13,12,8,$D|r2,23,12,8,$D|b3,5,4,6,#ffd27a|b8,4,5,7,#f48a8a|b3,15,3,6,#8fd0a8|b7,15,6,6,#d9a06a|b3,25,10,6,#e8e3dc|r5,27,6,1,#7fb2e8'],
  cookieJar: [0, '', 'b4,5,8,9,#d4f0fb|r5,3,6,2,#f48a8a|d6,9,1,#d9a06a|d10,11,1,#d9a06a|d7,12,1,#b07a4e'],
  fern: [8, '#e8956e', 'r2,6,5,2,#4f9a6a|r9,6,5,2,#4f9a6a|r4,3,4,2,#6cbf7a|r8,3,4,2,#6cbf7a|r7,0,2,8,#6cbf7a|r0,8,3,2,#4f9a6a|r13,8,3,2,#4f9a6a|r3,9,10,4,#5fb070|b4,13,8,10,$'],
  cherryTree: [18, '#fffaf3', 'r7,14,2,12,#8a5a3c|r5,16,2,1,#8a5a3c|o5,7,4,#f4b6c8|o11,7,4,#f4b6c8|o8,3,4,#f7c8d8|d6,8,1,#ffffff|d11,4,1,#ffffff|d9,9,1,#e88aa0|b4,24,8,10,$'],
  lavender: [8, '#fffaf3', 'r4,4,1,10,#6cbf7a|r7,2,1,12,#6cbf7a|r10,3,1,11,#6cbf7a|r3,2,2,4,#b89af0|r6,0,2,4,#a088e0|r9,1,2,4,#b89af0|r12,3,2,4,#a088e0|b3,13,10,10,$'],
  roses: [8, '#b07a4e', 'o5,7,4,#4f9a6a|o11,7,4,#4f9a6a|o8,4,4,#5fb070|d5,5,1,#f48a8a|d10,3,1,#e06a7a|d12,8,1,#f48a8a|d7,9,1,#e06a7a|b3,12,10,11,$'],
  orchid: [10, '#fffaf3', 'r7,2,1,14,#6cbf7a|r7,2,4,1,#6cbf7a|h11,2,#f4a6c8|h9,6,#f4a6c8|h11,9,#f7c8d8|r4,16,3,2,#4f9a6a|r9,16,3,2,#4f9a6a|b4,17,8,9,$'],
  ivy: [14, '#d9a06a', 'r7,8,2,22,#8a5a3c|r4,28,8,2,#8a5a3c|b3,4,10,6,$|o5,10,2,#6cbf7a|o11,12,2,#6cbf7a|o4,16,2,#4f9a6a|o12,18,2,#4f9a6a|o5,22,2,#6cbf7a|o8,2,3,#5fb070'],
  aloe: [6, '#f2b48a', 'r3,4,3,9,#8fd0a8|r6,0,3,13,#7cc098|r10,2,3,11,#8fd0a8|r2,7,2,4,#8fd0a8|r12,6,2,5,#8fd0a8|r7,3,1,7,#c8f0d0|b3,12,10,10,$'],
  moneyTree: [14, '#7a6a8a', 'r6,10,1,14,#a87a58|r9,10,1,14,#a87a58|o4,6,3,#6cbf7a|o12,6,3,#6cbf7a|o8,3,4,#5fb070|o7,9,3,#6cbf7a|b4,22,8,8,$'],
  lemonTree: [16, '#9db4ee', 'r7,12,2,14,#8a5a3c|o8,7,7,#4f9a6a|d6,5,1,#ffd34d|d11,8,1,#ffd34d|d8,11,1,#ffd34d|d4,9,1,#ffd34d|r6,2,2,1,#8fd0a8|b3,24,10,8,$'],
  mushrooms: [4, '#d9a06a', 'r4,7,2,6,#fff4e6|r10,5,2,8,#fff4e6|o5,6,3,#f48a8a|o11,4,3,#e06a5a|r4,5,1,1,#ffffff|r10,3,1,1,#ffffff|r6,6,1,1,#ffffff|b2,12,12,8,$'],
  olive: [16, '#e8e3dc', 'r7,10,2,16,#9a8a7a|r5,14,2,1,#9a8a7a|o4,6,3,#9ab08a|o12,6,3,#9ab08a|o8,3,4,#a8c098|d6,6,1,#5a5070|d11,4,1,#5a5070|b4,24,8,8,$'],
  vase: [10, '#9db4ee', 'r7,0,1,8,#6cbf7a|r9,2,1,6,#6cbf7a|h8,1,#f48a8a|o10,3,1,#ffd27a|b4,8,8,16,$|r5,10,6,2,$l|r6,7,4,2,$d'],
  bust: [14, '', 'o8,5,4,#f4f2ee|r6,4,1,1,#c8c0c8|r9,4,1,1,#c8c0c8|b4,9,8,5,#e8e3dc|b3,14,10,16,#d8d0d8|r4,15,8,1,#f4f2ee'],
  discoBall: [16, '', 'r7,0,2,4,#a8a0b8|o8,9,5,#c8c0d0|f5,7,2,2,#ffffff|f10,10,2,2,#ffffff|r7,6,2,2,#f4a6c8|r9,12,2,1,#9db4ee|r7,14,2,14,#5a5070|r4,28,8,3,#5a5070'],
  neonHeart: [12, '#f48a8a', 'b1,0,14,16,#3a3448|r4,4,2,2,$|r10,4,2,2,$|r3,6,10,2,$|r4,8,8,2,$|r6,10,4,2,$|r7,12,2,1,$|r7,16,2,10,#5a5070|r4,26,8,2,#5a5070'],
  ovalRug: [0, '#ffd27a', 'b6,3,36,26,$|b2,7,44,18,$|r7,4,34,24,$|r3,8,42,16,$|r10,8,28,16,$l|h24,14,$'],
  runnerRug: [0, '#f4a6b8', 'b2,1,12,46,$|r4,3,8,42,$l|h8,10,$|h8,22,$|h8,34,$'],
  fairyJar: [0, '', 'b4,4,8,10,#d4f0fb|r5,3,6,1,#d9a06a|f6,7,1,1,#ffd34d|f9,9,1,1,#f4a6c8|f7,11,1,1,#ffd34d|f10,6,1,1,#9db4ee'],
  snowGlobe: [0, '', 'o8,7,5,#d4f0fb|r6,8,4,3,#8fd0a8|f5,4,1,1,#ffffff|f10,6,1,1,#ffffff|f8,3,1,1,#ffffff|b3,11,10,3,#b07a4e'],
  hourglass: [0, '', 'r4,2,8,1,#b07a4e|r4,13,8,1,#b07a4e|r5,3,6,3,#d4f0fb|r7,6,2,2,#d4f0fb|r5,8,6,5,#d4f0fb|r6,4,4,1,#ffd27a|r6,10,4,3,#ffd27a|f7,7,1,2,#ffd27a'],
  floorCandle: [10, '', 'b3,6,4,14,#fffaf3|b9,10,4,10,#fff4e6|f4,3,1,3,#ffd34d|f10,7,1,3,#ffd34d|r2,20,12,2,#d9a06a'],
  bigTeddy: [10, '#d9a87a', 'o4,2,2,$|o12,2,2,$|o8,8,6,$|d8,10,2,$l|r6,7,1,1,O|r10,7,1,1,O|r8,9,1,1,O|o8,20,6,$|d8,21,3,$l|o3,24,2,$|o13,24,2,$|r7,13,3,1,#f48a8a'],
  birdcage: [16, '', 'r7,0,2,3,#ffd34d|r3,4,10,1,#ffd34d|r3,4,1,18,#ffd34d|r6,4,1,18,#ffd34d|r9,4,1,18,#ffd34d|r12,4,1,18,#ffd34d|r2,22,12,2,#ffd34d|o8,13,2,#7fb2e8|r10,13,1,1,#f28a3a|r7,24,2,6,#a8a0b8|r4,30,8,2,#a8a0b8'],
  sculpture: [12, '#b89af0', 'o6,6,4,$|o11,11,3,$l|r7,10,3,6,$d|b4,16,8,4,#e8e3dc|b3,20,10,8,#fffaf3'],
  standingDesk: [10, '#fffaf3', 'b9,0,14,7,#3a3448|r10,1,12,4,#7fb2e8|b0,6,32,5,$|r3,11,3,15,#5a5070|r26,11,3,15,#5a5070|r1,24,30,2,#5a5070'],
  draftingTable: [10, '#d9a06a', 'r4,10,2,16,$D|r26,10,2,16,$D|r4,20,24,2,$D|b1,2,30,10,#fffaf3|r3,4,26,6,#cfe1f7|r6,6,12,1,#7fb2e8|r8,8,8,1,#7fb2e8|r22,3,1,7,#f48a8a'],
  filingCabinet: [10, '#b8b0c0', 'b1,0,14,26,$|r2,8,12,1,$D|r2,17,12,1,$D|r6,4,4,1,O|r6,12,4,1,O|r6,21,4,1,O'],
  whiteboard: [18, '', 'b0,0,32,20,#e8e3dc|r2,2,28,16,#ffffff|r4,5,10,1,#7fb2e8|r4,8,14,1,#7fb2e8|r20,5,6,6,#f48a8a|r21,6,4,4,#ffffff|r3,20,2,14,#a8a0b8|r27,20,2,14,#a8a0b8|r2,19,28,1,#a8a0b8'],
  printer: [0, '', 'r4,4,8,3,#fffaf3|b2,6,12,8,#e8e3dc|r3,9,10,1,#a8a0b8|f11,7,1,1,#8fd0a8|r4,12,8,2,#fffaf3'],
  laptop: [0, '#b8b0c0', 'b3,3,10,8,$|r4,4,8,6,#7fb2e8|h8,6,#fffaf3|b2,10,12,4,$l'],
  monitor: [0, '', 'b2,1,12,9,#3a3448|r3,2,10,7,#8fc4f0|r4,3,4,1,#fffaf3|r7,10,2,3,#5a5070|r5,13,6,1,#5a5070'],
  pencilCup: [0, '', 'r6,4,1,5,#ffd34d|r8,3,1,6,#7fb2e8|r10,5,1,4,#8fd0a8|r6,3,1,1,#f48a8a|b5,8,6,6,#f4a6b8'],
  bubbleTea: [0, '', 'r8,1,1,5,#f48a8a|b5,5,6,9,#f2d8c0|r6,10,4,3,#5a3a2a|r6,11,1,1,#3a2633|r8,12,1,1,#3a2633|r5,5,6,1,#fffaf3'],
  orangeJuice: [0, '', 'r9,2,1,4,#8fd0a8|b5,5,6,9,#ffd27a|r6,6,4,2,#fff3b0|o12,6,2,#f28a3a'],
  harp: [18, '', 'r2,2,2,30,#d9a628|r2,2,10,2,#d9a628|r11,4,2,4,#d9a628|r12,8,1,24,#d9a628|r4,6,1,24,#fff4e6|r6,6,1,24,#fff4e6|r8,7,1,24,#fff4e6|r10,8,1,23,#fff4e6|r1,31,14,3,#b07a4e'],
  violin: [8, '', 'r3,4,1,18,#5a5070|r12,4,1,18,#5a5070|r3,20,10,1,#5a5070|r7,0,2,6,#5a3620|o8,9,3,#c88a4a|o8,14,4,#c88a4a|r8,8,1,8,#fff4e6'],
  microphone: [14, '', 'o8,2,2,#5a5070|r7,4,2,4,#3a3448|r7,8,1,20,#a8a0b8|r4,28,8,2,#a8a0b8|f11,0,1,2,#f4a6c8|f13,2,1,2,#f4a6c8'],
  sewingTable: [8, '', 'b0,8,16,6,#d9a06a|r2,14,1,10,#8a5a3c|r13,14,1,10,#8a5a3c|b2,1,11,8,#fffaf3|r3,2,8,2,#f4a6b8|r10,6,2,4,#a8a0b8|b6,7,3,2,#9db4ee'],
  potteryWheel: [6, '', 'b1,10,14,12,#7fb2e8|r2,8,12,3,#a8a0b8|o8,6,3,#c8805a|r6,2,4,4,#d9906a|r7,1,2,1,#e8a07a'],
  typewriter: [0, '', 'r4,2,8,4,#fffaf3|b2,5,12,6,#7a9a8a|r3,10,10,4,#5a7a6a|r4,11,1,1,#fffaf3|r6,11,1,1,#fffaf3|r8,11,1,1,#fffaf3|r10,11,1,1,#fffaf3|r12,7,2,1,#a8a0b8'],
  tripod: [14, '', 'b3,0,10,7,#3a3448|o8,3,2,#7fb2e8|r12,1,1,1,#f48a8a|r7,7,2,4,#5a5070|r7,11,1,17,#a8a0b8|r3,26,1,4,#a8a0b8|r12,26,1,4,#a8a0b8|r4,24,8,1,#a8a0b8'],
  craftTable: [8, '#f0d2a8', 'b0,6,32,8,$|r2,14,2,10,$D|r28,14,2,10,$D|b3,2,7,5,#f48a8a|b11,3,6,4,#9db4ee|r19,4,8,1,#ffd27a|r19,6,6,1,#8fd0a8|d27,3,2,#b89af0'],
  loom: [14, '', 'r2,0,2,30,#b07a4e|r28,0,2,30,#b07a4e|r2,2,28,2,#b07a4e|r4,4,24,12,#fff4e6|r4,6,24,2,#f48a8a|r4,10,24,2,#9db4ee|r4,14,24,2,#ffd27a|r2,18,28,2,#b07a4e'],
  saxophone: [12, '', 'r6,0,2,4,#3a3448|r7,3,2,14,#ffd34d|o9,19,3,#ffd34d|r10,14,3,4,#ffd34d|r8,8,1,1,#fff3b0|r8,11,1,1,#fff3b0|r4,24,8,2,#5a5070'],
  chessTable: [6, '#b07a4e', 'r7,12,2,8,$D|r4,20,8,2,$D|b0,2,16,10,$|r2,4,12,6,#fffaf3|r2,4,3,3,#3a3448|r8,4,3,3,#3a3448|r5,7,3,3,#3a3448|r11,7,3,3,#3a3448|r4,0,1,4,#3a3448|r10,1,1,3,#fffaf3'],
  airHockey: [6, '', 'r3,16,3,6,#5a5070|r26,16,3,6,#5a5070|b0,2,32,14,#7fb2e8|r2,4,28,10,#ffffff|r15,4,1,10,#f48a8a|o6,9,2,#f48a8a|o26,9,2,#ffd34d|s14,8,3,2,#3a3448'],
  pinball: [14, '#f48a8a', 'b1,0,14,10,#3a3448|f3,2,10,6,#ffd27a|b0,9,16,14,$|r2,11,12,10,#2b2530|o5,14,1,#ffd34d|o11,16,1,#7fb2e8|f8,18,1,1,#ffffff|r2,23,2,7,#5a5070|r12,23,2,7,#5a5070'],
  clawMachine: [20, '#b89af0', 'b0,0,16,6,$|f3,2,10,2,#ffd27a|b0,5,16,16,#d4f0fb|r7,6,1,4,#a8a0b8|r6,10,3,1,#a8a0b8|o4,17,2,#f48a8a|o9,18,2,#ffd27a|o13,17,2,#8fd0a8|b0,20,16,16,$|r6,24,4,4,#3a3448'],
  dartboard: [16, '', 'r7,14,2,14,#8a5a3c|r4,28,8,2,#8a5a3c|o8,7,6,#3a3448|d8,7,5,#fff4e6|d8,7,3,#f48a8a|d8,7,1,#3a3448|r9,4,3,1,#ffd34d'],
  pingPong: [6, '', 'r3,30,3,6,#3a3448|r42,30,3,6,#3a3448|b0,2,48,28,#4f8ac0|r2,4,44,24,#5a9ad0|r23,4,1,24,#ffffff|r0,15,48,1,#e8e3dc|r22,0,4,32,#fffaf3|o12,10,2,#f48a8a|o36,20,2,#e06a5a|d30,12,1,#ffffff'],
  boardGame: [0, '', 'b2,8,12,6,#fffaf3|r3,9,5,2,#f48a8a|r8,11,5,2,#7fb2e8|r5,6,2,3,#8fd0a8|r10,5,2,4,#ffd27a|r12,12,1,1,O'],
  puzzleTable: [4, '#d9a06a', 'r3,12,2,10,$D|r27,12,2,10,$D|b0,2,32,10,$|r3,4,20,6,#9db4ee|r3,4,8,3,#8fd0a8|r14,7,9,3,#ffd27a|r24,5,3,3,#f48a8a|r27,7,2,2,#b89af0'],
  ballPit: [0, '#9db4ee', 'b0,2,32,30,$|r2,4,28,26,$l|d6,8,2,#f48a8a|d12,10,2,#ffd27a|d20,8,2,#8fd0a8|d26,12,2,#b89af0|d8,16,2,#7fb2e8|d16,18,2,#f48a8a|d24,20,2,#ffd27a|d10,24,2,#8fd0a8|d20,26,2,#f4a6c8'],
  bowling: [6, '', 'r6,2,2,8,#ffffff|r9,4,2,8,#ffffff|r12,2,2,8,#ffffff|r6,4,2,1,#f48a8a|r9,6,2,1,#f48a8a|r12,4,2,1,#f48a8a|b5,12,10,3,#d9a06a|o3,18,3,#3a3448'],
  rockingHorse: [10, '#fffaf3', 'b10,0,6,7,$|r14,3,1,1,O|r9,0,2,10,#f48a8a|b2,6,12,8,$|r1,7,2,4,#f48a8a|r4,14,1,6,$d|r11,14,1,6,$d|r0,20,16,2,#b07a4e'],
  vrHeadset: [0, '', 'b2,7,12,6,#3a3448|r3,8,4,3,#7fb2e8|r9,8,4,3,#7fb2e8|r1,9,1,2,#5a5070|r14,9,1,2,#5a5070|f7,6,2,1,#8fd0a8'],
  gamerBeanbag: [4, '', 'o8,10,7,#3a3448|d8,12,4,#2b2530|r3,6,10,1,#f48a8a|r4,8,8,1,#7fb2e8|d6,6,2,#4a4458'],
  karaoke: [12, '#f4a6b8', 'r12,0,1,9,#a8a0b8|o12,1,2,#5a5070|b1,8,14,18,$|o8,16,4,#3a3448|d8,16,2,#5a5070|r3,10,10,2,#2b2530|f4,10,3,1,#8fd0a8|f9,10,3,1,#ffd27a'],
  retroTV: [12, '#b07a4e', 'r4,0,1,5,#3a3448|r11,0,1,5,#3a3448|b0,4,16,16,$|b2,6,10,11,#2b2530|f3,7,8,9,#8fc4f0|r13,8,2,2,#ffd27a|r13,12,2,2,#f48a8a|r3,20,2,8,$D|r11,20,2,8,$D'],
  yogaMat: [0, '#b89af0', 'b1,6,14,9,$|r2,7,12,1,$l|o14,7,2,$d'],
  rowingMachine: [4, '', 'r1,14,30,2,#5a5070|b2,6,10,6,#3a3448|o6,9,3,#7fb2e8|b14,10,8,3,#2b2530|r24,6,6,2,#a8a0b8|r26,8,2,8,#5a5070'],
  kettlebells: [4, '#f48a8a', 'r2,17,12,2,#7a7090|o5,12,3,#3a3448|r3,7,5,2,#3a3448|o11,13,3,$|r9,8,5,2,$'],
  pullUpBar: [20, '', 'r1,0,2,36,#5a5070|r13,0,2,36,#5a5070|r1,2,14,2,#a8a0b8|r0,34,4,2,#5a5070|r12,34,4,2,#5a5070'],
  weightBench: [10, '', 'r2,0,2,22,#5a5070|r28,0,2,22,#5a5070|r0,4,32,2,#a8a0b8|b0,1,4,8,#3a3448|b28,1,4,8,#3a3448|b6,12,22,5,#f48a8a|r8,17,2,8,#5a5070|r24,17,2,8,#5a5070'],
  stepper: [8, '', 'r2,0,12,2,#a8a0b8|r3,2,1,14,#a8a0b8|r12,2,1,14,#a8a0b8|b2,14,12,6,#3a3448|b3,12,4,3,#8fd0a8|b9,14,4,3,#8fd0a8|r1,20,14,2,#5a5070'],
  jumpRope: [0, '', 'r2,14,12,1,#7a7090|r2,4,2,4,#f48a8a|r12,4,2,4,#f48a8a|r3,8,1,4,#ffd27a|r12,8,1,4,#ffd27a|r4,12,8,1,#ffd27a'],
  balanceBoard: [0, '#d9a06a', 'o8,13,2,#5a5070|b0,8,16,4,$|r2,9,12,1,$l'],
  foamRoller: [0, '#7fb2e8', 'b1,7,14,7,$|r2,8,12,1,$l|r4,7,1,7,$d|r8,7,1,7,$d|r12,7,1,7,$d'],
  speedBag: [16, '', 'b0,0,16,4,#8a5a3c|r7,4,2,2,#a8a0b8|o8,9,3,#f48a8a|r7,6,1,1,#ffffff|r7,13,2,19,#5a5070|r3,30,10,2,#5a5070'],
  climbingWall: [24, '', 'b0,0,32,40,#c8b8a8|o5,5,2,#f48a8a|o14,9,2,#7fb2e8|o24,4,2,#ffd27a|o9,17,2,#8fd0a8|o22,15,2,#b89af0|o6,27,2,#ffd27a|o18,25,2,#f48a8a|o27,30,2,#7fb2e8'],
  elliptical: [14, '', 'r3,0,2,18,#5a5070|r11,0,2,18,#5a5070|b4,2,8,4,#3a3448|f6,3,4,1,#8fd0a8|o8,22,5,#7a7090|d8,22,3,#5a5070|r1,28,14,2,#5a5070'],
  hulaHoop: [4, '', 'r4,7,8,1,#ffd27a|r2,8,12,1,#f48a8a|r1,9,1,7,#f48a8a|r14,9,1,7,#f48a8a|r2,16,12,1,#f48a8a|r4,17,8,1,#ffd27a'],
  medicineBalls: [2, '', 'o12,10,3,#7a7090|r10,9,4,1,#ffd27a|o5,13,4,#3a3448|r2,12,6,1,#f48a8a'],
  boxingDummy: [16, '', 'o8,30,4,#3a3448|r7,22,2,6,#5a5070|b4,6,8,16,#e06a5a|r3,8,10,2,#3a3448|o8,3,3,#f2c48a'],
  scratchPost: [10, '#f4a6b8', 'r6,4,4,18,#e8d3b0|r6,7,4,1,#c8a878|r6,11,4,1,#c8a878|r6,15,4,1,#c8a878|r6,19,4,1,#c8a878|b1,21,14,5,$|b2,0,12,4,$'],
  hamsterWheel: [8, '', 'r7,3,2,14,#c8c0d0|r3,18,10,4,#7fb2e8|o8,10,8,#a8a0b8|d8,10,7,#e8f6ff|s5,10,6,1,#a8a0b8'],
  birdPerch: [16, '', 'r7,4,2,24,#b07a4e|r2,2,12,2,#b07a4e|o12,6,2,#8fd0a8|r4,28,8,4,#8a5a3c'],
  petTent: [8, '#f4a6b8', 'r7,0,2,4,$d|r6,2,4,2,$|r4,4,8,2,$|r3,6,10,2,$|r2,8,12,2,$|r1,10,14,2,$|r0,12,16,10,$|r6,14,4,8,#3a2633|r0,22,16,2,#fffaf3'],
  petSofa: [4, '#9db4ee', 'b1,0,14,9,$d|b0,6,4,12,$|b12,6,4,12,$|b3,8,10,8,$l|r2,18,2,2,O|r12,18,2,2,O'],
  foodBowl: [0, '#f48a8a', 'b3,10,10,4,$|r4,9,8,2,#c8805a|r5,8,2,1,#a8603a|r9,8,2,1,#a8603a'],
  fountain: [0, '', 'b3,9,10,5,#cfe1f7|r5,8,6,2,#7fb2e8|r7,4,2,4,#fffaf3|f6,3,1,1,#7fb2e8|f9,2,1,1,#7fb2e8'],
  toyMouse: [0, '', 'b5,10,6,4,#b8b0c0|r3,12,2,1,#f4a6b8|r9,11,1,1,O|r6,9,2,1,#f4a6b8'],
  chewBone: [0, '', 'r5,11,6,2,#fff4e6|o4,10,1,#fff4e6|o4,13,1,#fff4e6|o12,10,1,#fff4e6|o12,13,1,#fff4e6'],
  petTunnel: [2, '#ffd27a', 'b0,4,32,14,$|r2,6,28,1,$l|r8,4,1,14,$d|r16,4,1,14,$d|r24,4,1,14,$d|o3,11,5,#3a2633'],
  petStairs: [8, '#d9b48a', 'b10,0,6,24,$|b5,8,6,16,$l|b0,16,6,8,$'],
  sandbox: [0, '', 'b0,4,16,12,#b07a4e|r2,6,12,8,#f2dca0|r4,8,3,2,#f48a8a|r10,10,2,3,#7fb2e8'],
  treatJar: [0, '', 'b4,4,8,10,#d4f0fb|r5,2,6,2,#f4a6b8|r6,8,4,2,#c8805a|r7,11,3,1,#c8805a'],
  petBasket: [2, '#f4a6b8', 'r4,2,1,4,#c8a078|r11,2,1,4,#c8a078|r4,1,8,1,#c8a078|b0,6,16,10,#d9b48a|r1,8,14,1,#c8a078|r1,11,14,1,#c8a078|b2,4,12,5,$'],
  petHammock: [6, '#8fd0a8', 'r0,0,2,20,#b07a4e|r14,0,2,20,#b07a4e|b2,8,12,6,$|r3,9,10,1,$l|r1,18,14,2,#b07a4e'],
  agility: [6, '', 'r1,0,2,22,#f48a8a|r13,0,2,22,#f48a8a|r1,8,14,2,#ffffff|r3,8,2,2,#7fb2e8|r9,8,2,2,#7fb2e8|r0,20,4,2,#5a5070|r12,20,4,2,#5a5070'],
  ghost: [10, '', 'b2,0,12,18,#fffaf3|r2,18,2,2,#fffaf3|r6,18,2,2,#fffaf3|r10,18,2,2,#fffaf3|r5,6,2,2,O|r9,6,2,2,O|r7,10,2,2,O|r3,9,2,1,#f4a6c8|r11,9,2,1,#f4a6c8'],
  cauldron: [6, '', 'f5,4,2,2,#8fd0a8|f10,2,2,2,#b8f0c8|o8,14,7,#3a3448|r1,8,14,3,#3a3448|r2,8,12,2,#8fd0a8|r2,20,2,2,#3a3448|r12,20,2,2,#3a3448'],
  tombstone: [8, '', 'r0,20,16,4,#6cbf7a|b2,0,12,22,#a8a0b8|r3,1,10,2,#c8c0d0|r7,4,2,5,#7a7090|r5,6,6,1,#7a7090|r4,12,8,1,#7a7090'],
  scarecrow: [18, '', 'r7,8,2,26,#8a5a3c|r1,12,14,2,#8a5a3c|b4,12,8,10,#7fb2e8|r3,22,2,3,#ffd34d|r11,22,2,3,#ffd34d|o8,5,4,#f2dca0|r4,0,8,3,#b07a4e|r2,2,12,1,#b07a4e|r6,4,1,1,O|r9,4,1,1,O'],
  candyBowl: [0, '', 'd5,8,1,#f48a8a|d8,7,1,#8fd0a8|d11,8,1,#ffd27a|b2,9,12,5,#f28a3a|r4,10,8,1,#fffaf3'],
  gingerbread: [0, '', 'b3,7,10,7,#c8805a|r4,4,8,1,#fffaf3|r3,5,10,2,#fffaf3|r2,7,12,1,#fffaf3|r7,10,2,4,#8a5a3c|d5,9,1,#f48a8a|d11,9,1,#8fd0a8'],
  menorah: [0, '', 'r2,6,1,4,#ffd34d|r4,6,1,4,#ffd34d|r6,6,1,4,#ffd34d|r8,4,1,6,#ffd34d|r10,6,1,4,#ffd34d|r12,6,1,4,#ffd34d|r2,10,11,1,#ffd34d|r7,11,2,3,#ffd34d|f2,4,1,2,#f28a3a|f4,4,1,2,#f28a3a|f8,2,1,2,#f28a3a|f12,4,1,2,#f28a3a'],
  snowflakeLamp: [12, '', 'r7,12,2,14,#a8a0b8|r4,26,8,2,#a8a0b8|r7,0,2,12,#cfeaf5|r2,5,12,2,#cfeaf5|r3,1,2,2,#cfeaf5|r11,1,2,2,#cfeaf5|r3,9,2,2,#cfeaf5|r11,9,2,2,#cfeaf5|f7,5,2,2,#ffffff'],
  eggBasket: [0, '', 'r4,7,8,1,#c8a078|o5,9,2,#f4a6c8|o8,8,2,#9db4ee|o11,9,2,#ffd27a|b2,10,12,4,#d9b48a'],
  heartBalloon: [20, '', 'r6,8,1,24,#e8e3dc|r11,11,1,21,#e8e3dc|r4,4,4,3,#f48a8a|h5,2,#f48a8a|r10,7,4,3,#f4a6c8|h11,5,#f4a6c8|b4,30,8,4,#fffaf3'],
  clover: [6, '', 'r7,6,2,8,#4f9a6a|o5,4,2,#6cbf7a|o11,4,2,#6cbf7a|o5,9,2,#6cbf7a|o11,9,2,#6cbf7a|b3,13,10,9,#ffd27a'],
  partyBalloons: [20, '', 'r4,7,1,24,#e8e3dc|r8,11,1,20,#e8e3dc|r11,6,1,25,#e8e3dc|o4,4,3,#7fb2e8|o11,3,3,#ffd27a|o8,8,3,#f48a8a|b3,30,10,4,#b89af0'],
  lanternString: [16, '', 'r1,0,1,32,#8a5a3c|r14,0,1,32,#8a5a3c|r1,2,14,1,#3a3448|o4,6,2,#f48a8a|o8,7,2,#ffd27a|o12,6,2,#f48a8a|f4,6,1,1,#fff3b0|f8,7,1,1,#fff3b0|f12,6,1,1,#fff3b0'],
  diya: [0, '', 'f7,6,2,4,#ffd34d|f7,7,1,2,#fff3b0|b3,10,10,4,#c8805a|r5,11,6,1,#f2b48a'],
  sleigh: [8, '#e06a5a', 'r0,22,32,2,#ffd34d|r1,20,1,2,#ffd34d|r29,18,2,4,#ffd34d|b2,0,8,14,$|b2,8,28,12,$|r4,10,24,2,#ffd34d|b20,4,8,6,#4f9a6a|h24,6,#ffd34d'],
  reindeer: [10, '', 'r3,0,1,4,#b07a4e|r12,0,1,4,#b07a4e|r2,0,2,1,#b07a4e|r12,0,2,1,#b07a4e|o8,18,6,#c8966a|d8,19,3,#e8d3b0|o8,6,4,#c8966a|r6,5,1,1,O|r9,5,1,1,O|d8,8,1,#f48a8a'],
  // ---- festivals ----
  rangoli: [0, '', 'o16,16,13,#f48a8a|d16,16,10,#ffd27a|d16,16,7,#8fd0a8|d16,16,4,#b89af0|d16,16,1,#fffaf3|o16,4,2,#7fb2e8|o16,28,2,#7fb2e8|o4,16,2,#7fb2e8|o28,16,2,#7fb2e8|d8,8,2,#f28a3a|d24,8,2,#f28a3a|d8,24,2,#f28a3a|d24,24,2,#f28a3a'],
  skyLantern: [16, '', 'r12,0,2,32,#8a5a3c|r6,1,8,1,#8a5a3c|r7,2,1,3,#3a3448|b3,5,9,9,#f28a3a|r5,7,5,5,#ffd27a|f6,8,3,3,#fff3b0|r4,14,1,6,#f48a8a|r7,14,1,8,#f48a8a|r10,14,1,6,#f48a8a|b9,29,7,3,#8a5a3c'],
  mithaiBox: [0, '', 'b2,7,12,7,#f4a6c8|r2,10,12,1,#ffd34d|o5,5,1,#ffd27a|o8,4,1,#fffaf3|o11,5,1,#f28a3a'],
  sparklers: [2, '', 'b3,9,10,9,#e06a5a|r3,12,10,1,#ffd34d|r5,1,1,8,#a8a0b8|r8,0,1,9,#a8a0b8|r11,2,1,7,#a8a0b8|f4,0,3,2,#fff3b0|f7,0,3,1,#ffd34d|f10,1,3,2,#fff3b0|f8,1,1,1,#ffffff'],
  gulal: [0, '', 'r1,12,14,2,#e8e3dc|o4,10,2,#f48a8a|o11,10,2,#8fd0a8|o8,7,2,#ffd27a|o8,11,2,#b89af0'],
  colourRug: [0, '', 'd6,8,5,#f48a8a|d14,6,4,#ffd27a|d20,9,5,#8fd0a8|d27,7,4,#b89af0|d11,11,3,#7fb2e8|d24,12,2,#f4a6c8|d3,3,1,#ffd27a|d29,13,1,#f48a8a'],
  dandiya: [0, '', 'r3,3,2,11,#e06a5a|r11,3,2,11,#ffd34d|r3,5,2,1,#ffd34d|r3,9,2,1,#8fd0a8|r11,6,2,1,#e06a5a|r11,10,2,1,#8fd0a8|r2,13,4,1,#fffaf3|r10,13,4,1,#fffaf3'],
  garbaLamp: [4, '', 'f7,0,2,3,#ffd34d|r6,3,4,2,#a8603a|o8,11,6,#c8805a|r3,11,10,1,#f48a8a|f5,8,1,1,#ffd34d|f10,8,1,1,#ffd34d|f8,9,1,1,#fff3b0|f5,13,1,1,#fff3b0|f11,13,1,1,#ffd34d'],
  marigold: [16, '', 'r1,0,1,32,#8a5a3c|r14,0,1,32,#8a5a3c|r1,1,14,1,#8a5a3c|o4,5,2,#f28a3a|o8,7,2,#ffd34d|o12,5,2,#f28a3a|r4,8,1,4,#4f9a6a|r8,10,1,4,#4f9a6a|r12,8,1,4,#4f9a6a|o4,13,1,#ffd34d|o12,13,1,#ffd34d'],
  modak: [0, '', 'r1,12,14,2,#e8e3dc|o4,10,2,#fffaf3|o8,9,2,#fffaf3|o12,10,2,#fffaf3|r4,7,1,1,#f2c48a|r8,6,1,1,#f2c48a|r12,7,1,1,#f2c48a'],
  kite: [14, '#f4a6b8', 'r7,14,2,16,#8a5a3c|b4,28,8,2,#8a5a3c|r6,0,4,1,O|r5,1,6,1,O|r4,2,8,1,O|r3,3,10,1,O|r2,4,12,2,O|r3,6,10,1,O|r4,7,8,1,O|r5,8,6,1,O|r6,9,4,1,O|r7,10,2,1,O|r7,1,2,1,$|r6,2,4,1,$|r5,3,6,1,$|r3,4,10,2,$|r5,6,6,1,$d|r6,7,4,1,$d|r7,8,2,1,$d|r8,1,1,8,$l|r8,11,1,3,#e8e3dc|r9,12,2,1,#f48a8a|r6,13,2,1,#8fd0a8'],
  pongalPot: [4, '', 'r1,0,1,20,#8fd0a8|r14,0,1,20,#8fd0a8|r1,0,1,1,#4f9a6a|r14,0,1,1,#4f9a6a|o8,13,6,#c8805a|r4,7,8,2,#fffaf3|o6,6,1,#fffaf3|o10,5,1,#fffaf3|r3,12,10,1,#ffd34d|r4,15,8,1,#f48a8a'],
  bonfire: [2, '', 'r1,15,14,3,#8a5a3c|r3,13,10,2,#b07a4e|r2,14,4,1,#6a4a32|r10,14,4,1,#6a4a32|r4,6,8,7,#f28a3a|r6,3,4,10,#ffd34d|f5,4,2,4,#ffd34d|f9,2,2,4,#f28a3a|f7,7,2,4,#fff3b0'],
  pookalam: [0, '', 'o16,16,13,#f28a3a|d16,16,11,#ffd34d|d16,16,9,#f48a8a|d16,16,7,#fffaf3|d16,16,5,#b89af0|d16,16,3,#ffd34d|d16,16,1,#e06a5a|d16,4,1,#4f9a6a|d16,28,1,#4f9a6a|d4,16,1,#4f9a6a|d28,16,1,#4f9a6a'],
  dhol: [0, '', 'b1,5,14,9,#e06a5a|r1,7,14,1,#ffd34d|r1,11,14,1,#ffd34d|r3,5,1,9,#8a5a3c|r12,5,1,9,#8a5a3c|r0,5,1,9,#fffaf3|r15,5,1,9,#fffaf3'],
  rakhiThali: [0, '', 'o8,10,6,#ffd34d|r4,10,8,1,#f2c48a|o5,9,1,#f48a8a|o11,9,1,#e06a5a|r7,7,2,3,#c8805a|f7,5,2,2,#ffd34d'],
  dahiHandi: [16, '', 'r1,0,1,32,#8a5a3c|r14,0,1,32,#8a5a3c|r1,1,14,1,#8a5a3c|r8,2,1,5,#3a3448|o8,12,5,#c8805a|r4,8,9,2,#fffaf3|r3,12,10,1,#f48a8a|r5,15,6,1,#ffd34d'],
  indianFlag: [14, '', 'r2,0,1,28,#a8a0b8|r3,1,11,3,#f28a3a|r3,4,11,3,#fffaf3|r3,7,11,3,#4f9a6a|r7,4,3,3,#3a6ab8|r8,5,1,1,#fffaf3|b0,27,6,3,#a8a0b8'],
  tricolourBalloons: [20, '', 'r4,7,1,24,#e8e3dc|r8,11,1,20,#e8e3dc|r11,6,1,25,#e8e3dc|o4,4,3,#f28a3a|o11,3,3,#4f9a6a|o8,8,3,#fffaf3|b3,30,10,4,#7fb2e8'],
  eidLantern: [6, '', 'r7,0,2,2,#ffd34d|r5,2,6,2,#ffd34d|b3,4,10,12,#4f9a6a|r5,6,6,8,#ffd27a|f6,7,4,6,#fff3b0|r7,6,2,8,#4f9a6a|b4,16,8,3,#ffd34d|r3,19,10,2,#c8a040'],
  crescentLamp: [12, '', 'r7,16,2,10,#a8a0b8|b4,26,8,2,#a8a0b8|o8,8,7,#3a4280|d8,8,5,#ffd34d|d10,7,5,#3a4280|f12,4,1,1,#fff3b0|f4,13,1,1,#fff3b0|r13,10,1,1,#fff3b0'],
  datesPlate: [0, '', 'r1,12,14,2,#e8e3dc|o4,10,2,#8a5a3c|o8,9,2,#a8603a|o12,10,2,#8a5a3c|r3,9,1,1,#c8805a|r7,8,1,1,#c8805a'],
  sheerKhurma: [0, '', 'b2,8,12,6,#fffaf3|r3,8,10,2,#f2dca0|r5,8,1,1,#8a5a3c|r9,9,1,1,#8fd0a8|r7,8,1,1,#c8a078|r1,13,14,1,#e8e3dc'],
  prayerMat: [0, '', 'b2,1,12,30,#4f9a6a|r4,3,8,26,#6cbf7a|r6,5,4,6,#ffd34d|r7,4,2,1,#ffd34d|r5,14,6,1,#ffd34d|r5,24,6,1,#ffd34d|r2,29,12,1,#ffd34d'],
  greenBunting: [16, '', 'r1,0,1,32,#8a5a3c|r14,0,1,32,#8a5a3c|r1,2,14,1,#3a3448|r2,3,3,3,#4f9a6a|r3,6,1,1,#4f9a6a|r6,3,3,3,#fffaf3|r7,6,1,1,#fffaf3|r10,3,3,3,#4f9a6a|r11,6,1,1,#4f9a6a|o8,12,2,#ffd34d|r9,11,2,2,#4f9a6a'],
  biryaniPot: [0, '', 'o8,10,5,#a8a0b8|r3,6,10,2,#ffd27a|o6,6,1,#f28a3a|o10,5,1,#fffaf3|r3,9,10,1,#8a8098|r2,9,1,2,#8a8098|r13,9,1,2,#8a8098'],
  stocking: [0, '#e06a5a', 'b5,1,6,10,$|b5,8,9,6,$|r5,1,6,3,#fffaf3|r12,10,2,3,#fffaf3|r6,5,4,1,$d'],
  wreath: [12, '', 'r7,16,2,10,#8a5a3c|b4,26,8,2,#8a5a3c|d8,2,2,#4f9a6a|d12,4,2,#4f9a6a|d14,8,2,#4f9a6a|d12,12,2,#4f9a6a|d8,14,2,#4f9a6a|d4,12,2,#4f9a6a|d2,8,2,#4f9a6a|d4,4,2,#4f9a6a|d8,2,1,#6cbf7a|d14,8,1,#6cbf7a|d2,8,1,#6cbf7a|o12,4,1,#e06a5a|o4,12,1,#e06a5a|r6,13,4,3,#e06a5a'],
  candyCane: [14, '', 'r6,0,5,2,#e06a5a|r11,1,2,5,#fffaf3|r11,4,2,2,#e06a5a|r4,1,2,3,#fffaf3|r6,2,3,28,#fffaf3|r6,6,3,2,#e06a5a|r6,12,3,2,#e06a5a|r6,18,3,2,#e06a5a|r6,24,3,2,#e06a5a|b3,28,9,2,#a8a0b8'],
  batGarland: [16, '', 'r1,0,1,32,#3a3448|r14,0,1,32,#3a3448|r1,2,14,1,#3a3448|r5,3,1,3,#a8a0b8|r10,3,1,8,#a8a0b8|r1,6,9,1,#3a3448|r2,7,7,1,#3a3448|r4,5,3,3,#3a3448|r1,5,1,1,#3a3448|r9,5,1,1,#3a3448|f5,6,1,1,#ffd34d|r6,12,8,1,#3a3448|r7,13,6,1,#3a3448|r9,11,3,3,#3a3448|r6,11,1,1,#3a3448|r13,11,1,1,#3a3448|f10,12,1,1,#ffd34d'],
  witchHat: [0, '', 'r1,12,14,2,#3a3448|b4,6,8,7,#3a3448|b5,3,6,4,#3a3448|r9,1,3,2,#3a3448|r4,10,8,2,#b89af0|r7,10,2,2,#ffd34d'],
  easterBunny: [6, '', 'o8,15,5,#fffaf3|o8,8,4,#fffaf3|r5,0,2,6,#fffaf3|r9,0,2,6,#fffaf3|r4,0,1,5,O|r7,0,1,5,O|r8,0,1,5,O|r11,0,1,5,O|r6,1,1,3,#f4a6c8|r9,1,1,3,#f4a6c8|r6,8,1,1,O|r9,8,1,1,O|d8,10,1,#f4a6c8|o12,17,2,#fffaf3'],
  easterLilies: [4, '', 'b4,12,8,8,#c8805a|r5,13,6,1,#e8a070|r7,5,1,7,#4f9a6a|r10,6,1,6,#4f9a6a|r4,7,1,5,#4f9a6a|o7,4,2,#fffaf3|o11,5,2,#fffaf3|o4,6,2,#fffaf3|r7,4,1,1,#ffd34d|r11,5,1,1,#ffd34d|r4,6,1,1,#ffd34d'],
  hotCrossBuns: [0, '', 'r1,12,14,2,#e8e3dc|o4,10,3,#d9a06a|o11,10,3,#d9a06a|r2,10,5,1,#fffaf3|r4,8,1,5,#fffaf3|r9,10,5,1,#fffaf3|r11,8,1,5,#fffaf3'],
  lotusLamp: [0, '', 'r4,13,8,1,#8fd0a8|r3,10,10,3,#f4a6c8|r2,9,2,2,#f4a6c8|r12,9,2,2,#f4a6c8|r5,7,2,4,#f7c0c8|r9,7,2,4,#f7c0c8|r7,6,2,5,#fbd8e0|f7,3,2,3,#ffd34d|r7,5,2,1,#c8805a'],
  sharkPlush: [6, '', 'r1,3,3,2,#6a5a9a|r2,5,3,2,#6a5a9a|r3,7,4,5,#6a5a9a|r2,12,3,2,#6a5a9a|r1,14,3,2,#6a5a9a|r13,0,1,6,#6a5a9a|r14,1,2,2,#86a6d0|r14,3,4,2,#86a6d0|r14,5,6,2,#86a6d0|b5,6,26,12,#86a6d0|r30,9,1,6,#86a6d0|r31,10,1,4,#6a5a9a|r15,13,14,3,#fbf6ec|r23,14,4,1,#c8306a|r25,9,1,2,O|r18,9,1,3,#6a5a9a|r20,9,1,3,#6a5a9a|r10,18,5,3,#86a6d0|r10,20,5,1,#6a5a9a|r22,18,4,3,#86a6d0|r22,20,4,1,#6a5a9a|f28,0,1,3,#e8b43c|f27,1,3,1,#e8b43c'],
  deskCalendar: [0, '', 'b3,4,10,10,#fffaf3|r3,4,10,3,#e06a5a|r5,2,1,3,#3a3448|r10,2,1,3,#3a3448|r5,9,1,1,#a8a0b8|r7,9,1,1,#a8a0b8|r9,9,1,1,#e06a5a|r5,11,1,1,#a8a0b8|r7,11,1,1,#a8a0b8|r9,11,1,1,#a8a0b8'],
};
type Shape = { k: string; n: number[]; col: string };
const parsed = new Map<string, Shape[]>();
function recipeDraw(item: string): Draw | undefined {
  const rec = RECIPES[item];
  if (!rec) return undefined;
  const [up, base, src] = rec;
  let shapes = parsed.get(item);
  if (!shapes) {
    shapes = src.split('|').map((p) => { const a = p.slice(1).split(','); return { k: p[0], n: a.slice(0, -1).map(Number), col: a[a.length - 1] }; });
    parsed.set(item, shapes);
  }
  return (c, x, y, t, col = base || '#f2b48a') => {
    const Y = y - up;
    const paint = (s: string) => (s === '$' ? col : s === '$d' ? shade(col, -0.15) : s === '$D' ? shade(col, -0.3) : s === '$l' ? shade(col, 0.15) : s === 'O' ? OUT : s);
    for (const { k, n, col: sc } of shapes!) {
      const fill = paint(sc);
      if (k === 'b') box(c, x + n[0], Y + n[1], n[2], n[3], fill);
      else if (k === 'r') r(c, x + n[0], Y + n[1], n[2], n[3], fill);
      else if (k === 'd') disc(c, x + n[0], Y + n[1], n[2], fill);
      else if (k === 'o') { disc(c, x + n[0], Y + n[1], n[2] + 1, OUT); disc(c, x + n[0], Y + n[1], n[2], fill); }
      else if (k === 'h') heart(c, x + n[0], Y + n[1], fill);
      else if (k === 'f') { if (Math.floor(t / 600 + n[0]) % 2) r(c, x + n[0], Y + n[1], n[2], n[3], fill); }
      else if (k === 's') r(c, x + n[0] + Math.round(Math.sin(t / 400) * 2), Y + n[1], n[2], n[3], fill);
    }
  };
}
for (const [k, [up]] of Object.entries(RECIPES)) OVERHANG[k] ??= up;

// s = which style of the item (see ITEMS[item].looks); 0 is the original.
// rot = which way it faces (0 front, 1 and 3 sideways, 2 away); h = its depth; lying = seen from above (rugs, beds).
export function drawFurniture(c: Ctx, item: string, x: number, y: number, t: number, col?: string, flip = false, w = 1, s = 0, bare = 0, rot = 0, h = 1, lying = false) {
  const draw = (s && ALT[item]?.[s - 1]) || DRAW[item] || recipeDraw(item);
  if (!draw) return;
  furnishing = true;
  try { paintFurniture(c, draw, item, x, y, t, col, flip, w, h, bare, rot, lying); } finally { furnishing = false; }
}
function paintFurniture(c: Ctx, draw: Draw, item: string, x: number, y: number, t: number, col: string | undefined, flip: boolean, w: number, h: number, bare: number, rot: number, lying: boolean) {
  if (rot) { drawTurned(c, draw, item, x, y, t, col, flip, w, h, bare, rot, lying); return; }
  if (!flip) { draw(c, x, y, t, col, bare); return; }
  // Turned pieces are mirrored around the middle of their footprint.
  c.save();
  c.translate(x * 2 + w * T, 0);
  c.scale(-1, 1);
  draw(c, x, y, t, col, bare);
  c.restore();
}

// Every piece only has a front view, so turned pieces are made from it: painted on a spare canvas, then
// rugs and beds turn as a whole; upright things show their front squeezed into the narrow side and slanted back
// into the room (a column at a time, so pixels stay crisp), or from behind, mirrored and in shadow. Either way a
// wardrobe still looks like a wardrobe.
let spare: HTMLCanvasElement | undefined;
function drawTurned(c: Ctx, draw: Draw, item: string, x: number, y: number, t: number, col: string | undefined, flip: boolean, w: number, h: number, bare: number, rot: number, lying: boolean) {
  const W = w * T, up = OVERHANG[item] ?? 0, H = up + h * T;
  spare ??= document.createElement('canvas');
  spare.width = W; spare.height = H; // also clears it
  const g = spare.getContext('2d')!;
  g.globalCompositeOperation = 'source-over'; // the back view's shading switched it
  draw(g, 0, up, t, col, bare);
  const fw = (rot % 2 ? h : w) * T; // footprint width on screen
  c.save();
  if (flip) { c.translate(x * 2 + fw, 0); c.scale(-1, 1); }
  if (lying) {
    if (rot === 1) { c.translate(x + H, y); c.rotate(Math.PI / 2); } // the overhang (headboard) ends up on the right
    else if (rot === 2) { c.translate(x + W, y + H); c.rotate(Math.PI); }
    else { c.translate(x - up, y + W); c.rotate(-Math.PI / 2); }
    c.drawImage(spare, 0, 0);
  } else if (rot === 2) {
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(43,37,48,0.4)';
    g.fillRect(0, 0, W, H);
    c.translate(x * 2 + W, 0);
    c.scale(-1, 1);
    c.drawImage(spare, x, y - up);
  } else {
    // Sideways, upright like everything else in the room: the front squeezed into the narrow end on the front tile,
    // and its top surface running back over the extra depth.
    if (rot === 3) { c.translate(x * 2 + fw, 0); c.scale(-1, 1); }
    const D = (w - h) * T, top = y + w * T - H; // extra depth; where the squeezed picture's top sits
    const px = g.getImageData(0, 0, W, H).data;
    const filled = (r: number) => { for (let i = 0; i < W; i++) if (px[(r * W + i) * 4 + 3]) return true; return false; };
    let row = 0; // the picture's top edge: its first row with anything in it
    while (row < H - 3 && !filled(row)) row++;
    // The top's colour: the piece's most common colour, leaving out outlines (wood for a desk, fabric for a sofa).
    const counts = new Map<number, number>();
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] > 200 && px[i] + px[i + 1] + px[i + 2] > 240) {
        const k = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    }
    const most = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0xd9a06a;
    const topCol = `#${most.toString(16).padStart(6, '0')}`;
    const back = top + row - D;
    box(c, x, back, fw, D + 2, shade(topCol, 0.08)); // the top, running back
    c.drawImage(spare, 0, 0, W, H, x, top, fw, H); // the front, squeezed
  }
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
  calendar: {
    rows: [
      '..o......o..',
      'oooooooooooo',
      'orrrrrrrrrro',
      'orrrrrrrrrro',
      'oooooooooooo',
      'owwwwwwwwwwo',
      'owkwwkwwkwwo',
      'owwwwwwwwwwo',
      'owkwwkwwpwwo',
      'owwwwwwwwwwo',
      'oooooooooooo',
      '............',
    ],
    pal: { o: OUT, r: '#e06a5a', w: '#fffaf3', k: '#9db4ee', p: '#f4a6b8' },
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
