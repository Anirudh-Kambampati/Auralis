import {
  buildGrid, walkable, canPlace, roomSize, colorsFor, ITEMS, PETS, MAX_PETS, EXPAND_COST, ROOM_SIZES,
  WALLPAPERS, WALL_PATTERNS, FLOORS, FLOOR_STYLES, SKINS, HAIRS, SHIRTS, STYLES, FACES, OUTFITS, FOCUS_LENGTHS,
  COLS, WALL_H, WALL, FLOOR, DOOR, BLOCKED,
} from '../shared/game.js';
import {
  T, OVERHANG, drawSeated, drawSeam, drawFloor, drawWall, drawWallFace, drawWallTop, drawDoor, drawWindow, drawPainting, drawFurniture, drawAvatar,
  coinURL, uiIconURL, drawPaper, paintBlockText, drawWindow as drawWin, type Look,
} from './draw';
import { drawPet, petPos, petIconURL, seedOf } from './pets';
import { chart, streak, rangeTitle, shift, hm, RANGES } from '../shared/stats.js';
import './style.css';

type Furniture = { item: string; x: number; y: number; v?: number; flip?: boolean };
type Room = { wallpaper: string; floor: string; pattern?: string; floorStyle?: string; level?: number; furniture: Furniture[] };
type Member = {
  id: string; name: string; look: Look; room: Room; focus: { minutes: number; endsAt: number } | null;
  totalMinutes: number; online: boolean; pos: { x: number; y: number } | null; pets: { kind: string }[];
};
type Todo = { id: number; text: string; done: boolean; by: string };
type Chat = { id: number; from: string; by: string; text: string; at: number };
type Session = { at: number; minutes: number; tag: string };
type Me = { id: string; coins: number; inventory: Record<string, number>; sessions: Session[]; subjects: string[]; hiddenSubjects: string[] };
type Board = { scope: string; period: string; rows: { name: string; me: boolean; minutes: number }[] };
type Avatar = { x: number; y: number; tx: number; ty: number; up: boolean; dist: number };
type ItemKey = keyof typeof ITEMS;
type PetKey = keyof typeof PETS;

const $ = <E extends HTMLElement>(s: string) => document.querySelector(s) as E;
const canvas = $<HTMLCanvasElement>('#game');
const ctx = canvas.getContext('2d')!;
const panel = $('#panel');

// Who I am comes from the server once my login token is accepted.
let myId = '';
let token = localStorage.getItem('auralis.token');
const legacyId = localStorage.getItem('auralis.id'); // guest progress from before accounts; claimed at sign-up
const apiBase = import.meta.env.VITE_API ?? '';

let members: Member[] = [];
let todos: Todo[] = [];
let chat: Chat[] = [];
let houseCode = '';
let me: Me = { id: myId, coins: 0, inventory: {}, sessions: [], subjects: [], hiddenSubjects: [] };
let statsTab = 'mine';
let statsRange = 'week';
let statsAnchor = Date.now();
let boardScope = 'house', boardPeriod = 'week';
let board: Board | null = null;
let grid = buildGrid([]);
let petSpots: { x: number; y: number }[][] = []; // walkable floor tiles per room, for pets to wander
const avatars = new Map<string, Avatar>();
const bubbles = new Map<string, { text: string; until: number }>();
let lastChatId = -1;
let unread = false;
let path: { x: number; y: number }[] = [];
let openPanel: string | null = null;
let shopTab = 'cozy';
let placing: ItemKey | null = null;
let moving: number | null = null; // index of the furniture picked up in Decorate
let drag: { index: number; gx: number; gy: number; lx: number; ly: number; moved: boolean } | null = null;
let doneSentFor = 0;
let view = { ox: 0, oy: 0, scale: 1 };
let cam: { x: number; y: number; scale: number } | null = null; // camera target in art pixels, eased
let camRoom = 0;

// ---------- network ----------
let ws: WebSocket;
const serverUrl = import.meta.env.VITE_SERVER ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
function connect() {
  ws = new WebSocket(serverUrl);
  ws.onopen = () => send({ t: 'hello', token });
  ws.onclose = () => { if (token) setTimeout(connect, 1500); };
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
}
const send = (m: object) => ws?.readyState === 1 && ws.send(JSON.stringify(m));

function onMessage(m: any) {
  if (m.t === 'auth') {
    signOut(false); // token expired or revoked
    return;
  }
  if (m.t === 'state') {
    myId = m.me.id;
    if (m.house.code !== houseCode) avatars.delete(myId); // moved house: start in my own room
    const wasFocusing = !!myMember()?.focus;
    houseCode = m.house.code;
    members = m.house.members;
    todos = m.house.todos;
    me = m.me;
    grid = buildGrid(members.map((x) => x.room));
    petSpots = members.map((_, i) => {
      const spots = [];
      for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) if (grid.owner[y * grid.w + x] === i && grid.at(x, y) === FLOOR) spots.push({ x, y });
      return spots;
    });
    chairs = new Map();
    members.forEach((mem, i) => {
      const o = grid.origins[i];
      for (const f of mem.room.furniture) if (f.item === 'chair') chairs.set(chairKey(o.x + f.x, o.y + f.y), furnColor(f));
    });
    const canStand = (x: number, y: number) => walkable(grid.at(x, y)) || chairs.has(chairKey(x, y));
    for (const mem of members) {
      let a = avatars.get(mem.id);
      const spot = mem.id !== myId && mem.pos && canStand(mem.pos.x, mem.pos.y) ? mem.pos : null;
      if (!a || !canStand(Math.round(a.tx), Math.round(a.ty))) {
        const s = spot ?? roomSpawn(members.indexOf(mem));
        a = { x: s.x, y: s.y, tx: s.x, ty: s.y, up: false, dist: 0 };
        avatars.set(mem.id, a);
        if (mem.id === myId) { path = []; send({ t: 'pos', x: s.x, y: s.y }); }
      }
    }
    for (const id of avatars.keys()) if (!members.some((x) => x.id === id)) avatars.delete(id);
    receiveChat(m.house.chat);
    const mine = myMember();
    if (pendingLook && mine) { send({ t: 'look', name: mine.name, look: pendingLook }); pendingLook = null; }
    const focusing = !!myMember()?.focus;
    if (focusing && !wasFocusing) { deckHidden = false; goSit(); }
    if (!focusing && wasFocusing) standUp();
    renderHud();
    renderSide();
    if (openPanel && openPanel !== 'social') renderPanel();
  } else if (m.t === 'pos') {
    const a = avatars.get(m.id);
    if (a) { a.tx = m.x; a.ty = m.y; }
  } else if (m.t === 'leaderboard') {
    board = m;
    if (openPanel === 'stats') renderPanel();
  } else if (m.t === 'reward') {
    toast(`Session complete! +${m.coins} ${coin()}${m.withFriends ? ' (study buddy bonus!)' : ''}`, 'reward');
  } else if (m.t === 'error') {
    toast(esc(m.text));
  }
}

// New chat lines pop up as speech bubbles over the speaker for a few seconds.
function receiveChat(list: Chat[]) {
  const first = lastChatId < 0;
  for (const c of list) {
    if (c.id <= lastChatId) continue;
    if (!first) {
      bubbles.set(c.from, { text: c.text, until: Date.now() + 6000 });
      if (c.from !== myId && !document.body.classList.contains('side-open')) unread = true;
    }
  }
  chat = list;
  lastChatId = Math.max(lastChatId, 0, ...list.map((c) => c.id));
}

// ---------- house helpers ----------
const myIndex = () => members.findIndex((m) => m.id === myId);
const myMember = () => members[myIndex()];
const furnColor = (f: Furniture) => (f.v === undefined ? undefined : colorsFor(f.item)[f.v]);

let chairs = new Map<number, string | undefined>(); // chair tile -> its colour
const chairKey = (x: number, y: number) => y * 10000 + x;
let seat: { x: number; y: number } | null = null; // chair to sit on once the walk there ends

// Walk to my own chair (preferring one just behind a desk) and sit down facing the room.
function goSit() {
  const i = myIndex();
  const room = members[i]?.room;
  const a = avatars.get(myId);
  if (!room || !a) return;
  const own = room.furniture.filter((f) => f.item === 'chair');
  const atDesk = (c: Furniture) =>
    room.furniture.some((d) => d.item === 'desk' && c.x >= d.x && c.x < d.x + ITEMS.desk.w && c.y + 1 === d.y);
  const c = own.find(atDesk) ?? own[0];
  if (!c) return;
  const o = grid.origins[i];
  const cx = o.x + c.x, cy = o.y + c.y;
  if (a.tx === cx && a.ty === cy) return;
  const p = bfs({ x: a.tx, y: a.ty }, (x, y) => Math.abs(x - cx) + Math.abs(y - cy) === 1);
  if (!p) return;
  path = p.slice(1);
  seat = { x: cx, y: cy };
}

function standUp() {
  const a = avatars.get(myId);
  if (!a || !chairs.has(chairKey(a.tx, a.ty))) return;
  const s = nearestWalkable(a.tx, a.ty - 1);
  walkTo(s.x, s.y);
}

function roomSpawn(i: number) {
  const o = grid.origins[Math.max(i, 0)] ?? { x: 1, y: WALL_H };
  return nearestWalkable(o.x + 5, o.y + 4);
}

function bfs(from: { x: number; y: number }, done: (x: number, y: number) => boolean, pass = (x: number, y: number) => walkable(grid.at(x, y))) {
  const prev = new Map<number, number>();
  const key = (x: number, y: number) => y * grid.w + x;
  const queue = [from];
  prev.set(key(from.x, from.y), -1);
  while (queue.length) {
    const c = queue.shift()!;
    if (done(c.x, c.y)) {
      const out = [];
      for (let k = key(c.x, c.y); k !== -1; k = prev.get(k)!) out.unshift({ x: k % grid.w, y: Math.floor(k / grid.w) });
      return out;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { x: c.x + dx, y: c.y + dy };
      if (!prev.has(key(n.x, n.y)) && pass(n.x, n.y)) {
        prev.set(key(n.x, n.y), key(c.x, c.y));
        queue.push(n);
      }
    }
  }
  return null;
}

function nearestWalkable(x: number, y: number) {
  const p = bfs({ x, y }, (cx, cy) => walkable(grid.at(cx, cy)), (cx, cy) => grid.at(cx, cy) !== 0);
  return p ? p[p.length - 1] : { x, y };
}

function walkTo(x: number, y: number) {
  const a = avatars.get(myId);
  if (!a || !walkable(grid.at(x, y))) return;
  seat = null;
  const p = bfs({ x: a.tx, y: a.ty }, (cx, cy) => cx === x && cy === y);
  if (p) path = p.slice(1);
}

function furnitureAt(room: Room, lx: number, ly: number) {
  const hits = room.furniture
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => {
      const it = ITEMS[f.item as ItemKey];
      return it && lx >= f.x && lx < f.x + it.w && ly >= f.y && ly < f.y + it.h;
    });
  return (hits.find(({ f }) => ITEMS[f.item as ItemKey].solid) ?? hits[0])?.i ?? -1;
}

const without = (room: Room, index: number) => ({ ...room, furniture: room.furniture.filter((_, k) => k !== index) });

// ---------- input ----------
function tileAt(e: PointerEvent) {
  const dpr = devicePixelRatio || 1;
  return {
    tx: Math.floor((e.clientX * dpr / view.scale - view.ox) / T),
    ty: Math.floor((e.clientY * dpr / view.scale - view.oy) / T),
  };
}

canvas.addEventListener('pointerdown', (e) => {
  const { tx, ty } = tileAt(e);
  const mine = myMember();
  if (openPanel === 'decorate' && mine) {
    const o = grid.origins[myIndex()];
    const lx = tx - o.x, ly = ty - o.y;
    const i = furnitureAt(mine.room, lx, ly);
    if (placing) {
      if (canPlace(mine.room, placing, lx, ly)) { send({ t: 'place', item: placing, x: lx, y: ly }); placing = null; }
      else toast('That spot is taken or outside your room.');
    } else if (i >= 0) {
      // Grab it: drag to move, or just tap to select it.
      const f = mine.room.furniture[i];
      moving = i;
      drag = { index: i, gx: lx - f.x, gy: ly - f.y, lx: f.x, ly: f.y, moved: false };
      canvas.setPointerCapture(e.pointerId);
    } else if (moving !== null) {
      const f = mine.room.furniture[moving];
      if (f && canPlace(without(mine.room, moving), f.item, lx, ly)) send({ t: 'move', index: moving, x: lx, y: ly });
      else toast("It doesn't fit there.");
    }
    renderPanel();
    return;
  }
  walkTo(tx, ty);
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const { tx, ty } = tileAt(e);
  const o = grid.origins[myIndex()];
  const lx = tx - o.x - drag.gx, ly = ty - o.y - drag.gy;
  if (lx !== drag.lx || ly !== drag.ly) { drag.lx = lx; drag.ly = ly; drag.moved = true; }
});

canvas.addEventListener('pointerup', () => {
  const mine = myMember();
  if (!drag || !mine) { drag = null; return; }
  const f = mine.room.furniture[drag.index];
  if (drag.moved && f) {
    if (canPlace(without(mine.room, drag.index), f.item, drag.lx, drag.ly)) send({ t: 'move', index: drag.index, x: drag.lx, y: drag.ly });
    else toast("It doesn't fit there.");
  }
  drag = null;
});

addEventListener('keydown', (e) => {
  const a = avatars.get(myId);
  const d = ({ ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] } as Record<string, number[]>)[e.key];
  if (!a || !d || (e.target as HTMLElement).tagName === 'INPUT') return;
  const n = path[path.length - 1] ?? { x: a.tx, y: a.ty };
  if (walkable(grid.at(n.x + d[0], n.y + d[1]))) path = [...path.slice(0, 1), { x: n.x + d[0], y: n.y + d[1] }];
});

// ---------- loop ----------
let last = performance.now();
function frame(t: number) {
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  step(dt);
  render(t);
  requestAnimationFrame(frame);
}

function step(dt: number) {
  const speed = 4.5; // tiles per second
  for (const [id, a] of avatars) {
    if (id === myId && a.x === a.tx && a.y === a.ty && path.length) {
      const n = path.shift()!;
      a.up = n.y < a.ty;
      a.tx = n.x; a.ty = n.y;
      send({ t: 'pos', x: n.x, y: n.y });
    } else if (id === myId && seat && a.x === a.tx && a.y === a.ty) {
      a.tx = seat.x; a.ty = seat.y; a.up = true;
      send({ t: 'pos', x: seat.x, y: seat.y });
      seat = null;
    }
    const dx = a.tx - a.x, dy = a.ty - a.y;
    const d = Math.hypot(dx, dy);
    if (d > 3) { a.x = a.tx; a.y = a.ty; continue; } // far jump (e.g. joined late): snap
    if (d > 0) {
      if (id !== myId && Math.abs(dy) > 0.01) a.up = dy < 0;
      const m = Math.min(d, speed * dt);
      a.x += (dx / d) * m; a.y += (dy / d) * m;
      a.dist += m;
    }
  }
  const focus = myMember()?.focus;
  if (focus && Date.now() >= focus.endsAt && doneSentFor !== focus.endsAt) {
    doneSentFor = focus.endsAt;
    send({ t: 'focus_done' });
  }
}

function render(t: number) {
  const dpr = devicePixelRatio || 1;
  const cw = Math.round(innerWidth * dpr), ch = Math.round(innerHeight * dpr);
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw; canvas.height = ch;
    // Match CSS size to whole device pixels so the browser never resamples the canvas.
    canvas.style.width = `${cw / dpr}px`; canvas.style.height = `${ch / dpr}px`;
  }
  ctx.imageSmoothingEnabled = false; // sprites are pre-baked canvases; smoothing would blur them when scaled up
  const me_ = avatars.get(myId) ?? { x: 0, y: 0 };
  const now = Date.now();
  // Fit and centre my room in the part of the screen not covered by the HUD, dock, deck, side bar or panel.
  const deck = $('#deck'), dock = $('#dock'), side = $('#side');
  const wide = innerWidth >= 900;
  const sheet = !wide ? (!panel.hidden ? panel : document.body.classList.contains('side-open') ? side : null) : null;
  const below = !deck.hidden ? deck.offsetHeight + (wide ? 24 : 0) : sheet ? sheet.offsetHeight + dock.offsetHeight + 40 : dock.offsetHeight + 24;
  const coverTop = 70 * dpr, coverBottom = below * dpr;
  const coverRight = wide && !panel.hidden ? (panel.offsetWidth + 20) * dpr : 0;
  const coverLeft = wide ? (side.offsetWidth + 20) * dpr : 0;
  const aw = cw - coverRight - coverLeft, ah = Math.max(ch * 0.3, ch - coverTop - coverBottom);
  // Frame the room I'm standing in (keep the last one while I'm in an opening or doorway).
  const here = grid.owner[Math.round(me_.y) * grid.w + Math.round(me_.x)];
  if (here >= 0) camRoom = here;
  const ri = Math.min(camRoom, grid.origins.length - 1);
  const o = grid.origins[ri] ?? { x: 1, y: WALL_H }, size = grid.sizes[ri] ?? roomSize(undefined);
  const roomW = (size.w + 2) * T, roomH = (size.h + WALL_H + 1) * T; // room plus its walls
  const scale = Math.max(1, Math.floor(Math.min(aw / (roomW + T), ah / (roomH + T / 2))));
  const vw = aw / scale, vh = ah / scale;
  // Centre the whole room when it fits on screen; otherwise follow the player.
  const fits = roomW <= vw && roomH <= vh;
  const tx = fits ? (o.x - 1) * T + roomW / 2 : me_.x * T + 8;
  const ty = fits ? (o.y - WALL_H) * T + roomH / 2 : me_.y * T + 8;
  if (!cam || cam.scale !== scale) cam = { x: tx, y: ty, scale };
  cam.x += (tx - cam.x) * 0.12; // glide when moving to another room
  cam.y += (ty - cam.y) * 0.12;
  view = { scale, ox: Math.round(coverLeft / scale + vw / 2 - cam.x), oy: Math.round(coverTop / scale + vh / 2 - cam.y) };

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawPaper(ctx, cw, ch, scale);
  ctx.setTransform(scale, 0, 0, scale, view.ox * scale, view.oy * scale);

  // Soft drop shadow under the whole house, like a diorama on a table.
  ctx.fillStyle = 'rgba(43,37,48,0.13)';
  for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) if (grid.at(x, y)) ctx.fillRect(x * T + 5, y * T + 7, T, T);

  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const k = grid.at(x, y);
      const px = x * T, py = y * T;
      const room = (dy: number) => members[grid.owner[(y + dy) * grid.w + x]]?.room;
      if (k === FLOOR || k === BLOCKED) {
        const r = room(0);
        drawFloor(ctx, px, py, r?.floor ?? FLOORS[0], x, y, r?.floorStyle);
      } else if (k === DOOR) {
        // An opening between side-by-side rooms shows both floors; a doorway between rows is plain wood.
        const l = room(0) ?? members[grid.owner[y * grid.w + x - 1]]?.room, rr = members[grid.owner[y * grid.w + x + 1]]?.room;
        if (l && rr) drawSeam(ctx, px, py, x, y, l, rr);
        else drawDoor(ctx, px, py, x, y);
      }
      else if (k === WALL) {
        // Two-tile back wall: the row touching the floor gets the panel strip, the row above it the crown.
        const below = y + 1 < grid.h ? room(1) : undefined;
        const below2 = y + 2 < grid.h && grid.at(x, y + 1) === WALL ? room(2) : undefined;
        if (below) drawWallFace(ctx, px, py, below.wallpaper, below.pattern);
        else if (below2) drawWallTop(ctx, px, py, below2.wallpaper, below2.pattern);
        else drawWall(ctx, px, py);
      }
    }
  }

  // One crisp outline around the outside of the house, and soft shade where walls meet the floor.
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const k = grid.at(x, y);
      if (!k) continue;
      const px = x * T, py = y * T;
      ctx.fillStyle = '#2b2530';
      if (!grid.at(x - 1, y)) ctx.fillRect(px - 1, py - 1, 2, T + 2);
      if (!grid.at(x + 1, y)) ctx.fillRect(px + T - 1, py - 1, 2, T + 2);
      if (!grid.at(x, y - 1)) ctx.fillRect(px - 1, py - 1, T + 2, 2);
      if (!grid.at(x, y + 1)) ctx.fillRect(px - 1, py + T - 1, T + 2, 2);
      if (k === FLOOR || k === BLOCKED) {
        ctx.fillStyle = 'rgba(43,37,48,0.08)';
        if (grid.at(x - 1, y) === WALL) ctx.fillRect(px, py, 2, T);
        if (grid.at(x + 1, y) === WALL) ctx.fillRect(px + T - 2, py, 2, T);
      }
    }
  }

  // Top-row rooms get windows to the outside (more as the room grows); inner rooms get a painting.
  members.forEach((_, i) => {
    const o = grid.origins[i], s = grid.sizes[i];
    const wy = (o.y - WALL_H) * T;
    if (i < COLS) for (let lx = 1; lx + 2 <= s.w - 1; lx += 6) drawWindow(ctx, (o.x + lx) * T, wy, 'day');
    else drawPainting(ctx, (o.x + 1) * T, wy + 8);
  });

  // Rugs under everything, then furniture, pets and avatars sorted by their bottom edge.
  const sprites: { y: number; draw: () => void }[] = [];
  // Chairs someone is studying in are drawn by drawSeated, wrapped around the player.
  const occupied = new Set<number>();
  for (const m of members) {
    const a = avatars.get(m.id);
    if (a && m.focus && (m.online || m.id === myId) && a.x === a.tx && a.y === a.ty && chairs.has(chairKey(a.x, a.y))) {
      occupied.add(chairKey(a.x, a.y));
    }
  }
  members.forEach((m, i) => {
    const o = grid.origins[i];
    m.room.furniture.forEach((f, idx) => {
      const it = ITEMS[f.item as ItemKey];
      if (!it || (f.item === 'chair' && occupied.has(chairKey(o.x + f.x, o.y + f.y)))) return;
      const dragged = drag?.moved && m.id === myId && drag.index === idx;
      const draw = () => {
        if (dragged) ctx.globalAlpha = 0.35;
        drawFurniture(ctx, f.item, (o.x + f.x) * T, (o.y + f.y) * T, t, furnColor(f), f.flip, it.w);
        ctx.globalAlpha = 1;
      };
      if (!it.solid) draw();
      else sprites.push({ y: o.y + f.y + it.h - 0.5, draw });
    });
    m.pets?.forEach((p, slot) => {
      const spots = petSpots[i];
      if (!spots?.length) return;
      const pos = petPos(seedOf(m.id, slot), now, spots);
      sprites.push({ y: pos.y + 0.9, draw: () => drawPet(ctx, p.kind, Math.round(pos.x * T), Math.round(pos.y * T), pos.moving, pos.left, now) });
    });
  });
  const labels: { x: number; y: number; m: Member; seated: boolean }[] = [];
  for (const m of members) {
    const a = avatars.get(m.id);
    if (!a || (!m.online && m.id !== myId)) continue;
    const walking = a.x !== a.tx || a.y !== a.ty;
    const seated = !!m.focus && !walking && occupied.has(chairKey(a.x, a.y));
    const stepFrame = walking ? 1 + (Math.floor(a.dist * 4) % 2) : 0;
    const ax = Math.round(a.x * T), ay = Math.round(a.y * T);
    const chairCol = chairs.get(chairKey(a.x, a.y));
    sprites.push({
      y: a.y + 0.99,
      draw: () => (seated ? drawSeated(ctx, m.look, ax, ay, t, chairCol) : drawAvatar(ctx, m.look, ax, ay, stepFrame, a.up)),
    });
    labels.push({ x: a.x, y: a.y, m, seated });
  }
  sprites.sort((p, q) => p.y - q.y).forEach((s) => s.draw());

  const mine = myMember();
  if (openPanel === 'decorate' && mine) {
    const o = grid.origins[myIndex()], s = grid.sizes[myIndex()];
    ctx.strokeStyle = placing ? '#ffe08a' : '#ffffffaa';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 2]);
    ctx.strokeRect(o.x * T + 0.5, o.y * T + 0.5, s.w * T - 1, s.h * T - 1);
    ctx.setLineDash([]);
    const f = moving !== null ? mine.room.furniture[moving] : null;
    const it = f && ITEMS[f.item as ItemKey];
    if (f && it) {
      const gx = drag?.moved ? drag.lx : f.x, gy = drag?.moved ? drag.ly : f.y;
      if (drag?.moved) {
        // Ghost of the piece being dragged, outlined green where it fits and red where it doesn't.
        drawFurniture(ctx, f.item, (o.x + gx) * T, (o.y + gy) * T, t, furnColor(f), f.flip, it.w);
        ctx.strokeStyle = canPlace(without(mine.room, moving!), f.item, gx, gy) ? '#6fcf8a' : '#e06a5a';
      } else ctx.strokeStyle = '#f2c14e';
      ctx.lineWidth = 2;
      ctx.strokeRect((o.x + gx) * T + 1, (o.y + gy) * T + 1, it.w * T - 2, it.h * T - 2);
    }
  }

  // Text in device pixels so it stays crisp.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.textAlign = 'center';
  for (const { x, y, m, seated } of labels) {
    // A studying player gets a bigger timer bubble floating over their desk.
    const sx = (view.ox + x * T + 8) * scale, sy = (view.oy + y * T - (seated ? 30 : 7)) * scale;
    const fs = Math.max(12, (seated ? 4.5 : 3) * scale);
    ctx.font = `600 ${fs}px 'Fredoka', system-ui, sans-serif`;
    const text = m.focus ? `📖 ${fmt(m.focus.endsAt - now)}` : m.name;
    const w = ctx.measureText(text).width + fs;
    ctx.beginPath();
    ctx.roundRect(sx - w / 2, sy - fs * 1.2, w, fs * 1.5, fs * 0.5);
    ctx.fillStyle = m.focus ? '#5b7fd6' : '#2b2530';
    ctx.fill();
    if (seated) {
      ctx.lineWidth = Math.max(2, scale / 2);
      ctx.strokeStyle = '#2b2530';
      ctx.stroke();
      ctx.beginPath(); // little tail pointing down at the player
      ctx.moveTo(sx - fs * 0.3, sy + fs * 0.3);
      ctx.lineTo(sx + fs * 0.3, sy + fs * 0.3);
      ctx.lineTo(sx, sy + fs * 0.7);
      ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.fillText(text, sx, sy);

    // Chat speech bubble above the name.
    const b = bubbles.get(m.id);
    if (b && b.until > now) {
      const bf = Math.max(12, 3 * scale);
      ctx.font = `500 ${bf}px 'Fredoka', system-ui, sans-serif`;
      const msg = b.text.length > 38 ? `${b.text.slice(0, 37)}…` : b.text;
      const bw = ctx.measureText(msg).width + bf * 1.2;
      const by = sy - fs * 1.5 - bf * 0.6;
      ctx.beginPath();
      ctx.roundRect(sx - bw / 2, by - bf * 1.3, bw, bf * 1.7, bf * 0.6);
      ctx.fillStyle = '#fffaf3';
      ctx.fill();
      ctx.lineWidth = Math.max(2, scale / 2);
      ctx.strokeStyle = '#2b2530';
      ctx.stroke();
      ctx.fillStyle = '#2b2530';
      ctx.fillText(msg, sx, by);
    }
  }
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// ---------- UI ----------
const THEMES: Record<string, { title: string; icon: string; color: string }> = {
  focus: { title: 'Focus', icon: 'clock', color: '#cfdcf5' },
  decorate: { title: 'Decorate', icon: 'chair', color: '#d3e8d6' },
  shop: { title: 'Shop', icon: 'bag', color: '#f6e3b4' },
  avatar: { title: 'You', icon: 'face', color: '#f3d3dc' },
  house: { title: 'House', icon: 'house', color: '#ddd3ef' },
  stats: { title: 'Stats', icon: 'chart', color: '#fbe0c8' },
};
const TAG_COLORS = ['#9db4ee', '#f4a6b8', '#8fd0a8', '#ffd27a', '#b89af0', '#f2b48a'];

// Shop shelves, each shown by one of its items (or a pet / the house icon) on the category rail.
const SHOP_TABS: { id: string; label: string; items?: ItemKey[] }[] = [
  { id: 'cozy', label: 'Seating', items: ['beanbag', 'armchair', 'sofa', 'bed'] },
  { id: 'tables', label: 'Tables', items: ['coffeeTable', 'bookshelf', 'wardrobe'] },
  { id: 'plants', label: 'Plants', items: ['cactus', 'plant', 'sunflower', 'bonsai'] },
  { id: 'decor', label: 'Decor', items: ['books', 'lamp', 'globe', 'rug', 'roundRug', 'mirror', 'plush', 'easel'] },
  { id: 'fun', label: 'Hobbies', items: ['recordPlayer', 'guitar', 'aquarium', 'piano'] },
  { id: 'pets', label: 'Pets' },
  { id: 'room', label: 'Room size' },
];

const coinSrc = coinURL();
const coin = () => `<img class="coin" src="${coinSrc}" alt="coins">`;
$<HTMLImageElement>('#coinIcon').src = coinSrc;
document.querySelectorAll<HTMLImageElement>('img[data-icon]').forEach((img) => (img.src = uiIconURL(img.dataset.icon!)));

const progress = (f: { minutes: number; endsAt: number }) =>
  Math.max(0, Math.min(100, 100 * (1 - (f.endsAt - Date.now()) / (f.minutes * 60_000))));

function renderHud() {
  $('#coins').textContent = String(me.coins);
  $('#code').innerHTML = `<img class="coin" src="${uiIconURL('house')}" alt=""> ${houseCode}`;
  tickTimers();
}

// Timers update in place so open panels (and a half-pressed give-up button) are not re-rendered.
// While focusing, the focus deck replaces the dock until the player switches to room view.
let deckHidden = false;
function tickTimers() {
  const f = myMember()?.focus;
  const showDeck = !!f && !deckHidden;
  $('#focusChip').hidden = !f || showDeck;
  $('#deck').hidden = !showDeck;
  $('#dock').hidden = showDeck;
  if (showDeck && openPanel) setPanel(null);
  document.querySelector('#dock [data-panel="social"]')?.classList.toggle('unread', unread);
  if (!f) return;
  const left = fmt(f.endsAt - Date.now());
  $('#timer').textContent = `📖 ${left}`;
  $('#progress').style.width = `${progress(f)}%`;
  paintBlockText($<HTMLCanvasElement>('#deckTime'), left.padStart(5, '0'), '#2b2530', '#d9cbbb');
  $('#deckFill').style.width = `calc(${progress(f)}% - 6px)`;
  $('#deckMarker').style.left = `${progress(f)}%`;
  const buddies = members.filter((m) => m.id !== myId && m.focus).length;
  $('#deckNote').innerHTML = `Earning ${f.minutes} ${coin()}${buddies ? ` · ✨ ${buddies} studying with you` : ''}`;
  const pt = panel.querySelector('#ptimer'), pb = panel.querySelector<HTMLElement>('#pbar');
  if (pt) pt.textContent = left;
  if (pb) pb.style.width = `${progress(f)}%`;
}
setInterval(tickTimers, 500);

// Two taps instead of confirm(), which some browsers and app shells block.
function armGiveUp(b: HTMLButtonElement, label: string) {
  if (b.classList.contains('armed')) { send({ t: 'focus_cancel' }); return; }
  const text = b.querySelector('span') ?? b;
  b.classList.add('armed');
  text.textContent = 'Tap again';
  setTimeout(() => { b.classList.remove('armed'); text.textContent = label; }, 3000);
}
$<HTMLButtonElement>('#giveUp').addEventListener('click', (e) => armGiveUp(e.currentTarget as HTMLButtonElement, 'Give up'));
$('#hideDeck').addEventListener('click', () => { deckHidden = true; tickTimers(); });
$('#focusChip').addEventListener('click', () => { deckHidden = false; tickTimers(); });
$<HTMLImageElement>('#deckMarker').src = coinSrc;

let toastTimer = 0;
function toast(html: string, kind = '') {
  const el = $('#toast');
  el.innerHTML = `<span>${html}</span>`; // one inline run so bold words don't become separate flex items
  el.className = kind;
  el.hidden = true;
  void el.offsetWidth; // restart the drop-in animation
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), 3200);
}

function copyCode() {
  const shown = () => toast(`Your house code is <b>${houseCode}</b>`);
  if (navigator.clipboard) navigator.clipboard.writeText(houseCode).then(() => toast(`Copied house code <b>${houseCode}</b>!`), shown);
  else shown();
}
$('#code').addEventListener('click', copyCode);

const icons = new Map<string, string>();
function icon(item: string, cls = 'icon') {
  if (!icons.has(item)) {
    const it = ITEMS[item as ItemKey];
    const c = document.createElement('canvas');
    const top = OVERHANG[item] ?? 0;
    c.width = it.w * T; c.height = it.h * T + top;
    drawFurniture(c.getContext('2d')!, item, 0, top, 0);
    icons.set(item, c.toDataURL());
  }
  return `<img class="${cls}" src="${icons.get(item)}" alt="">`;
}
const petIcon = (kind: string, cls = 'icon') => `<img class="${cls}" src="${petIconURL(kind)}" alt="">`;

function avatarPreview(look: Look) {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 22;
  drawAvatar(c.getContext('2d')!, look, 0, 5, 0, false);
  return `<img class="preview" src="${c.toDataURL()}" alt="Your character">`;
}

const swatches = (act: string, list: string[], current: string | number | undefined, byIndex = false) =>
  `<div class="swatches">${list.map((c, i) => `<button class="swatch${(byIndex ? i : c) === current ? ' on' : ''}" style="background:${c}" data-act="${act}" data-v="${byIndex ? i : c}" aria-label="${c}"></button>`).join('')}</div>`;

const choices = (act: string, list: string[], current?: string) =>
  `<div class="row">${list.map((v) => `<button class="${v === current ? 'on' : 'off'}" data-act="${act}" data-v="${v}">${v}</button>`).join('')}</div>`;

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);

function shopBody(mine: Member) {
  const tab = SHOP_TABS.find((x) => x.id === shopTab) ?? SHOP_TABS[0];
  const rail = SHOP_TABS.map((x) => {
    const pic = x.items ? icon(x.items[0], 'rail-icon') : x.id === 'pets' ? petIcon('cat', 'rail-icon') : `<img class="rail-icon" src="${uiIconURL('house')}" alt="">`;
    return `<button class="rail-btn${x.id === tab.id ? ' on' : ''}" data-act="tab" data-v="${x.id}">${pic}<span>${x.label}</span></button>`;
  }).join('');
  let shelf = '';
  if (tab.items) {
    shelf = tab.items.map((k) => {
      const it = ITEMS[k];
      return `<div class="card"><b>${it.name}</b>${icon(k)}<button data-act="buy" data-v="${k}" ${me.coins < it.price ? 'disabled' : ''}>${coin()} ${it.price}</button></div>`;
    }).join('');
  } else if (tab.id === 'pets') {
    const full = mine.pets.length >= MAX_PETS;
    shelf = Object.entries(PETS).map(([k, p]) => {
      const need = p.price - me.coins;
      return `<div class="card pet"><b>${p.name}</b>${petIcon(k, 'icon pet-icon')}
        <button data-act="adopt" data-v="${k}" ${need > 0 || full ? 'disabled' : ''}>${coin()} ${p.price}</button>
        <small class="hint">${full ? 'Room is full of pets' : need > 0 ? `${need} more to go` : 'Ready to adopt!'}</small></div>`;
    }).join('');
  } else {
    const level = mine.room.level ?? 0;
    shelf = ROOM_SIZES.map((s, i) => {
      const state = i <= level ? '<span class="tag">Owned</span>'
        : i === level + 1 ? `<button data-act="expand" ${me.coins < EXPAND_COST[i] ? 'disabled' : ''}>${coin()} ${EXPAND_COST[i]}</button>`
        : `<small class="hint">${coin()} ${EXPAND_COST[i]}</small>`;
      return `<div class="card room-card"><b>${['Cozy', 'Roomy', 'Spacious', 'Grand'][i]}</b>
        <div class="room-mini" style="--w:${s.w};--h:${s.h}"></div><small>${s.w} × ${s.h} tiles</small>${state}</div>`;
    }).join('');
  }
  const note = tab.id === 'pets' ? `<p class="hint">Pets wander your room and your housemates can see them. Up to ${MAX_PETS} pets.</p>`
    : tab.id === 'room' ? '<p class="hint">Upgrades add floor space. Your furniture stays where it is.</p>' : '';
  return `<div class="shop"><nav class="rail">${rail}</nav><div class="shelf">${note}<div class="grid">${shelf}</div></div></div>`;
}

function decorateBody(mine: Member) {
  const inv = Object.entries(me.inventory).filter(([k, n]) => n > 0 && ITEMS[k as ItemKey]);
  const sel = moving !== null ? mine.room.furniture[moving] : null;
  if (!sel) moving = null;
  const palette = sel ? colorsFor(sel.item) : [];
  const selBar = sel ? `<div class="selected">${icon(sel.item)}<b>${ITEMS[sel.item as ItemKey].name}</b>
      <button class="off" data-act="flip" title="Turn it to face the other way">↔ Turn</button>
      <button class="off" data-act="putaway">Put away</button><button data-act="deselect">Done</button></div>
      ${palette.length ? `<h3>Colour</h3>${swatches('recolor', palette, sel.v ?? -1, true)}` : ''}` : '';
  const hint = placing ? `Tap a spot in your room to place the <b>${ITEMS[placing].name}</b>.`
    : sel ? 'Drag it, or tap a new spot to move it there.' : 'Drag any furniture to move it, or tap it for more options.';
  return `${selBar}<p class="hint">${hint}</p>
    ${inv.length ? `<h3>Storage</h3><div class="grid">${inv.map(([k, n]) => `<div class="card${placing === k ? ' on' : ''}"><b>${ITEMS[k as ItemKey].name} ×${n}</b>${icon(k)}<button data-act="place" data-v="${k}">Place</button></div>`).join('')}</div>` : '<p class="hint">Storage is empty. Visit the Shop!</p>'}
    <h3>Wallpaper</h3>${swatches('wallpaper', WALLPAPERS, mine.room.wallpaper)}
    <h3>Pattern</h3>${choices('pattern', WALL_PATTERNS, mine.room.pattern ?? 'plain')}
    <h3>Floor</h3>${swatches('floor', FLOORS, mine.room.floor)}
    <h3>Floor style</h3>${choices('floorStyle', FLOOR_STYLES, mine.room.floorStyle ?? 'planks')}
    <p class="hint">Want more space? Get a bigger room in the Shop.</p>
    <h3>Snapshots</h3>
    <button class="off" data-act="snapshot">📸 Save a picture of my room</button>
    ${snapshotList.length ? `<div class="snaps">${snapshotList.map((s) => `<a href="${s.url}" target="_blank" rel="noopener"><img src="${s.url}" alt="Room snapshot"></a>`).join('')}</div>` : ''}`;
}

function statsBody() {
  const tabs = `<div class="seg">${[['mine', 'My study'], ['board', 'Leaderboard']].map(([k, l]) =>
    `<button class="${statsTab === k ? 'on' : 'off'}" data-act="statsTab" data-v="${k}">${l}</button>`).join('')}</div>`;
  if (statsTab === 'board') {
    const seg = (act: string, cur: string, opts: string[][]) => `<div class="seg small">${opts.map(([k, l]) =>
      `<button class="${cur === k ? 'on' : 'off'}" data-act="${act}" data-v="${k}">${l}</button>`).join('')}</div>`;
    const rows = board && board.scope === boardScope && board.period === boardPeriod ? board.rows : null;
    const medal = (i: number) => ['🥇', '🥈', '🥉'][i] ?? `#${i + 1}`;
    return `${tabs}<div class="row">${seg('scope', boardScope, [['house', 'My house'], ['all', 'Everyone']])}
        ${seg('period', boardPeriod, [['week', 'This week'], ['all', 'All time']])}</div>
      ${!rows ? '<p class="hint">Loading…</p>' : `<ol class="board">${rows.map((r, i) =>
        `<li class="${r.me ? 'me' : ''}"><span class="rank">${medal(i)}</span><b>${esc(r.name)}${r.me ? ' (you)' : ''}</b><span>${hm(r.minutes)}</span></li>`).join('')}</ol>`}
      <p class="hint">Ranked by focused minutes from finished sessions.</p>`;
  }
  const c = chart(me.sessions, statsRange, statsAnchor);
  const max = Math.max(...c.values, 1);
  const future = shift(statsRange, c.from, 1).getTime() > Date.now();
  return `${tabs}
    <div class="seg small">${RANGES.map((r) => `<button class="${statsRange === r ? 'on' : 'off'}" data-act="range" data-v="${r}">${r}</button>`).join('')}</div>
    <div class="period"><button class="off arrow" data-act="prev" aria-label="Earlier">‹</button><b>${rangeTitle(statsRange, c.from)}</b>
      <button class="off arrow" data-act="next" aria-label="Later" ${future ? 'disabled' : ''}>›</button></div>
    <div class="tiles stat-tiles"><div class="stat"><b>${hm(c.total)}</b><small>focused</small></div>
      <div class="stat"><b>${c.count}</b><small>sessions</small></div>
      <div class="stat"><b>${streak(me.sessions)}</b><small>day streak</small></div></div>
    <div class="chart" style="--n:${c.values.length}"><span class="ymax">${hm(max === 1 && !c.total ? 0 : max)}</span>
      ${c.values.map((v, i) => `<div class="col" title="${hm(v)}"><i style="height:${(v / max) * 100}%"></i><span>${c.labels[i]}</span></div>`).join('')}</div>
    <h3>Subjects</h3>
    ${c.tags.length ? `<ul class="tags">${c.tags.map((t, i) => `<li><span class="sw" style="background:${TAG_COLORS[i % TAG_COLORS.length]}"></span>
        <b>${esc(t.tag)}</b><span class="tbar"><i style="width:${t.pct}%;background:${TAG_COLORS[i % TAG_COLORS.length]}"></i></span><small>${t.pct}% · ${hm(t.minutes)}</small></li>`).join('')}</ul>`
      : '<p class="hint">No finished sessions in this period yet.</p>'}`;
}

let lastTag = localStorage.getItem('auralis.tag') ?? '';
// Quick-pick subjects: ones you saved, plus any you've studied at least twice, most-used first.
function quickSubjects() {
  const uses = new Map<string, number>();
  for (const s of me.sessions) uses.set(s.tag, (uses.get(s.tag) ?? 0) + 1);
  const picks = new Set(me.subjects);
  for (const [tag, n] of uses) if (n >= 2 && !me.hiddenSubjects.includes(tag)) picks.add(tag);
  return [...picks].sort((a, b) => (uses.get(b) ?? 0) - (uses.get(a) ?? 0)).slice(0, 10);
}

function subjectChips() {
  const list = quickSubjects();
  if (!list.length) return '<p class="hint">Subjects you use twice show up here for one-tap picking. Tap ★ to save one now.</p>';
  return `<div class="subjects">${list.map((t) => `<span class="subj${t === lastTag ? ' on' : ''}">
      <button data-act="tagpick" data-v="${esc(t)}">${esc(t)}</button><button class="x" data-act="tagdel" data-v="${esc(t)}" aria-label="Remove ${esc(t)}">×</button></span>`).join('')}</div>`;
}

function panelBody(mine: Member) {
  if (openPanel === 'stats') return statsBody();
  if (openPanel === 'focus') {
    const f = mine.focus;
    const others = members.filter((m) => m.id !== myId && m.focus);
    const together = others.length ? `<p class="center">Studying with you: <b>${others.map((m) => esc(m.name)).join(', ')}</b> ✨ +25%</p>` : '';
    return f
      ? `<p class="hint center">Studying at your desk…</p>
         <p class="big" id="ptimer">${fmt(f.endsAt - Date.now())}</p>
         <div class="bar panel-bar"><i id="pbar" style="width:${progress(f)}%"></i></div>
         <p class="center">Finish to earn <b>${f.minutes}</b> ${coin()}</p>${together}
         <div class="center"><button class="danger" data-act="cancel">Give up</button></div>`
      : `<h3>What are you studying?</h3>
         <div class="row"><input id="tag" maxlength="24" placeholder="Study" value="${esc(lastTag)}" aria-label="Subject">
           <button class="off" data-act="tagsave" title="Save as a quick pick">★ Save</button></div>
         ${subjectChips()}
         <h3>How long?</h3>
         <div class="tiles">${FOCUS_LENGTHS.map((n) => `<button class="tile" data-act="focus" data-v="${n}"><b>${n}</b><small>min</small><span class="reward">+${n} ${coin()}</span></button>`).join('')}</div>
         <p class="hint center">You'll walk to your desk and study until the timer ends. Study at the same time as a housemate for +25% coins.</p>${together}`;
  }
  if (openPanel === 'shop') return shopBody(mine);
  if (openPanel === 'decorate') return decorateBody(mine);
  if (openPanel === 'avatar') {
    return `<div class="me">${avatarPreview(mine.look)}<div class="me-info">
        <label>Name <input id="name" maxlength="16" value="${esc(mine.name)}"></label>
        <p class="hint">Total focus: <b>${mine.totalMinutes}</b> min</p>
        <button class="off small-chip" data-act="logout">Log out</button></div></div>
      ${mine.pets.length ? `<h3>Your pets</h3><div class="row">${mine.pets.map((p) => `<span class="pet-chip">${petIcon(p.kind, 'chip-icon')}${PETS[p.kind as PetKey]?.name ?? p.kind}</span>`).join('')}</div>` : ''}
      <h3>Face</h3>${choices('face', FACES, mine.look.face)}
      <h3>Outfit</h3>${choices('outfit', OUTFITS, mine.look.outfit)}
      <h3>Outfit colour</h3>${swatches('shirt', SHIRTS, mine.look.shirt)}
      <h3>Hair style</h3>${choices('style', STYLES, mine.look.style)}
      <h3>Hair colour</h3>${swatches('hair', HAIRS, mine.look.hair)}
      <h3>Skin</h3>${swatches('skin', SKINS, mine.look.skin)}`;
  }
  // house
  return `<p class="hint">Share your code. When friends join, their rooms open up into yours to make one big house.</p>
    <div class="code-big">${houseCode}</div>
    <div class="center"><button class="off" data-act="copy">Copy code</button></div>
    <h3>Housemates</h3>
    <ul class="members">${members.map((m) => `<li><span class="dot${m.online ? ' on' : ''}"></span>${esc(m.name)}${m.id === myId ? ' (you)' : ''}${m.focus ? '<span class="tag">📖 studying</span>' : ''}</li>`).join('')}</ul>
    <h3>Join a friend</h3>
    <div class="row"><input id="join" placeholder="Friend's code" maxlength="5" autocapitalize="characters"><button data-act="join">Join</button></div>
    ${members.length > 1 ? '<button class="danger" data-act="leave">Move out (take my room)</button>' : ''}`;
}

function renderPanel() {
  const mine = myMember();
  if (!openPanel || openPanel === 'social' || !mine) { panel.hidden = true; return; }
  const th = THEMES[openPanel];
  const scroll = panel.querySelector('.pb')?.scrollTop ?? 0;
  panel.hidden = false;
  panel.style.setProperty('--theme', th.color);
  panel.innerHTML = `<header class="ph"><img src="${uiIconURL(th.icon)}" alt=""><h2>${th.title}</h2>
    <button class="close" data-act="close" aria-label="Close">✕</button></header><div class="pb">${panelBody(mine)}</div>`;
  panel.querySelector('.pb')!.scrollTop = scroll;
  const nameInput = panel.querySelector<HTMLInputElement>('#name');
  nameInput?.addEventListener('change', () => send({ t: 'look', name: nameInput.value, look: mine.look }));
}

panel.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
  const mine = myMember();
  if (!b || !mine) return;
  const v = b.dataset.v!;
  const room = mine.room;
  switch (b.dataset.act) {
    case 'close': setPanel(null); break;
    case 'focus': {
      lastTag = panel.querySelector<HTMLInputElement>('#tag')?.value.trim() ?? '';
      localStorage.setItem('auralis.tag', lastTag);
      send({ t: 'focus_start', minutes: Number(v), tag: lastTag || 'Study' });
      setPanel(null);
      break;
    }
    case 'tagpick':
      lastTag = v;
      panel.querySelector<HTMLInputElement>('#tag')!.value = v;
      panel.querySelectorAll('.subj').forEach((el) => el.classList.toggle('on', el.querySelector('button')!.dataset.v === v));
      break;
    case 'tagsave': {
      const tag = panel.querySelector<HTMLInputElement>('#tag')!.value.trim();
      if (tag) { lastTag = tag; send({ t: 'subject_save', tag }); toast(`Saved <b>${esc(tag)}</b> as a quick pick`); }
      break;
    }
    case 'tagdel': send({ t: 'subject_remove', tag: v }); break;
    case 'statsTab': statsTab = v; if (v === 'board') requestBoard(); renderPanel(); break;
    case 'range': statsRange = v; statsAnchor = Date.now(); renderPanel(); break;
    case 'prev': statsAnchor = shift(statsRange, statsAnchor, -1).getTime(); renderPanel(); break;
    case 'next': statsAnchor = shift(statsRange, statsAnchor, 1).getTime(); renderPanel(); break;
    case 'scope': boardScope = v; requestBoard(); renderPanel(); break;
    case 'period': boardPeriod = v; requestBoard(); renderPanel(); break;
    case 'cancel': armGiveUp(b, 'Give up'); break;
    case 'tab': shopTab = v; renderPanel(); panel.querySelector('.pb')!.scrollTop = 0; break;
    case 'buy': send({ t: 'buy', item: v }); toast(`${icon(v)} Bought <b>${ITEMS[v as ItemKey].name}</b>! Place it from Decorate.`); break;
    case 'adopt': send({ t: 'adopt', kind: v }); toast(`${petIcon(v)} Welcome home, <b>${PETS[v as PetKey].name}</b>!`, 'reward'); break;
    case 'expand': send({ t: 'expand' }); toast('Your room just got bigger!', 'reward'); break;
    case 'place': placing = v as ItemKey; moving = null; renderPanel(); break;
    case 'putaway': if (moving !== null) send({ t: 'pickup', index: moving }); moving = null; renderPanel(); break;
    case 'deselect': moving = null; renderPanel(); break;
    case 'flip': if (moving !== null) send({ t: 'flip', index: moving }); break;
    case 'recolor': if (moving !== null) send({ t: 'restyle', index: moving, v: Number(v) }); break;
    case 'wallpaper': case 'floor': case 'pattern': case 'floorStyle':
      send({ t: 'room', wallpaper: room.wallpaper, floor: room.floor, pattern: room.pattern, floorStyle: room.floorStyle, [b.dataset.act]: v }); break;
    case 'skin': case 'hair': case 'shirt': case 'style': case 'face': case 'outfit':
      send({ t: 'look', name: mine.name, look: { ...mine.look, [b.dataset.act]: v } }); break;
    case 'copy': copyCode(); break;
    case 'join': send({ t: 'join', code: panel.querySelector<HTMLInputElement>('#join')!.value.trim() }); break;
    case 'leave': send({ t: 'leave' }); break;
    case 'logout': signOut(true); break;
    case 'snapshot': saveSnapshot(); break;
  }
});

const requestBoard = () => send({ t: 'leaderboard', scope: boardScope, period: boardPeriod });

function setPanel(name: string | null) {
  if (name === 'stats' && statsTab === 'board') requestBoard();
  if (name === 'decorate' && token) snapshotsApi().catch(() => {});
  openPanel = name;
  placing = null;
  moving = null;
  document.querySelectorAll<HTMLButtonElement>('#dock button').forEach((x) => x.classList.toggle('on', x.dataset.panel === name));
  document.body.classList.toggle('side-open', name === 'social');
  if (name === 'social') { unread = false; tickTimers(); scrollChat(); }
  renderPanel();
  document.body.classList.toggle('panel-open', !panel.hidden);
}
document.querySelectorAll<HTMLButtonElement>('#dock button').forEach((b) =>
  b.addEventListener('click', () => {
    if (b.dataset.panel === 'focus' && myMember()?.focus) { deckHidden = false; tickTimers(); return; }
    setPanel(openPanel === b.dataset.panel ? null : b.dataset.panel!);
  }));

// ---------- shared to-dos and chat ----------
function renderSide() {
  $('#todoList').innerHTML = todos.length
    ? todos.map((t) => `<li class="${t.done ? 'done' : ''}">
        <button class="check" data-todo="toggle" data-id="${t.id}" aria-label="${t.done ? 'Mark not done' : 'Mark done'}">${t.done ? '✓' : ''}</button>
        <span class="todo-text">${esc(t.text)}<small>${esc(t.by)}</small></span>
        <button class="del" data-todo="del" data-id="${t.id}" aria-label="Delete">✕</button></li>`).join('')
    : '<li class="empty">Nothing yet. Add something to study!</li>';
  const log = $('#chatLog');
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  log.innerHTML = chat.length
    ? chat.map((c) => `<p class="${c.from === myId ? 'mine' : ''}"><b>${esc(c.by)}</b>${esc(c.text)}</p>`).join('')
    : '<p class="empty">Say hi to your housemates 👋</p>';
  if (atBottom) scrollChat();
}
const scrollChat = () => { const log = $('#chatLog'); log.scrollTop = log.scrollHeight; };

$('#todoList').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-todo]');
  if (b) send({ t: b.dataset.todo === 'toggle' ? 'todo_toggle' : 'todo_del', id: Number(b.dataset.id) });
});
$('#todoForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $<HTMLInputElement>('#todoInput');
  if (input.value.trim()) send({ t: 'todo_add', text: input.value });
  input.value = '';
});
$('#chatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $<HTMLInputElement>('#chatInput');
  if (input.value.trim()) send({ t: 'chat', text: input.value });
  input.value = '';
});
$('#closeSide').addEventListener('click', () => setPanel(null));
$<HTMLImageElement>('#todoIcon').src = uiIconURL('clock');

// ---------- room snapshots (stored in Neon Object Storage) ----------
let snapshotList: { key: string; url: string }[] = [];
async function snapshotsApi(init?: RequestInit) {
  const res = await fetch(`${apiBase}/api/snapshots`, { ...init, headers: { authorization: `Bearer ${token}`, ...init?.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Could not reach storage.');
  snapshotList = data.snapshots;
  if (openPanel === 'decorate') renderPanel();
}

// Crops my room (with its walls) out of the game canvas and uploads it as a PNG.
async function saveSnapshot() {
  const i = myIndex();
  if (i < 0) return;
  const o = grid.origins[i], s = grid.sizes[i], k = view.scale;
  const x = (view.ox + (o.x - 1) * T) * k, y = (view.oy + (o.y - WALL_H) * T) * k;
  const w = (s.w + 2) * T * k, h = (s.h + WALL_H + 1) * T * k;
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  out.getContext('2d')!.drawImage(canvas, x, y, w, h, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((r) => out.toBlob(r, 'image/png'));
  if (!blob) return;
  try {
    await snapshotsApi({ method: 'POST', body: blob, headers: { 'content-type': 'image/png' } });
    toast('📸 Snapshot saved! Tap it to open a share link.');
  } catch (e) {
    toast(esc((e as Error).message));
  }
}

// ---------- landing page + accounts ----------
let authMode: 'signup' | 'login' = 'signup';
let pendingLook: Look | null = null; // buddy picked on the landing page, applied once the game state arrives
function showLanding(on: boolean) {
  document.body.classList.toggle('signed-out', on);
  $('#landing').hidden = !on;
  if (on) requestAnimationFrame(heroFrame);
}

function signOut(tellServer: boolean) {
  if (tellServer && token) fetch(`${apiBase}/api/logout`, { method: 'POST', body: JSON.stringify({ token }) }).catch(() => {});
  token = null;
  localStorage.removeItem('auralis.token');
  location.reload(); // simplest way to drop all in-memory game state
}

document.querySelectorAll<HTMLButtonElement>('#authForm [data-mode]').forEach((b) =>
  b.addEventListener('click', () => {
    authMode = b.dataset.mode as 'signup' | 'login';
    document.querySelectorAll('#authForm [data-mode]').forEach((x) => x.className = x === b ? 'on' : 'off');
    $('#authSubmit').textContent = authMode === 'signup' ? 'Create my room' : 'Log in';
    $<HTMLInputElement>('#authPass').autocomplete = authMode === 'signup' ? 'new-password' : 'current-password';
    $('#authTitle').textContent = authMode === 'signup' ? 'Move into the house 🏠' : 'Welcome back! 👋';
    // Sign-up asks for a username and an email; log-in takes either one in the first box.
    $('#authEmailLabel').hidden = authMode !== 'signup';
    $<HTMLInputElement>('#authEmail').required = authMode === 'signup';
    $('#authUserText').textContent = authMode === 'signup' ? 'Username' : 'Username or email';
    $('#authHint').textContent = authMode === 'signup' ? 'Already studying with us? Switch to Log in.' : 'New here? Switch to Sign up.';
    $('#authError').hidden = true;
  }));

$('#authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#authError');
  const btn = $<HTMLButtonElement>('#authSubmit');
  btn.disabled = true;
  try {
    const res = await fetch(`${apiBase}/api/${authMode}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: $<HTMLInputElement>('#authUser').value,
        password: $<HTMLInputElement>('#authPass').value,
        email: authMode === 'signup' ? $<HTMLInputElement>('#authEmail').value : undefined,
        legacyId: authMode === 'signup' ? legacyId ?? undefined : undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { err.textContent = data.error ?? 'Something went wrong. Try again.'; err.hidden = false; return; }
    token = data.token;
    localStorage.setItem('auralis.token', data.token);
    if (authMode === 'signup') { localStorage.removeItem('auralis.id'); pendingLook = buddyLook; }
    showLanding(false);
    connect();
  } catch {
    err.textContent = "Can't reach the server. Check your connection.";
    err.hidden = false;
  } finally {
    btn.disabled = false;
  }
});

// ---------- landing: live scene, speech bubbles, tap bursts ----------
// A wide room drawn with the game's own art: two friends studying, one wandering, three pets.
const HW = 20, HH = 8;
const hero = $<HTMLCanvasElement>('#heroScene');
const heroCtx = hero.getContext('2d')!;
hero.width = HW * T; hero.height = HH * T;
const coinImg = new Image();
coinImg.src = coinSrc;
document.querySelectorAll<HTMLImageElement>('#landing .coin-d').forEach((img) => (img.src = coinSrc));

const heroLooks: Look[] = [
  { skin: '#ffe0c8', hair: '#3a2a35', shirt: '#b89af0', style: 'buns', face: 'happy', outfit: 'sweater' },
  { skin: '#a8714f', hair: '#2b2530', shirt: '#7fb2e8', style: 'spiky', face: 'grin', outfit: 'hoodie' },
  { skin: '#f5c9a5', hair: '#e8735a', shirt: '#8fd0a8', style: 'curly', face: 'wink', outfit: 'jacket' },
];
// Free floor tiles the pets can wander between.
const heroSpots: { x: number; y: number }[] = [];
for (let y = 5; y < HH; y++) for (let x = 1; x < HW - 1; x++) if (!(y === 7 && x >= 15 && x <= 17)) heroSpots.push({ x, y });

type Particle = { x: number; y: number; vx: number; vy: number; life: number; kind: 'coin' | 'heart' | 'spark'; color: string };
const particles: Particle[] = [];
const HEART_COLORS = ['#f4a6b8', '#e98a9a', '#b89af0', '#ffd27a'];
function burst(x: number, y: number, n: number) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 20 + Math.random() * 40;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, life: 1, kind: i % 3 === 0 ? 'coin' : i % 3 === 1 ? 'heart' : 'spark', color: HEART_COLORS[i % HEART_COLORS.length] });
  }
}
hero.addEventListener('pointerdown', (e) => {
  const r = hero.getBoundingClientRect();
  burst(((e.clientX - r.left) / r.width) * hero.width, ((e.clientY - r.top) / r.height) * hero.height, 14);
});

// Speech bubbles are HTML over the canvas so the text stays crisp; each friend cycles through lines.
const LINES = [
  ['25 min sprint?', 'almost done!', '+25 coins ✨', 'chapter 3 ✔'],
  ["let's go!! 📖", 'snack break after?', 'study buddy bonus!', 'one more page…'],
  ['hi friends 👋', 'my cat says hi 🐱', 'new sofa!!', 'brb, watering the bonsai'],
];
const heroBubbles = ['#bubbleA', '#bubbleB', '#bubbleC'].map((s) => $(s));
let bubbleTurn = 0;
function nextBubble() {
  const i = bubbleTurn % 3, el = heroBubbles[i];
  el.textContent = LINES[i][Math.floor(bubbleTurn / 3) % LINES[i].length];
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  bubbleTurn++;
}
setInterval(() => { if (!$('#landing').hidden) nextBubble(); }, 1600);

let lastHero = performance.now();
let nextCoin = 0;
function heroFrame(t: number) {
  if ($('#landing').hidden) return;
  const rawDt = (t - lastHero) / 1000;
  const dt = Math.min(0.05, rawDt);
  lastHero = t;
  const c = heroCtx, now = Date.now();
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, hero.width, hero.height);
  for (let x = 0; x < HW; x++) {
    drawWallTop(c, x * T, 0, '#fbd0d4', 'hearts');
    drawWallFace(c, x * T, T, '#fbd0d4', 'hearts');
    for (let y = 2; y < HH; y++) drawFloor(c, x * T, y * T, '#e0b382', x, y, 'herringbone');
  }
  drawWin(c, 1 * T, 0, 'day');
  drawWin(c, 16 * T, 0, 'day');
  drawFurniture(c, 'roundRug', 8 * T, 5 * T, t, '#b89af0');
  drawFurniture(c, 'rug', 2 * T, 5 * T, t, '#9db4ee');
  // Sorted back to front by their bottom edge, like the game does.
  drawFurniture(c, 'bookshelf', 6 * T, 2 * T, t, '#d9a06a');
  drawFurniture(c, 'lamp', 9 * T, 2 * T, t, '#ffd27a');
  drawFurniture(c, 'aquarium', 10 * T, 2 * T, t);
  drawFurniture(c, 'bonsai', 18 * T, 2 * T, t);
  drawSeated(c, heroLooks[0], 3 * T, 3 * T, t, '#f4a6b8');
  drawSeated(c, heroLooks[1], 14 * T, 3 * T, t, '#8fd0a8');
  drawFurniture(c, 'desk', 2 * T, 4 * T, t, '#f0d2a8');
  drawFurniture(c, 'desk', 13 * T, 4 * T, t, '#b07a4e');
  const pets = (['cat', 'bunny', 'dragon'] as const).map((kind, i) => ({ kind, ...petPos(400 + i * 97, now, heroSpots) }));
  const walk = Math.sin(now / 1400);
  const walker = { x: 8.5 + walk * 2.5, y: 5 };
  const sprites: { y: number; draw: () => void }[] = [
    ...pets.map((p) => ({ y: p.y + 0.9, draw: () => drawPet(c, p.kind, Math.round(p.x * T), Math.round(p.y * T), p.moving, p.left, now) })),
    { y: walker.y + 0.99, draw: () => drawAvatar(c, heroLooks[2], Math.round(walker.x * T), walker.y * T, Math.abs(Math.cos(now / 1400)) > 0.15 ? 1 + (Math.floor(now / 170) % 2) : 0, false) },
    { y: 7.5, draw: () => drawFurniture(c, 'sofa', 15 * T, 7 * T, t, '#f4a6b8') },
  ];
  sprites.sort((a, b) => a.y - b.y).forEach((s) => s.draw());

  // Studying earns coins: one floats up from a desk every so often.
  if (t > nextCoin && rawDt < 0.1) { // only while animating smoothly, so a throttled background tab doesn't pile coins up
    nextCoin = t + 1300;
    const who = Math.random() < 0.5 ? 3 : 14;
    particles.push({ x: who * T + 8, y: 2 * T + 4, vx: 0, vy: -18, life: 1, kind: 'coin', color: '' });
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.kind !== 'coin' || p.vx) p.vy += 60 * dt;
    p.life -= dt * (p.vx ? 1.1 : 0.7);
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    c.globalAlpha = Math.min(1, p.life * 2);
    const px = Math.round(p.x), py = Math.round(p.y);
    if (p.kind === 'coin') c.drawImage(coinImg, px - 5, py - 5);
    else if (p.kind === 'heart') {
      c.fillStyle = p.color;
      c.fillRect(px - 1, py, 1, 1); c.fillRect(px + 1, py, 1, 1);
      c.fillRect(px - 2, py + 1, 5, 1); c.fillRect(px - 1, py + 2, 3, 1); c.fillRect(px, py + 3, 1, 1);
    } else {
      c.fillStyle = '#fff3b0';
      c.fillRect(px - 1, py, 3, 1); c.fillRect(px, py - 1, 1, 3);
    }
    c.globalAlpha = 1;
  }
  requestAnimationFrame(heroFrame);
}

// ---------- landing: build your buddy ----------
const buddy = $<HTMLCanvasElement>('#buddyCanvas');
buddy.width = 16; buddy.height = 22;
const pickOne = <V>(list: readonly V[]) => list[Math.floor(Math.random() * list.length)];
let buddyLook: Look = { ...heroLooks[0] };
function drawBuddy() {
  const c = buddy.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, 16, 22);
  drawAvatar(c, buddyLook, 0, 5, 0, false);
  $('#buddyTags').textContent = `${buddyLook.style} · ${buddyLook.outfit} · ${buddyLook.face}`;
}
$('#shuffleBuddy').addEventListener('click', () => {
  buddyLook = { skin: pickOne(SKINS), hair: pickOne(HAIRS), shirt: pickOne(SHIRTS), style: pickOne(STYLES), face: pickOne(FACES), outfit: pickOne(OUTFITS) };
  drawBuddy();
  buddy.classList.remove('pop');
  void buddy.offsetWidth;
  buddy.classList.add('pop');
});
drawBuddy();

if (token) connect();
else showLanding(true);
requestAnimationFrame(frame);
