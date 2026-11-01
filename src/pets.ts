// Pets: original chibi sprites (12x10 faces, or 16x12 side-on animals), and wandering that every viewer
// sees the same way (positions come from the clock and a per-pet seed, so nothing needs to be synced).
import { PETS } from '../shared/game.js';
import { shade } from './draw';

// a = coat colour (swapped for the owner's pick), b = a darker/accent tone, i = eye shine, e = eye, p = blush, n = nose.
// o is the outline: a dark version of the coat, so pets read soft instead of harsh.
// acc: where hats, bows and glasses go, as a shift from the 12x10 face they were drawn for (side-on heads sit to the right).
type Sprite = { rows: string[]; pal: Record<string, string>; b?: number; acc?: [number, number] };
const EYES = { i: '#ffffff', e: '#3a2633', p: '#f7a0b0', n: '#e86a8a', m: '#c8606a' };
const SPRITES: Record<string, Sprite> = {
  hamster: {
    rows: ['................', '................', '.........oo..oo.', '......oooaaooaao', '....ooaaaaaaaaao', '...oaaaaaaaeaaeo',
      '..oaaaaaaaaapnpo', '..oaaaaaaawwwwwo', '..oaaaaaawwwwwo.', '...oaaaawwwwwo..', '....oooooooooo..', '.....oo....oo...'],
    pal: { w: '#fff8ee' }, acc: [4, 2],
  },
  duckling: {
    rows: ['................', '.......oooo.....', '......oaaaao....', '.....oaaaaaao...', '.....oaaeaaeao..', '..o..oapaayyyo..',
      '.oao.oaaaaaaao..', '.oaaaaaaaaaaaao.', '.oaabbbbaaaaaao.', '..oaaaaaaaaaao..', '...oooooooooo...', '.....yy..yy.....'],
    pal: { y: '#f2a03a' }, acc: [1, 1],
  },
  frog: {
    rows: ['................', '........ooo.ooo.', '.......oaieoaieo', '......oaaeeaaeeo', '....ooaaaaaaaaao', '...oaaaaaaaaaaao',
      '..oaaaaaaaammmao', '..oaaaaaaawwwwao', '.oaaobaaaawwwwo.', 'oaaaobbaaaaaao..', 'oooooo.oa..oa...', '.......oo..oo...'],
    pal: { w: '#fff4d8' }, acc: [3, 0],
  },
  bunny: {
    rows: ['.........oo.oo..', '.........opoopo.', '.........opoopo.', '........oaaaaaao', '........oaeaaeao', '.oo.....oapanapo',
      'owwo.ooooaaaaao.', '.oo.oaaaaaawwao.', '...oaaaaaaawwo..', '...oaaaaaaaaao..', '...owo.....owo..', '...oo......oo...'],
    pal: { w: '#ffffff' }, acc: [4, 2],
  },
  hedgehog: {
    rows: ['................', '....o.o.o.o.....', '...obobobobo....', '..obbbbbbbbbo...', '.obbbbbbbbbbwoo.', 'obbbbbbbbbbwwwwo',
      'obbbbbbbbbbwwewo', 'obbbbbbbbbwwwpno', '.obbbbbbbbwwwwo.', '..oowwwwwwwwoo..', '...ow.ow..ow.ow.', '...oo.oo..oo.oo.'],
    pal: { w: '#fff0dc' }, b: -0.2, acc: [4, 3],
  },
  penguin: {
    rows: ['................', '.......oooo.....', '......oaaaao....', '.....oaaaeaao...', '.....oaaawwaayyo', '.....oaawwwwao..',
      '....oaaawwwwwao.', '...oaaaawwwwwao.', '...obaaawwwwwao.', '....oaaawwwwao..', '.....oooooooo...', '.....yyy..yyy...'],
    pal: { w: '#fffaf3', y: '#f2a03a' }, acc: [2, 1],
  },
  cat: {
    rows: ['.........o....o.', '........oao..oao', '.oo.....oaaaaaao', '.oao....oawwwwwo', '.oao....owewwewo', '.oao....owpwnwpo',
      '..oaoooooowwwwo.', '..oaaaawwwwwwo..', '..owaaawwwwwwo..', '..owwwwwwwwwwo..', '..ow.ow..ow.ow..', '..oo.oo..oo.oo..'],
    pal: { w: '#fff4e6' }, acc: [4, 1],
  },
  puppy: {
    rows: ['................', '.........oooo...', '........oaaaao..', '.......obaaaaao.', '.o.....obaeaaeo.', 'oao....obawwwwno',
      '.oa.oooobawwwwo.', '..oaaaaaaawwwo..', '..oaaaaaawwwwo..', '..owwaaaawwwwo..', '..ow.ow..ow.ow..', '..oo.oo..oo.oo..'],
    pal: { w: '#fff4ea' }, b: -0.2, acc: [4, 1],
  },
  capybara: {
    rows: ['................', '................', '...........oo...', '.....ooooooaaoo.', '...ooaaaaaaaaaao', '..oaaaaaaaaaeaao',
      '..oaaaaaaaaaaaao', '..oaaaaaaaaaapno', '..oaaaaaaaaaaaao', '..obbbbbbbbbbbo.', '...oa.oa...oa.oa', '...oo.oo...oo.oo'],
    pal: {}, acc: [4, 2],
  },
  owl: {
    rows: ['................', '......o.....o...', '......oaooooao..', '.....oaaaaaaaao.', '.....owwaaaawwo.', '.....oweaayaewo.',
      '.....owwaaaawwo.', '....obaawwwwaabo', '....obbawwwwabbo', '.....obawwwwabo.', '......oooooooo..', '.......yy..yy...'],
    pal: { w: '#fff4e6', y: '#f2a03a' }, acc: [2, 1],
  },
  panda: {
    rows: ['................', '........kk...kk.', '.......okaaaaako', '.......oaaaaaaao', '.......oakiaakio', '.......oaapanapo',
      '..oooookkkaaaao.', '.oaaaaakkkaaaao.', '.oaaaaaakkaaaao.', '..oaaaaaaaaaao..', '..ok.ok..ok.ok..', '..kk.kk..kk.kk..'],
    pal: { k: '#3a3448' }, acc: [4, 1],
  },
  fox: {
    rows: ['.........o....o.', '........oao..oao', '.oo.....oaaaaaao', 'oaao....oaaaaaao', 'oaao....oaeaaeao', '.owo....owwwnwwo',
      '..oaooooooawwo..', '..oaaaaaaaawwo..', '..oaaaaaaawwwo..', '..oaaaaaaaaaao..', '..ob.ob..ob.ob..', '..oo.oo..oo.oo..'],
    pal: { w: '#fffaf3' }, b: -0.25, acc: [4, 1],
  },
  axolotl: {
    rows: ['................', '.........p.p.p..', '........pooooop.', '.......poaaaaaop', '........oaeaaeao', '.oo.....oaamaaao',
      'oaaoooooaaaaaao.', 'oaaaaaaaaaaaao..', '.oaaaaaaaaaaao..', '..oowwwwwwwwo...', '...oa.oa..oa.oa.', '...oo.oo..oo.oo.'],
    pal: { w: '#fff0f4' }, acc: [4, 1],
  },
  piglet: {
    rows: ['................', '.........oo.oo..', '........oaaaaao.', '........oaeaaeao', '........oapaanno', '.o.oooooaaaaaao.',
      'oaoaaaaaaaaaao..', '..oaaaaaaaaaao..', '..oaaaaaaaaaao..', '..oabbbbbbbbao..', '..oa.oa..oa.oa..', '..oo.oo..oo.oo..'],
    pal: {}, acc: [4, 1],
  },
  sheep: {
    rows: ['................', '..........oooo..', '...oooo..oabbbo.', '..oaaaaoobebbeo.', '.oaaaaaaaobpbbpo', 'oaaaaaaaaaobbbo.',
      'oaaaaaaaaaaooo..', 'oaaaaaaaaaaaao..', '.oaaaaaaaaaaao..', '..oaaaaaaaaao...', '...ob.ob.ob.ob..', '...oo.oo.oo.oo..'],
    pal: {}, b: -0.3, acc: [4, 1],
  },
  turtle: {
    rows: ['................', '................', '.....oooooo.....', '....obbabbbo....', '...obabbbabbo.oo', '..obbbabbbabboao',
      '..obabbbabbbbaeo', '..oooooooooooaao', '...oaaaaaaaaaao.', '...oa.oa..oa.oa.', '...oo.oo..oo.oo.', '................'],
    pal: {}, b: -0.22, acc: [5, 3],
  },
  koala: {
    rows: ['................', '......ooo..ooo..', '.....owwao.oawwo', '.....oaaaaaaaaao', '......oaeakkaeao', '......oapakkapo.',
      '.......oaaaaao..', '.....oaaawwwaao.', '....oaaaawwwaaao', '....oaaaaaaaaao.', '.....ooaooooaoo.', '................'],
    pal: { w: '#f4f0ec', k: '#3a3448' }, acc: [4, 1],
  },
  raccoon: {
    rows: ['.........o....o.', '........oao..oao', '.ob.....oaaaaaao', '.oao....owwwwwwo', '.obo....obibbibo', '.oao....owwwnwwo',
      '..obooooooowwwo.', '..oaaaaaaaaaao..', '..oaaaaaaaaaao..', '..obaaaaaaaabo..', '..ob.ob..ob.ob..', '..oo.oo..oo.oo..'],
    pal: { w: '#f4f0ec' }, b: -0.35, acc: [4, 1],
  },
  unicorn: {
    rows: ['..........o.y...', '.........oaoyo..', '........moaaaaoo', '.......mmoaeaaao', '......mmmoaaaaao', '......mmoaaaapno',
      '.m....mooaaaooo.', 'mmooooooaaaao...', 'm.oaaaaaaaaao...', '..oaaaaaaaaao...', '..ob.ob..ob.ob..', '..oo.oo..oo.oo..'],
    pal: { y: '#ffd27a', m: '#b89af0' }, acc: [3, 0],
  },
  dragon: {
    rows: ['...y........y...', '..oaaaaaaaaaao..', 'w.oaaaaaaaaaao.w', 'wwoaieaaaaieaoww', 'wwoaeeaaaaeeaoww', '.wopaaannaaapow.',
      '..oaaaaaaaaaao..', '...oaaccccaao...', '...oaaccccaao...', '...oaaaaaaaao...', '...oao....oao...', '...oo......oo...'],
    pal: { y: '#ffd27a', w: '#f4b6c8', c: '#fff0c8' }, acc: [2, 0],
  },
  platypus: {
    rows: ['................', '................', '........oooo....', '.......oaaaao...', '......oaaeaaao..', '......oaaaaayyyo',
      'bbbo.ooaaaaayyyo', 'bbbbaaaaaaaaoo..', 'bbbboaaaaaaaao..', '.ooooaaaaaaao...', '...oy.oy..oy.oy.', '...yy.yy..yy.yy.'],
    pal: { y: '#f2a03a' }, b: -0.2, acc: [4, 2],
  },
  trex: {
    rows: ['.........oooooo.', '........oaaaaaao', '........oaieaaao', '........oaeeaaao', '........oapawwwo', '.o.....oaaaaao..',
      'oao..oaaaaaabo..', '.oaooaaaaaaao...', '..oaaaaawwwao...', '...oaaaaaaao....', '....oao.oao.....', '....oo..oo......'],
    pal: { w: '#fff4d8' }, acc: [4, -1],
  },
};
for (const [k, { rows }] of Object.entries(SPRITES)) {
  const big = rows.length === 12 && rows.every((row) => row.length === 16);
  console.assert(big || (rows.length === 10 && rows.every((row) => row.length === 12)), `pet ${k} must be 12x10 or 16x12`);
  console.assert(k in PETS, `pet ${k} must be in PETS`);
}

const coatOf = (kind: string, coat = 0) => {
  const coats = (PETS as Record<string, { coats: string[] }>)[kind]?.coats ?? ['#f2c48a'];
  return coats[coat] ?? coats[0];
};

const cache = new Map<string, HTMLCanvasElement>();
export function petCanvas(kind: string, coat = 0) {
  const key = `${kind}|${coat}`;
  let cv = cache.get(key);
  if (!cv) {
    const sp = SPRITES[kind] ?? SPRITES.cat;
    const a = coatOf(kind, coat);
    const pal: Record<string, string> = { ...EYES, a, b: shade(a, sp.b ?? -0.12), o: shade(a, -0.42), ...sp.pal };
    cv = document.createElement('canvas');
    cv.width = sp.rows[0].length;
    cv.height = sp.rows.length;
    const g = cv.getContext('2d')!;
    sp.rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row[x] !== '.') { g.fillStyle = pal[row[x]] ?? a; g.fillRect(x, y, 1, 1); }
    });
    cache.set(key, cv);
  }
  return cv;
}

export function petIconURL(kind: string, coat = 0, acc?: string) {
  if (!acc) return petCanvas(kind, coat).toDataURL();
  const cv = document.createElement('canvas');
  cv.width = 16; cv.height = 16;
  const g = cv.getContext('2d')!;
  const pet = petCanvas(kind, coat), px = (16 - pet.width) / 2, py = 15 - pet.height, [ax, ay] = SPRITES[kind]?.acc ?? [0, 0];
  g.drawImage(pet, px, py);
  drawAcc(g, acc, px + ax, py + ay);
  return cv.toDataURL();
}

// Accessories, drawn relative to the pet sprite's top-left (px, py).
function drawAcc(c: CanvasRenderingContext2D, acc: string, px: number, py: number) {
  const r = (x: number, y: number, w: number, h: number, col: string) => { c.fillStyle = col; c.fillRect(px + x, py + y, w, h); };
  if (acc === 'bow') { r(8, -1, 2, 3, '#f48a8a'); r(11, -1, 2, 3, '#f48a8a'); r(10, 0, 1, 1, '#d9607a'); }
  else if (acc === 'bell') { r(2, 8, 8, 1, '#f48a8a'); r(5, 9, 2, 1, '#ffd34d'); }
  else if (acc === 'bandana') { r(2, 8, 8, 1, '#7fb2e8'); r(4, 9, 4, 1, '#7fb2e8'); r(5, 9, 1, 1, '#fffaf3'); }
  else if (acc === 'flowers') ['#f48a8a', '#ffd27a', '#b89af0', '#8fd0a8', '#f4a6c8'].forEach((col, k) => r(1 + k * 2, 0 - (k % 2), 2, 2, col));
  else if (acc === 'beanie') { r(2, -2, 8, 3, '#9db4ee'); r(2, 0, 8, 1, '#7a94d0'); r(5, -3, 2, 1, '#fffaf3'); }
  else if (acc === 'glasses') { r(1, 5, 4, 2, '#f48a8a'); r(7, 5, 4, 2, '#f48a8a'); r(5, 5, 2, 1, '#d9607a'); r(2, 5, 1, 1, '#ffd0d8'); r(8, 5, 1, 1, '#ffd0d8'); }
  else if (acc === 'partyHat') { r(5, -5, 2, 1, '#ffd34d'); r(5, -4, 2, 1, '#b89af0'); r(4, -3, 4, 1, '#f48a8a'); r(4, -2, 4, 1, '#b89af0'); r(3, -1, 6, 1, '#f48a8a'); }
  else if (acc === 'scarf') { r(1, 8, 10, 2, '#e06a5a'); r(3, 8, 1, 2, '#fffaf3'); r(7, 8, 1, 2, '#fffaf3'); r(8, 9, 2, 3, '#e06a5a'); }
  else if (acc === 'shades') { r(1, 4, 4, 2, '#2b2530'); r(7, 4, 4, 2, '#2b2530'); r(5, 4, 2, 1, '#2b2530'); r(2, 4, 1, 1, '#7a7090'); r(8, 4, 1, 1, '#7a7090'); }
  else if (acc === 'cap') { r(2, -2, 8, 3, '#f48a8a'); r(8, 0, 4, 1, '#e06a5a'); r(5, -3, 2, 1, '#fffaf3'); }
  else if (acc === 'topHat') { r(3, -5, 6, 5, '#2b2530'); r(2, -1, 8, 1, '#2b2530'); r(3, -2, 6, 1, '#f48a8a'); }
  else if (acc === 'witchHat') { r(5, -6, 2, 2, '#5a3a7a'); r(4, -4, 4, 2, '#5a3a7a'); r(3, -2, 6, 1, '#5a3a7a'); r(1, -1, 10, 1, '#5a3a7a'); r(4, -3, 4, 1, '#ffd34d'); }
  else if (acc === 'halo') { r(3, -4, 6, 1, '#ffd34d'); r(2, -3, 1, 1, '#ffd34d'); r(9, -3, 1, 1, '#ffd34d'); r(3, -2, 6, 1, '#fff3b0'); }
  else if (acc === 'santaHat') { r(3, -3, 6, 3, '#e06a5a'); r(8, -4, 3, 2, '#e06a5a'); r(11, -4, 2, 2, '#fffaf3'); r(2, -1, 8, 2, '#fffaf3'); }
  else if (acc === 'headphones') { r(2, -1, 8, 1, '#5a5070'); r(1, 0, 1, 4, '#5a5070'); r(10, 0, 1, 4, '#5a5070'); r(0, 3, 2, 3, '#f48a8a'); r(10, 3, 2, 3, '#f48a8a'); }
  else if (acc === 'bunnyEars') { r(3, -6, 2, 6, '#fffaf3'); r(7, -6, 2, 6, '#fffaf3'); r(4, -5, 1, 4, '#f4a6c8'); r(8, -5, 1, 4, '#f4a6c8'); r(2, -1, 8, 1, '#f4a6c8'); }
  else if (acc === 'starClip') { r(9, 0, 3, 1, '#ffd34d'); r(10, -1, 1, 3, '#ffd34d'); }
  else if (acc === 'flower') { r(9, -1, 3, 3, '#f48a8a'); r(10, 0, 1, 1, '#ffd34d'); }
  else if (acc === 'cape') { r(0, 6, 2, 4, '#e06a5a'); r(10, 6, 2, 4, '#e06a5a'); r(2, 8, 8, 1, '#ffd34d'); }
  else if (acc === 'fedora') { r(3, -4, 6, 3, '#8a6a48'); r(5, -4, 2, 1, '#6a4a32'); r(3, -2, 6, 1, '#3a2633'); r(1, -1, 10, 1, '#6a4a32'); }
  else if (acc === 'crown') { r(3, -1, 6, 2, '#ffd34d'); r(3, -2, 1, 1, '#ffd34d'); r(5, -3, 2, 2, '#ffd34d'); r(8, -2, 1, 1, '#ffd34d'); r(5, 0, 2, 1, '#f48a8a'); }
}

const hash = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
export const seedOf = (id: string, slot: number) => [...id].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) % 100000, slot * 997);

// Every 5 s a pet picks another floor tile in its room, trots there, then idles.
// Sometimes it heads for a toy instead (cat tower, bed, ball...) and plays with it while it idles.
type Spot = { x: number; y: number; act?: string };
export function petPos(seed: number, now: number, spots: Spot[], toys: Spot[] = []) {
  const period = 5000;
  const k = Math.floor(now / period) + (seed % 7);
  const f = (now % period) / period;
  const target = (n: number) =>
    toys.length && hash(seed + 0.5, n) < 0.45 ? toys[Math.floor(hash(seed + 0.25, n) * toys.length)] : spots[Math.floor(hash(seed, n) * spots.length)];
  const a = target(k), b = target(k + 1);
  const m = Math.min(1, f / 0.45);
  const e = m * m * (3 - 2 * m);
  if (m === 1 && b.act === 'chase') {
    // Running rings around the ball.
    const w = now / 350;
    return { x: b.x + Math.sin(w) * 0.6, y: b.y + Math.cos(w) * 0.3, moving: true, left: Math.cos(w) < 0, act: b.act };
  }
  return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, moving: m < 1, left: b.x < a.x, act: m === 1 ? b.act : undefined };
}

// x, y = top-left of the tile the pet is on, in art pixels. act: 'perch' sits on top, 'sleep' dozes.
export function drawPet(c: CanvasRenderingContext2D, kind: string, x: number, y: number, moving: boolean, left: boolean, now: number, act?: string, coat = 0, acc?: string) {
  const sleeping = act === 'sleep';
  const hop = sleeping ? 1 : moving ? -Math.abs(Math.round(Math.sin(now / 90) * 2)) : Math.floor(now / 800) % 2 ? 0 : -1;
  if (act === 'perch') y -= 16;
  else {
    c.fillStyle = 'rgba(58,38,51,0.18)';
    c.fillRect(x + 3, y + 14, 10, 2);
  }
  if (act === 'eat') {
    const p = (now / 1200) % 1;
    c.globalAlpha = 1 - p;
    c.fillStyle = '#f48a8a';
    const hx = Math.round(x + 10), hy = Math.round(y + 2 - p * 8);
    c.fillRect(hx - 1, hy, 1, 1); c.fillRect(hx + 1, hy, 1, 1); c.fillRect(hx - 1, hy + 1, 3, 1); c.fillRect(hx, hy + 2, 1, 1);
    c.globalAlpha = 1;
  }
  if (sleeping) {
    const p = (now / 1600) % 1;
    c.globalAlpha = 1 - p;
    c.fillStyle = '#fffaf3';
    const zx = Math.round(x + 12 + p * 4), zy = Math.round(y + 2 - p * 8);
    c.fillRect(zx, zy, 3, 1); c.fillRect(zx + 1, zy + 1, 1, 1); c.fillRect(zx, zy + 2, 3, 1);
    c.globalAlpha = 1;
  }
  const pet = petCanvas(kind, coat), [ax, ay] = SPRITES[kind]?.acc ?? [0, 0];
  const px = x + (16 - pet.width) / 2, py = y + 15 - pet.height + hop; // feet on the tile's bottom edge
  c.save();
  if (left) { c.translate(px * 2 + pet.width, 0); c.scale(-1, 1); }
  c.drawImage(pet, px, py);
  if (acc) drawAcc(c, acc, px + ax, py + ay);
  c.restore();
}
