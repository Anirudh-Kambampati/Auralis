// Pets: original 12x10 pixel sprites, and wandering that every viewer sees the same way
// (positions come from the clock and a per-pet seed, so nothing needs to be synced).
const OUT = '#3a2633';

const SPRITES: Record<string, { rows: string[]; pal: Record<string, string> }> = {
  hamster: {
    rows: ['..oo....oo..', '.oapo..opao.', '.oaaaooaaao.', 'oaaaaaaaaaao', 'oaeaaaaaaeao', 'oapaawwaapao', 'oaaawnnwaaao', 'oaaaawwaaaao', '.oaaaaaaaao.', '..oooooooo..'],
    pal: { o: OUT, a: '#f2c48a', p: '#f7a0a8', e: OUT, w: '#fff4e6', n: '#e86a8a' },
  },
  duckling: {
    rows: ['....oooo....', '...oyyyyo...', '..oyyyyyyo..', '..oyeyyeyo..', '..oyybbyyo..', '.ooyyyyyyoo.', 'oyyyyyyyyyyo', 'oyyyyyyyyyyo', '.oyyyyyyyyo.', '..obo..obo..'],
    pal: { o: OUT, y: '#ffe07a', b: '#f2a03a', e: OUT },
  },
  bunny: {
    rows: ['..oo....oo..', '.owpo..opwo.', '.owpo..opwo.', '.owwo..owwo.', '.owwwoowwwo.', 'owwwwwwwwwwo', 'owewwwwwwewo', 'owpwwnnwwpwo', '.owwwwwwwwo.', '..oooooooo..'],
    pal: { o: OUT, w: '#fffaf3', p: '#f7b0c0', e: OUT, n: '#e86a8a' },
  },
  cat: {
    rows: ['.oo......oo.', '.opo....opo.', '.oaaooooaao.', 'oaaaaaaaaaao', 'oaeaaaaaaeao', 'oapaannaapao', '.oaaabbaaao.', 'oaabaaaabaao', 'oaaaaaaaaaao', '.owwoooowwo.'],
    pal: { o: OUT, a: '#f2a65a', b: '#d9853a', p: '#f49a9a', e: OUT, n: '#e86a8a', w: '#fff4e6' },
  },
  puppy: {
    rows: ['...oooooo...', '..oaaaaaao..', '.obaaaaaabo.', 'obbaeaaeabbo', 'obbawwwwabbo', 'obbawnnwabbo', '.oaaawwaaao.', 'oaaaaaaaaaao', 'oaaaaaaaaaao', '.owwoooowwo.'],
    pal: { o: OUT, a: '#c89068', b: '#8a5a3c', e: OUT, w: '#fff4e6', n: '#2b2530' },
  },
  fox: {
    rows: ['oo........oo', 'oao......oao', 'oaao....oaao', 'oaaaooooaaao', 'oaaaaaaaaaao', 'oaeaaaaaaeao', 'owwaaaaaawwo', '.owwwnnwwwo.', '..owwwwwwo..', '...oooooo...'],
    pal: { o: OUT, a: '#f28a3a', e: OUT, w: '#fff4e6', n: '#2b2530' },
  },
  axolotl: {
    rows: ['............', 'p..oooooo..p', 'pp.oaaaao.pp', '.pooaaaaoop.', 'ppoaeaaeaopp', '..oaammaao..', '.oaaaaaaaao.', 'oabaaaaaabao', 'oaaaaaaaaaao', '.oo.oooo.oo.'],
    pal: { o: OUT, a: '#f7b6c8', b: '#ef8aa8', p: '#e86a8a', e: OUT, m: '#c8606a' },
  },
  dragon: {
    rows: ['..y......y..', '..oaaaaaao..', '.oaaaaaaaao.', 'woaeaaaaeaow', 'wwoapaapaoww', 'wwoaaaaaaoww', '.woabbbbaow.', '..oabbbbao..', '..oaaaaaao..', '..oo.oo.oo..'],
    pal: { o: OUT, a: '#8fd0a8', b: '#fff0c8', p: '#f7a0a8', e: OUT, y: '#ffd27a', w: '#b89af0' },
  },
};
for (const [k, { rows }] of Object.entries(SPRITES)) {
  console.assert(rows.length === 10 && rows.every((row) => row.length === 12), `pet ${k} must be 12x10`);
}

const cache = new Map<string, HTMLCanvasElement>();
export function petCanvas(kind: string) {
  let cv = cache.get(kind);
  if (!cv) {
    const s = SPRITES[kind];
    cv = document.createElement('canvas');
    cv.width = 12;
    cv.height = 10;
    const g = cv.getContext('2d')!;
    s.rows.forEach((row, y) => {
      for (let x = 0; x < 12; x++) if (row[x] !== '.') { g.fillStyle = s.pal[row[x]]; g.fillRect(x, y, 1, 1); }
    });
    cache.set(kind, cv);
  }
  return cv;
}

export function petIconURL(kind: string) {
  return petCanvas(kind).toDataURL();
}

const hash = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
export const seedOf = (id: string, slot: number) => [...id].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) % 100000, slot * 997);

// Every 5 s a pet picks another floor tile in its room, trots there, then idles.
export function petPos(seed: number, now: number, spots: { x: number; y: number }[]) {
  const period = 5000;
  const k = Math.floor(now / period) + (seed % 7);
  const f = (now % period) / period;
  const a = spots[Math.floor(hash(seed, k) * spots.length)];
  const b = spots[Math.floor(hash(seed, k + 1) * spots.length)];
  const m = Math.min(1, f / 0.45);
  const e = m * m * (3 - 2 * m);
  return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, moving: m < 1, left: b.x < a.x };
}

// x, y = top-left of the tile the pet is on, in art pixels.
export function drawPet(c: CanvasRenderingContext2D, kind: string, x: number, y: number, moving: boolean, left: boolean, now: number) {
  const hop = moving ? -Math.abs(Math.round(Math.sin(now / 90) * 2)) : Math.floor(now / 800) % 2 ? 0 : -1;
  c.fillStyle = 'rgba(58,38,51,0.18)';
  c.fillRect(x + 3, y + 14, 10, 2);
  const px = x + 2, py = y + 5 + hop;
  if (!left) { c.drawImage(petCanvas(kind), px, py); return; }
  c.save();
  c.translate(px * 2 + 12, 0);
  c.scale(-1, 1);
  c.drawImage(petCanvas(kind), px, py);
  c.restore();
}
