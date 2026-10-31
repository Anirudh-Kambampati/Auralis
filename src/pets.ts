// Pets: original 12x10 chibi sprites (big shiny eyes, blush, soft outlines), and wandering that every viewer
// sees the same way (positions come from the clock and a per-pet seed, so nothing needs to be synced).
import { PETS } from '../shared/game.js';
import { shade } from './draw';

// a = coat colour (swapped for the owner's pick), b = a darker/accent tone, i = eye shine, e = eye, p = blush, n = nose.
// o is the outline: a dark version of the coat, so pets read soft instead of harsh.
type Sprite = { rows: string[]; pal: Record<string, string>; b?: number };
const EYES = { i: '#ffffff', e: '#3a2633', p: '#f7a0b0', n: '#e86a8a', m: '#c8606a' };
const SPRITES: Record<string, Sprite> = {
  hamster: {
    rows: ['............', '.oo.oooo.oo.', 'opaoaaaaoapo', 'oaaaaaaaaaao', 'oaaaaaaaaaao', 'oaieaaaaieao', 'oaeeawwaeeao', 'opaawnnwaapo', 'oawwwwwwwwao', '.oooooooooo.'],
    pal: { w: '#fff8ee' },
  },
  duckling: {
    rows: ['....oooo....', '...oaaaao...', '..oaaaaaao..', '.oaaaaaaaao.', '.oaieaaieao.', '.oaeeaaeeao.', 'ooapyyyypaoo', 'oaaaayyaaaao', '.oaaaaaaaao.', '..oyo..oyo..'],
    pal: { y: '#f2a03a' },
  },
  frog: {
    rows: ['.ooo....ooo.', 'oaieo..oaieo', 'oaeeoaaoaeeo', 'oaaaaaaaaaao', 'opaaaaaaaapo', 'oaamaaaamaao', 'oaaammmmaaao', 'oaaaaaaaaaao', '.owwwwwwwwo.', 'oo.oo..oo.oo'],
    pal: { w: '#fff4d8' },
  },
  bunny: {
    rows: ['..oo....oo..', '.oapo..opao.', '.oapo..opao.', '.oaaooooaao.', 'oaaaaaaaaaao', 'oaieaaaaieao', 'oaeeaaaaeeao', 'opaaannaaapo', '.oaaaaaaaao.', '..owo..owo..'],
    pal: { w: '#ffffff' },
  },
  hedgehog: {
    rows: ['..o.o.o.o...', '.obobobobo..', 'obbbbbbbbbo.', 'obbbbbbbbbbo', 'obwwwwwwwwbo', 'obwiewwiewbo', 'obweewweewbo', 'obpwwnnwwpbo', '.obwwwwwwbo.', '..oo....oo..'],
    pal: { w: '#fff0dc' },
  },
  penguin: {
    rows: ['...oooooo...', '..oaaaaaao..', '.oaaaaaaaao.', '.oawwwwwwao.', 'oawiewwiewao', 'oaweewweewao', 'oawpwyywpwao', 'oaawwwwwwaao', '.oawwwwwwao.', '..oyo..oyo..'],
    pal: { w: '#fffaf3', y: '#f2a03a' },
  },
  cat: {
    rows: ['.oo......oo.', 'oapo....opao', 'oaaooooooaao', 'oaaaaaaaaaao', 'oabaaaaaabao', 'oaieaaaaieao', 'oaeeaaaaeeao', 'opaaannaaapo', '.oaaaaaaaao.', '..owo..owo..'],
    pal: { w: '#fff4e6' }, b: -0.14,
  },
  puppy: {
    rows: ['...oooooo...', '..oaaaaaao..', '.obaaaaaabo.', 'obbaaaaaabbo', 'obbaaaaaabbo', 'obaieaaieabo', 'obaeeaaeeabo', '.opawnnwapo.', 'oaaawwwwaaao', '.owo.oo.owo.'],
    pal: { w: '#fff4e6' }, b: -0.22,
  },
  capybara: {
    rows: ['.....yy.....', '.oo..yy..oo.', 'oaooooooooao', 'oaaaaaaaaaao', 'oaaaaaaaaaao', 'oaeaaaaaaeao', 'oaaaabbaaaao', 'opaabnnbaapo', 'oaaabbbbaaao', '.oo.o..o.oo.'],
    pal: { y: '#ffd27a' }, b: -0.12,
  },
  owl: {
    rows: ['oo........oo', 'oaooooooooao', 'oaaaaaaaaaao', 'oawwaaaawwao', 'owiewaawiewo', 'oweewyyweewo', 'oawwaaaawwao', 'oaabbbbbbaao', '.oabbbbbbao.', '..oyo..oyo..'],
    pal: { w: '#fffaf3', y: '#f2a03a' }, b: 0.12,
  },
  panda: {
    rows: ['.oo......oo.', 'okko....okko', '.oooaaaaooo.', 'oaaaaaaaaaao', 'oakkaaaakkao', 'oaikaaaaikao', 'opaaakkaaapo', 'oaaaaaaaaaao', 'okkaaaaaakko', '.oko....oko.'],
    pal: { k: '#3a3448' },
  },
  fox: {
    rows: ['oo........oo', 'oao......oao', 'oapo....opao', 'oaaooooooaao', 'oaaaaaaaaaao', 'oaieaaaaieao', 'oaeeaaaaeeao', 'owwpaaaapwwo', '.owwwnnwwwo.', '..oooooooo..'],
    pal: { w: '#fff4e6', n: '#3a2633' },
  },
  axolotl: {
    rows: ['............', 'p..oooooo..p', 'pp.oaaaao.pp', '.pooaaaaoop.', 'ppoaaaaaaopp', '.oaieaaieao.', '.oaeeaaeeao.', 'oapaammaapao', 'oabaaaaaabao', '.oo.oooo.oo.'],
    pal: { p: '#e86a8a' }, b: -0.1,
  },
  piglet: {
    rows: ['.oo......oo.', 'oapo....opao', 'oaaooooooaao', 'oaaaaaaaaaao', 'oaieaaaaieao', 'oaeeaaaaeeao', 'opaabbbbaapo', 'oaaabkkbaaao', '.oaaaaaaaao.', '..obo..obo..'],
    pal: { k: '#d9607a' },
  },
  sheep: {
    rows: ['...oooooo...', '.ooaaaaaaoo.', 'oaaaaaaaaaao', 'oaaffffffaao', 'oaffffffffao', 'oafieffiefao', 'oafeeffeefao', 'oafpfnnfpfao', 'oaaaaaaaaaao', '.ofo....ofo.'],
    pal: { f: '#f7d8c8' },
  },
  turtle: {
    rows: ['....ooooo...', '...ossssso..', '...oseseso..', '...opssspo..', '.ooaaaaaaoo.', 'oaabaabaabao', 'oabaabaabaao', 'oaaaaaaaaaao', 'soaaaaaaaaos', '.oo......oo.'],
    pal: { s: '#b8e0a8' },
  },
  koala: {
    rows: ['.oo......oo.', 'owwo....owwo', 'owaooooooawo', 'oaaaaaaaaaao', 'oaaaaaaaaaao', 'oaieaaaaieao', 'oaeeakkaeeao', 'opaaakkaaapo', '.oaaaaaaaao.', '..owo..owo..'],
    pal: { w: '#f4eef0', k: '#3a3448' },
  },
  raccoon: {
    rows: ['.oo......oo.', 'oaao....oaao', 'oaaooooooaao', 'owwaaaaaawwo', 'okkkwaawkkko', 'okiekwwkieko', 'okeekwwkeeko', 'oawwwnnwwwao', '.oaaaaaaaao.', '..owo..owo..'],
    pal: { k: '#3a3448', w: '#fff4e6', n: '#3a2633' },
  },
  unicorn: {
    rows: ['.....yy.....', '.o..oyyo..o.', 'oaooooooooao', 'oaaaaaaaaamo', 'oaaaaaaaammo', 'oaieaaaaiemo', 'oaeeaaaaeemo', 'opaaaaaaapmo', '.oaaaaaaaao.', '..oyo..oyo..'],
    pal: { y: '#ffd34d', m: '#b89af0' },
  },
  dragon: {
    rows: ['..y......y..', '..oaaaaaao..', '.oaaaaaaaao.', 'woaaaaaaaaow', 'woaieaaieaow', 'woaeeaaeeaow', '.oapaaaapao.', '..oaccccao..', '..oaccccao..', '..oo.oo.oo..'],
    pal: { y: '#ffd27a', w: '#f4b6c8', c: '#fff0c8' },
  },
};
for (const [k, { rows }] of Object.entries(SPRITES)) {
  console.assert(rows.length === 10 && rows.every((row) => row.length === 12), `pet ${k} must be 12x10`);
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
    cv.width = 12;
    cv.height = 10;
    const g = cv.getContext('2d')!;
    sp.rows.forEach((row, y) => {
      for (let x = 0; x < 12; x++) if (row[x] !== '.') { g.fillStyle = pal[row[x]] ?? a; g.fillRect(x, y, 1, 1); }
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
  g.drawImage(petCanvas(kind, coat), 2, 5);
  drawAcc(g, acc, 2, 5);
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
  const px = x + 2, py = y + 5 + hop;
  c.save();
  if (left) { c.translate(px * 2 + 12, 0); c.scale(-1, 1); }
  c.drawImage(petCanvas(kind, coat), px, py);
  if (acc) drawAcc(c, acc, px, py);
  c.restore();
}
