// Brag video: every frame is a pure function of t (seconds), drawn with the game's own art code.
import { T, drawSeated, drawFloor, drawWallFace, drawWallTop, drawWindow, drawFurniture, drawAvatar, drawPaper, AV, paintBlockText, coinURL, type Look } from '../../src/draw';
import { drawPet, petPos, petCanvas, petIconURL } from '../../src/pets';
import { ITEMS, PETS, colorsFor } from '../../shared/game.js';

const W = 1920, H = 1080;
const cv = document.getElementById('v') as HTMLCanvasElement;
let c = cv.getContext('2d')!; // swapped for an offscreen layer while a faded group draws
const INK = '#2b2530', PAPER = '#fffaf3', BLUE = '#5b7fd6', GOLD = '#f2c14e', MUTED = '#7a6f80';
const F = (size: number, w = 600) => `${w} ${size}px Fredoka, sans-serif`;

// ---------- easing ----------
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const prog = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const outCubic = (x: number) => 1 - (1 - x) ** 3;
const inOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const outBack = (x: number) => { const k = 1.70158; return 1 + (k + 1) * (x - 1) ** 3 + k * (x - 1) ** 2; };
const lerp = (a: number, b: number, x: number) => a + (b - a) * x;

// ---------- drawing helpers ----------
function card(x: number, y: number, w: number, h: number, r = 26, fill = PAPER, line = 5, drop = 8) {
  c.fillStyle = INK;
  c.beginPath(); c.roundRect(x, y + drop, w, h, r); c.fill();
  c.fillStyle = fill; c.strokeStyle = INK; c.lineWidth = line;
  c.beginPath(); c.roundRect(x, y, w, h, r); c.fill(); c.stroke();
}
function text(s: string, x: number, y: number, size: number, color = INK, weight = 600, align: CanvasTextAlign = 'center') {
  c.font = F(size, weight); c.fillStyle = color; c.textAlign = align; c.textBaseline = 'middle';
  c.fillText(s, x, y);
}
const measure = (s: string, size: number, weight = 600) => { c.font = F(size, weight); return c.measureText(s).width; };
// Fades and lifts whatever `draw` paints; a = 0..1 presence.
// Partly faded groups draw opaque into a layer first, so overlapping shapes fade as one piece.
const layers: CanvasRenderingContext2D[] = [];
function group(a: number, dy: number, draw: () => void, scale = 1, cx = W / 2, cy = H / 2) {
  if (a <= 0) return;
  const outer = c, faded = a < 1;
  if (faded) {
    const depth = layers.filter((l) => l === outer).length ? layers.indexOf(outer) + 1 : 0;
    if (!layers[depth]) { const l = document.createElement('canvas'); l.width = W; l.height = H; layers[depth] = l.getContext('2d')!; }
    c = layers[depth];
    c.setTransform(outer.getTransform()); c.globalAlpha = 1;
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H); c.restore();
  }
  c.save();
  c.translate(cx, cy + dy); c.scale(scale, scale); c.translate(-cx, -cy);
  draw();
  c.restore();
  if (faded) {
    const layer = c.canvas;
    c = outer;
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha *= a; c.drawImage(layer, 0, 0); c.restore();
  }
}
// A caption in a paper pill, popping in at `at`.
function caption(s: string, t: number, at: number, out: number, y = 96, size = 64) {
  const raw = prog(t, at, at + 0.35), pin = outBack(raw), pout = prog(t, out - 0.25, out);
  if (raw <= 0 || pout >= 1) return;
  const w = measure(s, size, 700) + 90, h = size + 54;
  group(1 - pout, -pout * 30, () => {
    card(W / 2 - w / 2, y - h / 2, w, h, h / 2);
    text(s, W / 2, y + 3, size, INK, 700);
  }, 0.6 + 0.4 * pin, W / 2, y);
}
function bubble(s: string, x: number, y: number, a: number, size = 34, who?: string) {
  if (a <= 0) return;
  const w = measure(s, size) + 50, h = size + (who ? 66 : 36);
  group(clamp(a * 3), 0, () => {
    card(x - w / 2, y - h - 14, w, h, 18, PAPER, 4, 5);
    if (!who) { // chat messages have no tail, speech bubbles do
      c.fillStyle = PAPER; c.strokeStyle = INK; c.lineWidth = 4;
      c.beginPath(); c.moveTo(x - 12, y - 16); c.lineTo(x, y); c.lineTo(x + 12, y - 16); c.fill(); c.stroke();
      c.fillRect(x - 10, y - 20, 20, 5);
    }
    if (who) text(who, x - w / 2 + 25, y - h + 10, 24, MUTED, 600, 'left');
    text(s, who ? x - w / 2 + 25 : x, y - 14 - (who ? 26 : h / 2) + 2, size, INK, 600, who ? 'left' : 'center');
  }, outBack(clamp(a)), x, y);
}
const img = (src: string) => new Promise<HTMLImageElement>((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
function pixel(src: CanvasImageSource, x: number, y: number, w: number, h: number) {
  c.imageSmoothingEnabled = false; c.drawImage(src, x, y, w, h); c.imageSmoothingEnabled = true;
}

// ---------- the landing room, as the game draws it ----------
const HW = 20, HH = 8;
const room = document.createElement('canvas');
room.width = HW * T * AV; room.height = HH * T * AV; // AV: the game draws furniture detail at 2x
const rc = room.getContext('2d')!;
const looks: Look[] = [
  { skin: '#ffe0c8', hair: '#3a2a35', shirt: '#b89af0', style: 'buns', face: 'happy', outfit: 'sweater' },
  { skin: '#a8714f', hair: '#2b2530', shirt: '#7fb2e8', style: 'spiky', face: 'grin', outfit: 'hoodie' },
  { skin: '#f5c9a5', hair: '#e8735a', shirt: '#8fd0a8', style: 'curly', face: 'wink', outfit: 'jacket' },
];
const spots: { x: number; y: number }[] = [];
for (let y = 5; y < HH; y++) for (let x = 1; x < HW - 1; x++) if (!(y === 7 && x >= 15 && x <= 17)) spots.push({ x, y });
const BASE = 1_700_000_000_000; // fixed clock, so pets wander the same way every render
let coinImg: HTMLImageElement;
const walkerAt = (now: number) => ({ x: 8.5 + Math.sin(now / 1400) * 2.5, y: 5 });

function drawRoom(t: number, coinsUntil: number) {
  const ms = t * 1000, now = BASE + ms, g = rc;
  g.imageSmoothingEnabled = false;
  g.setTransform(AV, 0, 0, AV, 0, 0);
  g.clearRect(0, 0, HW * T, HH * T);
  for (let x = 0; x < HW; x++) {
    drawWallTop(g, x * T, 0, '#fbd0d4', 'hearts');
    drawWallFace(g, x * T, T, '#fbd0d4', 'hearts');
    for (let y = 2; y < HH; y++) drawFloor(g, x * T, y * T, '#e0b382', x, y, 'herringbone');
  }
  const put = (item: string, x: number, y: number, col?: string) => drawFurniture(g, item, x, y, ms, col, false, ITEMS[item].w, 0, 0, 0, ITEMS[item].h);
  drawWindow(g, 1 * T, 0, 'day');
  drawWindow(g, 16 * T, 0, 'day');
  put('roundRug', 8 * T, 5 * T, '#b89af0');
  put('rug', 2 * T, 5 * T, '#9db4ee');
  put('bookshelf', 6 * T, 2 * T, '#d9a06a');
  put('lamp', 9 * T, 2 * T, '#ffd27a');
  put('aquarium', 10 * T, 2 * T);
  put('bonsai', 18 * T, 2 * T);
  drawSeated(g, looks[0], 3 * T, 3 * T, ms, '#f4a6b8');
  drawSeated(g, looks[1], 14 * T, 3 * T, ms, '#8fd0a8');
  put('desk', 2 * T, 4 * T, '#f0d2a8');
  put('desk', 13 * T, 4 * T, '#b07a4e');
  const pets = (['cat', 'bunny', 'dragon'] as const).map((kind, i) => ({ kind, ...petPos(400 + i * 97, now, [{ spots, toys: [] }]) }));
  const w = walkerAt(now);
  const sprites = [
    ...pets.map((p) => ({ y: p.y + 0.9, draw: () => drawPet(g, p.kind, Math.round(p.x * T), Math.round(p.y * T), p.moving, p.left, now) })),
    { y: w.y + 0.99, draw: () => drawAvatar(g, looks[2], Math.round(w.x * T), w.y * T, Math.abs(Math.cos(now / 1400)) > 0.15 ? 1 + (Math.floor(now / 170) % 2) : 0, false) },
    { y: 7.5, draw: () => put('sofa', 15 * T, 7 * T, '#f4a6b8') },
  ];
  sprites.sort((a, b) => a.y - b.y).forEach((s) => s.draw());
  // A coin floats up from Mira's desk on every beat of the hook (one per "minute").
  for (let k = 1; k * 0.5 <= coinsUntil; k++) {
    const age = t - k * 0.5;
    if (age < 0 || age > 1.3) continue;
    g.globalAlpha = Math.min(1, (1.3 - age) * 2);
    g.drawImage(coinImg, 3 * T + 3, Math.round(T + 10 - age * 22));
    g.globalAlpha = 1;
  }
}
// Camera: art point (ax, ay) lands on screen (sx, sy) at zoom z.
const cam = (t: number) => {
  const p = inOut(prog(t, 3.0, 4.0));
  return { ax: lerp(96, 160, p), ay: lerp(60, 64, p), sx: 960, sy: lerp(560, 650, p), z: lerp(10, 5.4, p) };
};
const toScreen = (k: ReturnType<typeof cam>, x: number, y: number) => ({ x: k.sx + (x - k.ax) * k.z, y: k.sy + (y - k.ay) * k.z });

// ---------- scene 1+2: hook and reveal ----------
const timerCv = document.createElement('canvas');
function focusCard(t: number) {
  const out = inOut(prog(t, 3.0, 3.4));
  const x = W / 2 - 560, y = 760 + out * 420, w = 1120, h = 270;
  card(x, y, w, h, 34);
  // "FOCUS" pill and the live line, as in the game's focus card
  c.fillStyle = BLUE; c.strokeStyle = INK; c.lineWidth = 4;
  c.beginPath(); c.roundRect(x + 150, y + 26, 150, 50, 12); c.fill(); c.stroke();
  text('FOCUS', x + 225, y + 53, 30, '#fff', 700);
  const minutes = Math.min(6, Math.floor(t / 0.5));
  text('Earning 25', x + 325, y + 52, 32, MUTED, 600, 'left');
  pixel(coinImg, x + 495, y + 36, 32, 32);
  text('· ✨ 1 studying with you', x + 540, y + 52, 32, MUTED, 600, 'left');
  paintBlockText(timerCv, `${25 - minutes}:00`, INK, '#d9cfc2');
  const tw = timerCv.width * 13;
  pixel(timerCv, W / 2 - tw / 2 - 100, y + 92, tw, timerCv.height * 13);
  // progress track with the coin marker
  const tx = x + 700, ty = y + 150, tl = 340;
  c.fillStyle = '#ece2d5'; c.strokeStyle = INK; c.lineWidth = 4;
  c.beginPath(); c.roundRect(tx, ty, tl, 28, 14); c.fill(); c.stroke();
  const f = lerp(Math.max(0, minutes - 1) / 25, minutes / 25, outCubic(prog(t % 0.5, 0, 0.3)));
  c.fillStyle = GOLD; c.beginPath(); c.roundRect(tx + 3, ty + 3, Math.max(22, (tl - 6) * f), 22, 11); c.fill();
  pixel(coinImg, tx + (tl - 6) * f - 18, ty - 8, 44, 44);
}
function coinChip(t: number, a: number) {
  group(a, 0, () => {
    const n = 2480 + Math.min(6, Math.floor(t / 0.5));
    card(48, 40, 250, 92, 24);
    pixel(coinImg, 74, 61, 50, 50);
    const bump = 1 + 0.18 * (1 - outCubic(prog(t % 0.5, 0, 0.25))) * (t >= 0.5 && t < 3.25 ? 1 : 0);
    group(1, 0, () => text(String(n), 140, 88, 50, INK, 700, 'left'), bump, 200, 88);
  });
}
function plusOnes(t: number, k: ReturnType<typeof cam>) {
  for (let i = 1; i * 0.5 < 3.0; i++) {
    const age = t - i * 0.5;
    if (age < 0 || age > 1.0) continue;
    const p = toScreen(k, 3 * T + 18, T + 12 - age * 22);
    group(Math.min(1, (1.0 - age) * 3), 0, () => {
      c.lineWidth = 8; c.strokeStyle = INK; c.font = F(54, 700); c.textAlign = 'left';
      c.strokeText('+1', p.x, p.y); text('+1', p.x, p.y, 54, GOLD, 700, 'left');
    }, outBack(prog(age, 0, 0.25)), p.x, p.y);
  }
}
function sceneRoom(t: number) {
  const k = cam(t);
  const exit = inOut(prog(t, 7.0, 7.35));
  c.save();
  c.translate(0, -exit * 700); c.globalAlpha = 1 - exit;
  drawRoom(t, 3.0);
  const tl = toScreen(k, 0, 0), rw = HW * T * k.z, rh = HH * T * k.z;
  c.fillStyle = INK; c.beginPath(); c.roundRect(tl.x - 6, tl.y - 6 + 12, rw + 12, rh + 12, 30); c.fill();
  c.save(); c.beginPath(); c.roundRect(tl.x, tl.y, rw, rh, 24); c.clip();
  pixel(room, tl.x, tl.y, rw, rh);
  c.restore();
  c.strokeStyle = INK; c.lineWidth = 6; c.beginPath(); c.roundRect(tl.x - 3, tl.y - 3, rw + 6, rh + 6, 27); c.stroke();
  if (t < 3.6) plusOnes(t, k);
  // speech bubbles over the friends once the room is revealed
  const now = BASE + t * 1000, w = walkerAt(now);
  const b = [
    { s: '25 min sprint?', ax: 3 * T + 8, ay: 2 * T + 6, at: 4.5 },
    { s: "let's go!! 📖", ax: 14 * T + 8, ay: 2 * T + 6, at: 5.0 },
    { s: 'my cat says hi 🐱', ax: w.x * T + 8, ay: 5 * T - 4, at: 5.5 },
  ];
  for (const q of b) { const p = toScreen(k, q.ax, q.ay); bubble(q.s, p.x, p.y, prog(t, q.at, q.at + 0.3)); }
  c.restore();
  if (t < 3.6) focusCard(t);
  coinChip(t, 1 - prog(t, 3.0, 3.3));
  caption('Every focused minute = 1 coin', t, 0.05, 3.0);
  // logo + tagline
  group(1 - exit, -exit * 700, () => {
    const pl = outBack(prog(t, 3.5, 3.9));
    group(prog(t, 3.5, 3.7), 0, () => {
      const lw = measure('Auralis', 130, 700) + 150;
      pixel(icon, W / 2 - lw / 2, 50, 120, 120);
      c.lineWidth = 0; text('Auralis', W / 2 - lw / 2 + 150, 118, 130, INK, 700, 'left');
    }, 0.5 + 0.5 * pl, W / 2, 110);
    group(prog(t, 4.0, 4.3), (1 - outCubic(prog(t, 4.0, 4.4))) * 20, () => text('Study with your friends in a tiny pixel house.', W / 2, 232, 50, INK, 600));
  });
}

// ---------- scene 3: focus together ----------
let shot: HTMLImageElement, icon: HTMLImageElement;
function sceneTogether(t: number) {
  const pin = outCubic(prog(t, 7.25, 7.75)), pout = inOut(prog(t, 11.0, 11.3));
  if (pin <= 0 || pout >= 1) return;
  const s = lerp(1, 1.06, inOut(prog(t, 7.5, 11.0))) * (1 - pout * 0.15);
  const w = 1320, h = (w * shot.height) / shot.width, x = W / 2 - w / 2, y = 205 + (1 - pin) * 900;
  group(1 - pout, 0, () => {
    card(x - 8, y - 8, w + 16, h + 16, 30, PAPER, 6, 12);
    c.save(); c.beginPath(); c.roundRect(x, y, w, h, 22); c.clip();
    c.drawImage(shot, x, y, w, h);
    c.restore();
    // sticker on the "1 studying with you" line
    const ps = outBack(prog(t, 8.5, 8.8));
    if (ps > 0) {
      const sx = x + (930 / 1280) * w, sy = y + (440 / 800) * h;
      group(1, 0, () => {
        c.save(); c.translate(sx, sy); c.rotate(-0.07);
        const label = '+25% study buddy bonus ✨', tw = measure(label, 46, 700) + 70;
        card(-tw / 2, -50, tw, 100, 50, GOLD, 5, 8);
        text(label, 0, 2, 46, INK, 700);
        c.restore();
      }, ps, sx, sy);
    }
  }, s, W / 2, y + h / 2);
  caption('Study together → +25% coins', t, 7.25, 11.0);
}

// ---------- scene 4: shop ----------
type Thing = { name: string; price: number; art: HTMLCanvasElement };
const things: Thing[] = [];
function trim(src: HTMLCanvasElement) {
  const d = src.getContext('2d')!.getImageData(0, 0, src.width, src.height).data;
  let x0 = src.width, y0 = src.height, x1 = 0, y1 = 0;
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) if (d[(y * src.width + x) * 4 + 3] > 0) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext('2d')!.drawImage(src, -x0, -y0);
  return out;
}
function furnitureArt(item: string) {
  const it = ITEMS[item], cvs = document.createElement('canvas');
  cvs.width = (it.w * T + 8) * AV; cvs.height = (it.h + 3) * T * AV;
  const g = cvs.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.setTransform(AV, 0, 0, AV, 0, 0);
  drawFurniture(g, item, 4, 2 * T, 0, colorsFor(item)[0], false, it.w, 0, 0, 0, it.h);
  return trim(cvs);
}
function buildShop() {
  const furn = ['sofa', 'piano', 'aquarium', 'arcade', 'bonsai', 'fireplace', 'catTower', 'drumKit', 'cherryTree', 'telescope', 'bookshelf', 'discoBall'];
  const order = [0, 'cat', 1, 2, 'frog', 3, 4, 'capybara', 5, 6, 'axolotl', 7, 8, 'unicorn', 9, 10, 'panda', 11] as const;
  for (const o of order) {
    if (typeof o === 'number') { const k = furn[o]; things.push({ name: ITEMS[k].name, price: ITEMS[k].price, art: furnitureArt(k) }); }
    else things.push({ name: PETS[o].name, price: PETS[o].price, art: trim(petCanvas(o, 0)) });
  }
}
function pricePill(cx: number, cy: number, price: string, size = 30) {
  const w = measure(price, size, 700) + 80, h = size + 22;
  c.fillStyle = BLUE; c.strokeStyle = INK; c.lineWidth = 4;
  c.fillStyle = INK; c.beginPath(); c.roundRect(cx - w / 2, cy - h / 2 + 5, w, h, 12); c.fill();
  c.fillStyle = BLUE; c.beginPath(); c.roundRect(cx - w / 2, cy - h / 2, w, h, 12); c.fill(); c.stroke();
  pixel(coinImg, cx - w / 2 + 14, cy - size / 2 - 1, size + 2, size + 2);
  text(price, cx + 18, cy + 2, size, '#fff', 700);
}
function sceneShop(t: number) {
  if (t < 11.2 || t > 15.6) return;
  const cols = 6, cw = 236, ch = 250, gx = 34, gy = 34;
  const x0 = W / 2 - (cols * cw + (cols - 1) * gx) / 2, y0 = 210;
  things.forEach((th, i) => {
    const pin = outBack(prog(t, 11.25 + i * 0.125, 11.25 + i * 0.125 + 0.3));
    const pout = prog(t, 15.0 + (17 - i) * 0.015, 15.0 + (17 - i) * 0.015 + 0.2);
    const s = pin * (1 - inOut(pout));
    if (s <= 0) return;
    const x = x0 + (i % cols) * (cw + gx), y = y0 + Math.floor(i / cols) * (ch + gy);
    group(1, 0, () => {
      card(x, y, cw, ch, 22, PAPER, 5, 7);
      text(th.name, x + cw / 2, y + 34, 28, INK, 700);
      const fit = Math.min(160 / th.art.width, 125 / th.art.height), z = Math.max(1, Math.floor(fit * 2) / 2);
      const aw = th.art.width * z, ah = th.art.height * z;
      pixel(th.art, x + cw / 2 - aw / 2, y + 180 - ah, aw, ah);
      pricePill(x + cw / 2, y + 215, th.price.toLocaleString('en-US'), 28);
    }, s, x + cw / 2, y + ch / 2);
  });
  caption('Spend coins on furniture & pets', t, 11.25, 15.0);
}

// ---------- scene 5: the dragon ----------
let dragon: HTMLImageElement;
function sceneDragon(t: number) {
  const pin = outBack(prog(t, 15.25, 15.6)), pout = inOut(prog(t, 18.5, 18.8));
  if (pin <= 0 || pout >= 1) return;
  group(1 - pout, -pout * 60, () => {
    const hop = Math.floor((t * 1000) / 400) % 2 ? 0 : -14;
    const z = 24, dw = dragon.width * z, dh = dragon.height * z, cx = 760, base = 790;
    // soft glow + sparkles around the prize
    c.fillStyle = 'rgba(242,193,78,0.22)';
    c.beginPath(); c.arc(cx, base - dh / 2, 270 * pin, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(58,38,51,0.16)'; c.beginPath(); c.ellipse(cx, base + 6, 150 * pin, 22 * pin, 0, 0, Math.PI * 2); c.fill();
    group(1, 0, () => pixel(dragon, cx - dw / 2, base - dh + hop, dw, dh), pin, cx, base);
    for (let i = 0; i < 6; i++) {
      const a = i * 1.047 + t * 0.6, r = 300 + 18 * Math.sin(t * 4 + i), tw = 0.5 + 0.5 * Math.sin(t * 6 + i * 2);
      const sx = cx + Math.cos(a) * r, sy = base - dh / 2 + Math.sin(a) * r * 0.75, sz = (10 + 8 * tw) * pin;
      c.fillStyle = i % 2 ? GOLD : '#fff3b0';
      c.fillRect(sx - sz, sy - 3, sz * 2, 6); c.fillRect(sx - 3, sy - sz, 6, sz * 2);
    }
    bubble('my dragon got a crown 👑', 1370, 450, prog(t, 16.5, 16.8), 44, 'Kai');
    group(prog(t, 16.0, 16.3), (1 - outCubic(prog(t, 16.0, 16.4))) * 20, () => text("(that's ~33 hours of studying)", W / 2, 960, 54, MUTED, 600));
  });
  caption('Baby dragon: 2,000 coins', t, 15.3, 18.5, 110, 72);
}

// ---------- scene 6: outro ----------
const PARADE = ['hamster', 'duckling', 'frog', 'penguin', 'cat', 'puppy', 'capybara', 'fox', 'panda', 'axolotl', 'unicorn', 'dragon'];
function sceneOutro(t: number) {
  if (t < 18.7) return;
  const now = BASE + t * 1000;
  const pi = outBack(prog(t, 18.75, 19.1)), pw = prog(t, 19.0, 19.3), pu = outBack(prog(t, 19.5, 19.85));
  group(prog(t, 18.75, 18.9), 0, () => pixel(icon, W / 2 - 110, 150, 220, 220), pi, W / 2, 260);
  group(pw, (1 - outCubic(pw)) * 30, () => text('Auralis', W / 2, 470, 160, INK, 700));
  group(pw, (1 - outCubic(pw)) * 30, () => text('Free · study with your friends', W / 2, 590, 54, MUTED, 600));
  group(prog(t, 19.5, 19.7), 0, () => {
    const s = 'auralis-ebon.vercel.app', w = measure(s, 54, 700) + 90;
    c.fillStyle = INK; c.beginPath(); c.roundRect(W / 2 - w / 2, 670 + 8, w, 96, 48); c.fill();
    c.fillStyle = BLUE; c.strokeStyle = INK; c.lineWidth = 5;
    c.beginPath(); c.roundRect(W / 2 - w / 2, 670, w, 96, 48); c.fill(); c.stroke();
    text(s, W / 2, 720, 54, '#fff', 700);
  }, pu, W / 2, 718);
  // a parade of pets hopping along the bottom, drawn by the game
  const g = parade.getContext('2d')!;
  g.imageSmoothingEnabled = false; g.clearRect(0, 0, parade.width, parade.height);
  const drift = (t - 18.7) * 18;
  PARADE.forEach((k, i) => drawPet(g, k, Math.round(((i * 28 + drift) % (PARADE.length * 28)) - 16), 2, true, false, now + i * 137));
  group(prog(t, 18.8, 19.2), 0, () => pixel(parade, 0, 1080 - parade.height * 6 - 30, parade.width * 6, parade.height * 6));
}
const parade = document.createElement('canvas');
parade.width = 320; parade.height = 18;

// ---------- frame ----------
function frame(t: number) {
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  drawPaper(c, W, H, 6);
  if (t < 7.5) sceneRoom(t);
  sceneTogether(t);
  sceneShop(t);
  sceneDragon(t);
  sceneOutro(t);
}

(window as any).ready = (async () => {
  await document.fonts.load(F(60, 700)); await document.fonts.load(F(60, 600)); await document.fonts.ready;
  coinImg = await img(coinURL());
  icon = await img('/icon.svg');
  shot = await img('/docs/screenshots/focus.png');
  dragon = await img(petIconURL('dragon', 0, 'crown'));
  buildShop();
  (window as any).renderAt = frame;
  frame(Number(new URLSearchParams(location.search).get('t') ?? 6.6));
  return true;
})();
