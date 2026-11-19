// Pets: original chibi sprites (12x10 faces, or 16x12 side-on animals), and wandering that every viewer
// sees the same way (positions come from the clock and a per-pet seed, so nothing needs to be synced).
import { PETS } from '../shared/game.js';
import { shade, OUT } from './draw';

// a = coat colour (swapped for the owner's pick), b = a darker/accent tone, i = eye shine, e = eye, p = blush, n = nose.
// o is the outline: a dark version of the coat, so pets read soft instead of harsh.
// body: the char a sprite draws its coat in when it isn't 'a' (the hedgehog's spines are all 'b').
// acc: where hats, bows and glasses go, as a shift from the 12x10 face they were drawn for (side-on heads sit to the right).
// frames: other poses for parts that move (the elephant's trunk), same size as rows.
type Sprite = { rows: string[]; pal: Record<string, string>; b?: number; acc?: [number, number]; body?: string; frames?: Record<string, string[]> };
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
    pal: { w: '#fff0dc' }, b: -0.2, acc: [4, 3], body: 'b',
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
  cow: {
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
  elephant: { // a baby elephant: soft outline (b), big white ear, trunk curling up, blush under the eye
    rows: ['...bbbbbbbbb....', '...bwwwbaaaab...', '...bwwwbaaaaab..', '...bwwwbaaaeabb.', '.bbbwwwbaaaeabab', '.baabbbaaappabab',
      '.baaaaaaaaaaaaab', '.baaaaaaaaabbbb.', '..baaaaaabb.....', '..baabbaab......', '...bb..bb.......', '................'],
    pal: { w: '#ffffff' }, acc: [3, 0],
    frames: { down: ['...bbbbbbbbb....', '...bwwwbaaaab...', '...bwwwbaaaaab..', '...bwwwbaaaeab..', '.bbbwwwbaaaeab..', '.baabbbaaappab..',
        '.baaaaaaaaaaaab.', '.baaaaaaaaabbab.', '..baaaaaabb.bab.', '..baabbaab...b..', '...bb..bb.......', '................'] }, // trunk hanging relaxed
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

// Every pet stands at the capybara's size: the capybara's 16×12 art at 1.0 is the one size in the game, and the
// smaller 12×10 sprites are scaled up to the same width. A duckling is still a duckling, it just takes up as much
// floor as the biggest pet does.
const PET_W = 16; // the capybara's sprite width
const PET_SCALE: Record<string, number> = Object.fromEntries(
  Object.entries(SPRITES).map(([kind, art]) => [kind, PET_W / (art as { rows: string[] }).rows[0].length]),
);
for (const [kind, scale] of Object.entries(PET_SCALE)) console.assert(scale >= 1, `pet ${kind} must not shrink below capybara size`);

const coatOf = (kind: string, coat = 0) => {
  const coats = (PETS as Record<string, { coats: string[] }>)[kind]?.coats ?? ['#f2c48a'];
  return coats[coat] ?? coats[0];
};

const cache = new Map<string, HTMLCanvasElement>();
export function petCanvas(kind: string, coat = 0, frame?: string) {
  const key = `${kind}|${coat}|${frame ?? ''}`;
  let cv = cache.get(key);
  if (!cv) {
    const base = SPRITES[kind] ?? SPRITES.cat, sp = { ...base, rows: (frame && base.frames?.[frame]) || base.rows };
    const a = coatOf(kind, coat);
    const pal: Record<string, string> = { ...EYES, a, b: shade(a, sp.b ?? -0.12), o: shade(a, -0.42), ...sp.pal };
    cv = document.createElement('canvas');
    cv.width = sp.rows[0].length;
    cv.height = sp.rows.length;
    const g = cv.getContext('2d')!;
    sp.rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row[x] !== '.') { g.fillStyle = pal[row[x]] ?? a; g.fillRect(x, y, 1, 1); }
    });
    // A subtle shine: the lit top of every column of coat turns one shade brighter, so a pet looks glossy under
    // the same top light as the furniture without losing its soft outline or its candy-bright accessories.
    const body = sp.body ?? 'a';
    g.fillStyle = shade(a, 0.25);
    for (let x = 0; x < cv.width; x++) {
      let y = 0;
      while (y < sp.rows.length && sp.rows[y][x] === '.') y++;
      if (sp.rows[y]?.[x] !== body) y++; // the top pixel is the outline: shine the coat just under it
      if (sp.rows[y]?.[x] === body) g.fillRect(x, y, 1, 1);
    }
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

// Accessories, drawn relative to the pet sprite's top-left (px, py). Every piece is a stack of 1-px rects in a
// candy palette (hot pink, gold, sky blue, red, violet) lit by a cream highlight, and each one is stamped with
// the game's ink outline first, so a bow or a crown pops off a coat instead of melting into it.
const PINK = '#ff5c9d', PINK_D = '#d8386f', PINK_L = '#ffb6d4';
const GOLD = '#ffcc2e', GOLD_L = '#fff3b0', CREAM = '#fff6e4';
const BLUE = '#3d9bff', BLUE_D = '#2a6fd0', BLUE_L = '#9fd0ff', RED = '#ff4d4d', RED_D = '#d62f3c', RED_L = '#ffa39a';
const PURPLE = '#9b6bff', PURPLE_D = '#7247d6', PURPLE_L = '#c6adff';
const BROWN = '#c08a4e', BROWN_D = '#8f6337', BROWN_L = '#e0b078', INK_HAT = '#332a3c';
function drawAcc(c: CanvasRenderingContext2D, acc: string, px: number, py: number) {
  const rects: [number, number, number, number, string][] = [];
  const r = (x: number, y: number, w: number, h: number, col: string) => rects.push([x, y, w, h, col]);
  if (acc === 'bow') {
    r(8, -1, 2, 3, PINK); r(11, -1, 2, 3, PINK); r(8, -1, 1, 1, PINK_L); r(12, -1, 1, 1, PINK_L); r(10, 0, 2, 1, PINK_D);
  } else if (acc === 'bell') {
    r(2, 8, 8, 1, PINK); r(5, 9, 2, 2, GOLD); r(5, 9, 1, 1, GOLD_L); r(6, 10, 1, 1, '#e0a000');
  } else if (acc === 'bandana') {
    r(2, 8, 8, 1, BLUE); r(2, 8, 3, 1, BLUE_L); r(4, 9, 4, 1, BLUE); r(4, 9, 1, 1, CREAM); r(7, 9, 1, 1, CREAM);
  } else if (acc === 'flowers') {
    ['#ff5c9d', '#ffcc2e', '#9b6bff', '#43d17a', '#ff8fc0'].forEach((col, k) => {
      const y = -(k % 2);
      r(1 + k * 2, y, 2, 2, col); r(1 + k * 2, y, 1, 1, CREAM);
    });
  } else if (acc === 'beanie') {
    r(2, -2, 8, 3, BLUE); r(3, -2, 4, 1, BLUE_L); r(2, 0, 8, 1, BLUE_D); r(5, -3, 2, 2, CREAM);
  } else if (acc === 'glasses') { // two little hearts joined at the bridge
    const heart = (x: number, y: number) => { r(x, y, 1, 1, PINK); r(x + 3, y, 1, 1, PINK); r(x, y + 1, 4, 1, PINK); r(x + 1, y + 2, 2, 1, PINK); };
    heart(1, 4); heart(7, 4); r(5, 4, 2, 1, PINK_D); r(1, 5, 1, 1, PINK_L); r(7, 5, 1, 1, PINK_L);
  } else if (acc === 'partyHat') {
    r(5, -6, 2, 1, GOLD); r(4, -5, 4, 1, PURPLE); r(4, -4, 4, 1, PINK); r(3, -3, 6, 1, GOLD); r(3, -2, 6, 1, PINK); r(2, -1, 8, 1, PURPLE);
    r(4, -5, 1, 1, PURPLE_L); r(3, -3, 1, 1, GOLD_L);
  } else if (acc === 'scarf') {
    r(1, 8, 10, 2, RED); r(1, 8, 4, 1, RED_L); r(3, 8, 1, 2, CREAM); r(7, 8, 1, 2, CREAM); r(8, 9, 2, 3, RED); r(8, 11, 2, 1, CREAM);
  } else if (acc === 'shades') {
    r(1, 4, 4, 2, INK_HAT); r(7, 4, 4, 2, INK_HAT); r(5, 4, 2, 1, INK_HAT); r(2, 4, 1, 1, BLUE_L); r(8, 4, 1, 1, BLUE_L); r(2, 5, 1, 1, BLUE); r(8, 5, 1, 1, BLUE);
  } else if (acc === 'cap') {
    r(2, -2, 8, 3, RED); r(3, -2, 4, 1, RED_L); r(5, -3, 2, 1, CREAM); r(8, 0, 4, 1, RED_D);
  } else if (acc === 'topHat') {
    r(3, -5, 6, 5, INK_HAT); r(3, -5, 1, 3, '#4c4260'); r(2, -1, 8, 1, INK_HAT); r(3, -2, 6, 1, PINK); r(7, -2, 1, 1, PINK_L);
  } else if (acc === 'witchHat') {
    r(5, -6, 2, 2, PURPLE); r(4, -4, 4, 2, PURPLE); r(3, -2, 6, 1, PURPLE); r(1, -1, 10, 1, PURPLE_D); r(4, -3, 4, 1, GOLD); r(5, -6, 1, 1, PURPLE_L);
  } else if (acc === 'halo') {
    r(3, -4, 6, 1, GOLD); r(2, -3, 1, 1, GOLD); r(9, -3, 1, 1, GOLD); r(3, -2, 6, 1, GOLD_L); r(5, -4, 2, 1, '#fffbe0');
  } else if (acc === 'santaHat') {
    r(3, -3, 6, 3, RED); r(3, -3, 2, 1, RED_L); r(8, -4, 3, 2, RED); r(10, -4, 2, 2, CREAM); r(2, -1, 8, 2, CREAM);
  } else if (acc === 'headphones') {
    r(2, -1, 8, 1, '#6f5fa8'); r(1, 0, 1, 4, '#6f5fa8'); r(10, 0, 1, 4, '#6f5fa8'); r(0, 3, 2, 3, PINK); r(10, 3, 2, 3, PINK); r(0, 3, 1, 1, PINK_L); r(11, 3, 1, 1, PINK_L);
  } else if (acc === 'bunnyEars') {
    r(3, -6, 2, 6, CREAM); r(7, -6, 2, 6, CREAM); r(3, -6, 1, 2, '#ffffff'); r(4, -5, 1, 4, PINK_L); r(8, -5, 1, 4, PINK_L); r(2, -1, 8, 1, PINK_L);
  } else if (acc === 'starClip') {
    r(9, 0, 3, 1, GOLD); r(10, -1, 1, 3, GOLD); r(10, 0, 1, 1, GOLD_L);
  } else if (acc === 'flower') {
    r(9, -1, 3, 3, PINK); r(9, -1, 1, 1, PINK_L); r(10, 0, 1, 1, GOLD);
  } else if (acc === 'cape') {
    r(0, 6, 2, 4, RED); r(10, 6, 2, 4, RED); r(0, 6, 1, 1, RED_L); r(11, 6, 1, 1, RED_L); r(2, 8, 8, 1, GOLD);
  } else if (acc === 'fedora') {
    r(3, -4, 6, 3, BROWN); r(3, -4, 1, 2, BROWN_L); r(5, -4, 2, 1, BROWN_D); r(3, -2, 6, 1, '#4a3626'); r(1, -1, 10, 1, BROWN_D); r(7, -2, 1, 1, GOLD);
  } else if (acc === 'crown') {
    r(3, -1, 6, 2, GOLD); r(3, -2, 1, 1, GOLD); r(5, -3, 2, 2, GOLD); r(8, -2, 1, 1, GOLD);
    r(3, -1, 1, 1, GOLD_L); r(4, -1, 1, 1, PINK); r(7, -1, 1, 1, BLUE); r(5, 0, 2, 1, PINK_D);
  }
  // Ink first: each rect spills one pixel past its edges, and the fills that follow cover the ink inside the
  // shapes, so the accessory ends up wearing a clean one-pixel border all the way around.
  c.fillStyle = OUT;
  for (const [x, y, w, h] of rects) {
    c.fillRect(px + x - 1, py + y, w + 2, h);
    c.fillRect(px + x, py + y - 1, w, h + 2);
  }
  for (const [x, y, w, h, col] of rects) { c.fillStyle = col; c.fillRect(px + x, py + y, w, h); }
}

const hash = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
export const seedOf = (id: string, slot: number) => [...id].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) % 100000, slot * 997);
// What a nearby singer brings out in a pet: watch, or bounce along. Derived from the pet's own seed and the clock,
// so every viewer picks the same one, and nothing about it needs syncing.
export const singPetAct = (seed: number, now: number) => (hash(seed + 0.9, Math.floor(now / 12000)) < 0.5 ? 'watch' : 'dance');

// Every 5 s a pet picks another floor tile in its room, trots there, then idles.
// Sometimes it heads for a toy instead (cat tower, bed, ball...) and plays with it while it idles.
// Each minute it may go visit a neighbouring room (near: room indexes), walking there along route() for a whole period.
type Spot = { x: number; y: number; act?: string };
type Area = { spots: Spot[]; toys: Spot[]; laps?: Spot[] }; // laps: anyone sitting in that room
export function petPos(seed: number, now: number, areas: Area[], home = 0, near: number[] = [], route?: (a: Spot, b: Spot) => Spot[] | null) {
  const period = 5000, stay = 12; // periods per room choice
  const k = Math.floor(now / period) + (seed % 7);
  const f = (now % period) / period;
  const roomAt = (n: number) => {
    const w = Math.floor(n / stay), r = near.length && hash(seed + 0.75, w) < 0.4 ? near[Math.floor(hash(seed + 0.125, w) * near.length)] : home;
    return areas[r]?.spots.length ? r : home;
  };
  const target = (n: number) => {
    const { spots, toys, laps } = areas[roomAt(n)];
    if (laps?.length && hash(seed + 0.375, n) < 0.3) return laps[Math.floor(hash(seed + 0.625, n) * laps.length)];
    return toys.length && hash(seed + 0.5, n) < 0.45 ? toys[Math.floor(hash(seed + 0.25, n) * toys.length)] : spots[Math.floor(hash(seed, n) * spots.length)];
  };
  const a = target(k), b = target(k + 1);
  const movingRooms = roomAt(k) !== roomAt(k + 1);
  if ((movingRooms || a.x !== b.x || a.y !== b.y) && route) {
    const path = route(a, b);
    if (path && path.length >= 2) {
      const dur = movingRooms ? 1 : 0.54;
      const m = movingRooms ? f : Math.min(1, f / dur);
      const e = m * m * (3 - 2 * m);
      if (!movingRooms && m === 1 && b.act === 'chase') {
        const w = now / 350, r = Math.sin((Math.PI * (f - 0.54)) / 0.46);
        return { x: b.x + Math.sin(w) * 0.6 * r, y: b.y + Math.cos(w) * 0.3 * r, moving: true, left: Math.cos(w) < 0, act: b.act };
      }
      const t = e * (path.length - 1), i = Math.min(path.length - 2, Math.floor(t)), p = path[i], q = path[i + 1];
      const left = q.x < p.x || (q.x === p.x && b.x < a.x);
      return { x: p.x + (q.x - p.x) * (t - i), y: p.y + (q.y - p.y) * (t - i), moving: movingRooms ? f < 1 : m < 1, left, act: !movingRooms && m === 1 ? b.act : undefined };
    }
    if (movingRooms) return { x: a.x, y: a.y, moving: false, left: b.x < a.x, act: undefined }; // no way through: wait
  }
  const m = Math.min(1, f / 0.54);
  const e = m * m * (3 - 2 * m);
  if (m === 1 && b.act === 'chase') {
    const w = now / 350, r = Math.sin((Math.PI * (f - 0.54)) / 0.46);
    return { x: b.x + Math.sin(w) * 0.6 * r, y: b.y + Math.cos(w) * 0.3 * r, moving: true, left: Math.cos(w) < 0, act: b.act };
  }
  return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, moving: m < 1, left: b.x < a.x, act: m === 1 ? b.act : undefined };
}

// x, y = top-left of the tile the pet is on, in art pixels. act: 'perch' sits on top, 'sleep' dozes.
export function drawPet(c: CanvasRenderingContext2D, kind: string, x: number, y: number, moving: boolean, left: boolean, now: number, act?: string, coat = 0, acc?: string) {
  // 'sun' is a doze in a window's light and 'chair' a nap on a cushion: both lie down like sleep does.
  const sleeping = act === 'sleep' || act === 'sun' || act === 'chair', tricking = act === 'trick';
  const hop = sleeping ? 1 : act === 'watch' ? 0 : act === 'dance' ? -Math.abs(Math.round(Math.sin(now / 150) * 2))
    : tricking ? -Math.abs(Math.round(Math.sin(now / 130) * 3))
    : moving ? -Math.abs(Math.round(Math.sin(now / 90) * 2)) : Math.floor(now / 800) % 2 ? 0 : -1;
  if (act === 'perch') y -= 16;
  else if (act === 'lap') y -= 8;
  else if (act === 'chair') y -= 5; // curled up on a cushion, a few pixels up and no floor shadow at all
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
    c.fillStyle = act === 'sun' ? '#ffd35c' : '#fffaf3'; // a sunbath's Zzz is warm gold
    const zx = Math.round(x + 12 + p * 4), zy = Math.round(y + 2 - p * 8);
    c.fillRect(zx, zy, 3, 1); c.fillRect(zx + 1, zy + 1, 1, 1); c.fillRect(zx, zy + 2, 3, 1);
    c.globalAlpha = 1;
  }
  // The elephant's trunk: it swings with each step, rests down while idle, sleeping or eating, and every few
  // seconds lifts with a toot and a little spray of water.
  let frame: string | undefined, spray = -1;
  if (kind === 'elephant') {
    const toot = (now % 6000) / 6000;
    if (moving) frame = Math.floor(now / 180) % 2 ? 'down' : undefined;
    else if (sleeping || act === 'eat' || toot > 0.25) frame = 'down';
    else spray = toot / 0.25; // 0..1 through the toot
  }
  const pet = petCanvas(kind, coat, frame), [ax, ay] = SPRITES[kind]?.acc ?? [0, 0];
  const scale = PET_SCALE[kind] ?? 1.0;
  const sw = pet.width * scale, sh = pet.height * scale;
  const px = x + (16 - sw) / 2, py = y + 15 - sh + hop; // feet on the tile's bottom edge
  c.save();
  if (left) { c.translate(px * 2 + sw, 0); c.scale(-1, 1); }
  c.drawImage(pet, px, py, sw, sh);
  if (act === 'dance') { // two tiny notes on the beat, so the bounce reads as dancing
    const up = Math.floor(now / 150) % 2 ? 0 : 1;
    c.fillStyle = '#f2c14e';
    c.fillRect(px + 12 * scale, py - 3 - up, 1, 3); c.fillRect(px + 10 * scale, py - 1 - up, 3, 1); c.fillRect(px + 13 * scale, py + 1 - up, 1, 1);
    c.fillStyle = '#f0708e';
    c.fillRect(px + 3 * scale, py - 5 + up, 1, 3); c.fillRect(px + 1 * scale, py - 3 + up, 3, 1);
  }
  if (tricking) { // a trick for someone it likes: three sparkles circling the pet
    c.fillStyle = '#ffd35c';
    for (let k = 0; k < 3; k++) {
      const ang = now / 260 + k * 2.1, r = 10 + 2 * Math.sin(now / 180 + k);
      const sx = Math.round(px + sw / 2 + Math.cos(ang) * r), sy = Math.round(py + sh / 2 + Math.sin(ang) * r * 0.5);
      c.fillRect(sx, sy, 1, 1); c.fillRect(sx - 1, sy, 3, 1); c.fillRect(sx, sy - 1, 1, 3);
    }
  }
  if (spray > 0.2) { // droplets arcing up and out of the trunk tip
    c.fillStyle = '#9fd4f4';
    for (let k = 0; k < 3; k++) {
      const p = (spray - 0.2) / 0.8 - k * 0.15;
      if (p <= 0 || p >= 1) continue;
      c.fillRect(Math.round(px + 15 * scale + p * 3 + k * 0.5), Math.round(py + 3 - Math.sin(p * Math.PI) * 4 + p * 2), 1, 1);
    }
  }
  c.restore();
  // Accessories sit on the sprite's own art grid, like the shop icons, so they grow with the pet instead of
  // shrinking onto its head when the art is scaled up.
  if (acc) {
    c.save();
    c.translate(px, py);
    c.scale(scale, scale);
    if (left) { c.translate(pet.width, 0); c.scale(-1, 1); }
    drawAcc(c, acc, ax, ay);
    c.restore();
  }
}
