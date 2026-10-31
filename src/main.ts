import {
  SHELVES, buildGrid, walkable, canPlace, roomSize, MAX_ROOMS, ROOM_COST, colorsFor, ITEMS, PETS, PET_ACCS, MAX_PETS, EXPAND_COST, ROOM_SIZES,
  WALLPAPERS, WALL_PATTERNS, FLOORS, FLOOR_STYLES, SKINS, HAIRS, SHIRTS, STYLES, FACES, OUTFITS, FOCUS_LENGTHS,
  WALL_H, WALL, FLOOR, DOOR, BLOCKED, VOID,
} from '../shared/game.js';
import {
  T, OVERHANG, SURFACE, drawSeated, drawActing, drawSeam, drawFloor, drawWall, drawWallFace, drawWallTop, drawDoor, drawWindow, drawPainting, drawFurniture, drawAvatar, drawDeskLamp, drawGlow, drawUsing, skyNow, NIGHT_TINT,
  coinURL, uiIconURL, drawPaper, paintBlockText, drawWindow as drawWin, type Look,
} from './draw';
import { drawPet, petPos, petIconURL, seedOf } from './pets';
import { chart, streak, rangeTitle, shift, hm, RANGES } from '../shared/stats.js';
import './style.css';

type Furniture = { item: string; x: number; y: number; v?: number; s?: number; flip?: boolean };
type Room = { wallpaper: string; floor: string; pattern?: string; floorStyle?: string; level?: number; furniture: Furniture[] };
type Member = {
  id: string; name: string; look: Look; rooms: Room[]; focus: { minutes: number; endsAt: number } | null;
  totalMinutes: number; online: boolean; pos: { x: number; y: number } | null; pets: { kind: string; coat?: number; acc?: string }[];
};
type Todo = { id: number; text: string; done: boolean; by: string };
type Chat = { id: number; from: string; by: string; text: string; at: number };
type Session = { at: number; minutes: number; tag: string };
type Me = { id: string; coins: number; inventory: Record<string, number>; sessions: Session[]; subjects: string[]; hiddenSubjects: string[]; todos: Todo[]; dm: Record<string, Chat[]>; petAccs?: string[] };
type Board = { scope: string; period: string; rows: { name: string; me: boolean; minutes: number }[] };
type Avatar = { x: number; y: number; tx: number; ty: number; up: boolean; dist: number; use?: string };
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
let dmPeer: string | null = null; // null = talking to the whole house
let houseCode = '';
let me: Me = { id: myId, coins: 0, inventory: {}, sessions: [], subjects: [], hiddenSubjects: [], todos: [], dm: {} };
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
// Extra integer scale steps on top of the fitted view (+ zooms in, - zooms out).
// Phones start one step closer, so faces and small things are easier to see; pinch or +/- changes it.
const savedZoom = localStorage.getItem('auralis.zoom');
let zoom = Math.max(-3, Math.min(4, savedZoom !== null ? Number(savedZoom) || 0 : innerWidth < 600 ? 1 : 0));
let cam: { x: number; y: number; scale: number } | null = null; // camera target in art pixels, eased
let camRoom = 0;

// ---------- network ----------
let ws: WebSocket;
const serverUrl = import.meta.env.VITE_SERVER ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
// Loading screen until the first house state arrives; after a few seconds explain the wait.
let hintTimer = 0;
function showLoading(on: boolean) {
  $('#loading').hidden = !on;
  clearTimeout(hintTimer);
  $('#loadHint').hidden = true;
  if (on) hintTimer = window.setTimeout(() => ($('#loadHint').hidden = false), 5000);
}

function connect() {
  if (!houseCode) showLoading(true);
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
    if (!houseCode) showLoading(false);
    myId = m.me.id;
    if (m.house.code !== houseCode) avatars.delete(myId); // moved house: start in my own room
    const wasFocusing = !!myMember()?.focus;
    const oldGrid = grid, oldSlots = slots.map((x) => `${x.m.id}:${x.ri}`);
    houseCode = m.house.code;
    members = m.house.members;
    todos = m.house.todos;
    me = m.me;
    noteNewDms();
    slots = members.flatMap((mem) => mem.rooms.map((room, ri) => ({ m: mem, room, ri })));
    if (editRoom >= (myMember()?.rooms.length ?? 1)) editRoom = 0;
    grid = buildGrid(slots.map((x) => x.room));
    // Someone joined, left or grew their room, so rooms may sit elsewhere in the grid now:
    // move everyone along with the room they were standing in.
    for (const [id, a] of avatars) {
      const x = Math.round(a.tx), y = Math.round(a.ty);
      const ownerAt = (cx: number, cy: number) => (cx >= 0 && cy >= 0 && cx < oldGrid.w && cy < oldGrid.h ? oldGrid.owner[cy * oldGrid.w + cx] : -1);
      const was = [ownerAt(x, y), ownerAt(x - 1, y), ownerAt(x, y - 1)].find((k) => k >= 0) ?? -1;
      const now = slots.findIndex((x) => `${x.m.id}:${x.ri}` === oldSlots[was]);
      if (was < 0 || now < 0) continue;
      const dx = grid.origins[now].x - oldGrid.origins[was].x, dy = grid.origins[now].y - oldGrid.origins[was].y;
      if (!dx && !dy) continue;
      a.x += dx; a.tx += dx; a.y += dy; a.ty += dy;
      if (id === myId) { path = []; seat = null; send({ t: 'pos', x: a.tx, y: a.ty }); }
    }
    petSpots = slots.map((_, i) => {
      const spots = [];
      for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) if (grid.owner[y * grid.w + x] === i && grid.at(x, y) === FLOOR) spots.push({ x, y });
      return spots;
    });
    acts = new Map();
    petToys = slots.map(({ room }, i) => {
      const o = grid.origins[i];
      const toys = [];
      for (const f of room.furniture) {
        const it = ITEMS[f.item as ItemKey] as { w: number; h: number; act?: string; pet?: string };
        if (!it) continue;
        if (it.act) for (let y = 0; y < it.h; y++) for (let x = 0; x < it.w; x++) acts.set(tileKey(o.x + f.x + x, o.y + f.y + y), { item: f.item, act: it.act, col: furnColor(f) });
        if (it.pet) toys.push({ x: o.x + f.x, y: o.y + f.y, act: it.pet });
      }
      return toys;
    });
    const canStand = (x: number, y: number) => walkable(grid.at(x, y)) || acts.has(tileKey(x, y));
    for (const mem of members) {
      let a = avatars.get(mem.id);
      const spot = mem.id !== myId && mem.pos && canStand(mem.pos.x, mem.pos.y) ? mem.pos : null;
      if (!a || !canStand(Math.round(a.tx), Math.round(a.ty))) {
        const s = spot ?? roomSpawn(slotOf(mem.id));
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
    if (a) { a.tx = m.x; a.ty = m.y; a.use = m.use; }
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
      if (c.from !== myId) {
        if (!document.body.classList.contains('side-open') || dmPeer) unread = true;
        noteUnreadChat();
      }
    }
  }
  chat = list;
  lastChatId = Math.max(lastChatId, 0, ...list.map((c) => c.id));
}

// ---------- house helpers ----------
const myIndex = () => members.findIndex((m) => m.id === myId);
const myMember = () => members[myIndex()];
// Every room in the house in grid order: each housemate's rooms, first room first.
type Slot = { m: Member; room: Room; ri: number };
let slots: Slot[] = [];
let editRoom = 0; // which of my rooms Decorate and the room shop work on
const slotOf = (id: string, ri = 0) => slots.findIndex((x) => x.m.id === id && x.ri === ri);
const mySlot = () => slotOf(myId, editRoom);
const myRoom = () => myMember()?.rooms[editRoom] ?? myMember()?.rooms[0];
const furnColor = (f: Furniture) => (f.v === undefined ? undefined : colorsFor(f.item)[f.v]);

// Tiles of furniture a character can use (chairs, sofas, gym balls, treadmills...) and what they do there.
let acts = new Map<number, { item: string; act: string; col?: string }>();
let petToys: { x: number; y: number; act: string }[][] = []; // per room: cat towers, beds, balls...
const tileKey = (x: number, y: number) => y * 10000 + x;
let seat: { x: number; y: number } | null = null; // furniture to step onto once the walk there ends
let useNext: string | null = null; // what to do once the walk ends in front of a piece of furniture
let restUntil = 0; // pause before wandering on: short after a walk, longer while using furniture
let quietUntil = 0; // longer pause after you click or steer, so the sprite obeys you

// Walk to my own chair (preferring one just behind a desk, in any of my rooms) and sit down facing the room.
function goSit() {
  const a = avatars.get(myId);
  const mine = myMember();
  if (!mine || !a) return;
  const it = (f: Furniture) => ITEMS[f.item as ItemKey] as { w: number; chair?: boolean; table?: boolean } | undefined;
  const chairs = mine.rooms.flatMap((room, ri) => room.furniture.filter((f) => it(f)?.chair).map((c) => ({
    c, i: slotOf(myId, ri),
    desk: room.furniture.some((d) => it(d)?.table && c.x >= d.x && c.x < d.x + it(d)!.w && c.y + 1 === d.y),
  })));
  const pick = chairs.find((x) => x.desk) ?? chairs[0];
  if (!pick || pick.i < 0) return;
  const o = grid.origins[pick.i];
  const cx = o.x + pick.c.x, cy = o.y + pick.c.y;
  if (a.tx === cx && a.ty === cy) return;
  const p = bfs({ x: a.tx, y: a.ty }, (x, y) => Math.abs(x - cx) + Math.abs(y - cy) === 1);
  if (!p) return;
  path = p.slice(1);
  seat = { x: cx, y: cy };
}

function standUp() {
  const a = avatars.get(myId);
  if (!a || !acts.has(tileKey(a.tx, a.ty))) return;
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
  if (!a) return;
  // Taps on the paper around the house, or outside it entirely, are ignored.
  if (x < 0 || y < 0 || x >= grid.w || y >= grid.h) return;
  if (grid.at(x, y) === VOID) return;
  const target = walkable(grid.at(x, y)) ? { x, y } : nearestWalkable(x, y);
  seat = null;
  useNext = null;
  quietUntil = Date.now() + 2500;
  const p = bfs({ x: a.tx, y: a.ty }, (cx, cy) => cx === target.x && cy === target.y);
  if (p && p.length > 1) path = p.slice(1);
}

// When nothing else is going on, keep busy: walk somewhere new, or go use a sofa, gym ball, treadmill...
function wander() {
  const a = avatars.get(myId);
  if (!a) return;
  if (myMember()?.focus) return; // studying at the desk: stay put
  if (path.length || seat) return;
  if (a.x !== a.tx || a.y !== a.ty) return; // still sliding into a tile
  if (Date.now() < restUntil || Date.now() < quietUntil) return;
  // Anywhere floor connects, including through the doors into housemates' rooms.
  const pass = (x: number, y: number) => walkable(grid.at(x, y));
  // Collect every reachable floor tile in the house. Starting on furniture is fine: we step off it.
  const start = { x: a.tx, y: a.ty };
  const seen = new Set([tileKey(start.x, start.y)]);
  const spots: { x: number; y: number }[] = [];
  const queue = [start];
  while (queue.length) {
    const c = queue.shift()!;
    if (c !== start) spots.push(c);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { x: c.x + dx, y: c.y + dy };
      const k = tileKey(n.x, n.y);
      if (seen.has(k) || !pass(n.x, n.y)) continue;
      seen.add(k);
      queue.push(n);
    }
  }
  // Furniture to use: next to a reachable tile and nobody else on it.
  const taken = new Set([...avatars].filter(([id]) => id !== myId).map(([, o]) => tileKey(o.tx, o.ty)));
  const near = (x: number, y: number) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has(tileKey(x + dx, y + dy)) && pass(x + dx, y + dy));
  const usable = [...acts.keys()].map((k) => ({ x: k % 10000, y: Math.floor(k / 10000) }))
    .filter((u) => !taken.has(tileKey(u.x, u.y)) && !(u.x === start.x && u.y === start.y) && near(u.x, u.y));
  // Things to use from the front: plants to water, shelves to read at, stoves, instruments...
  const fronts: { x: number; y: number; use: string }[] = [];
  slots.forEach(({ room }, i) => {
    const o = grid.origins[i];
    for (const f of room.furniture) {
      const it = ITEMS[f.item as ItemKey] as { w: number; h: number; use?: string };
      if (!it?.use) continue;
      for (let k = 0; k < it.w; k++) {
        const fx = o.x + f.x + k, fy = o.y + f.y + it.h;
        if ((seen.has(tileKey(fx, fy)) || (fx === start.x && fy === start.y)) && !taken.has(tileKey(fx, fy))) fronts.push({ x: fx, y: fy, use: it.use });
      }
    }
  });
  if (fronts.length && Math.random() < 0.45) {
    const u = fronts[Math.floor(Math.random() * fronts.length)];
    if (u.x === start.x && u.y === start.y) {
      a.use = u.use; a.up = true;
      send({ t: 'pos', x: u.x, y: u.y, use: u.use });
      restUntil = Date.now() + 4000 + Math.random() * 4000;
      return;
    }
    const p = bfs(start, (cx, cy) => cx === u.x && cy === u.y, pass);
    if (p) { path = p.slice(1); useNext = u.use; return; }
  }
  if (usable.length && Math.random() < 0.55) {
    const u = usable[Math.floor(Math.random() * usable.length)];
    const p = bfs(start, (cx, cy) => pass(cx, cy) && Math.abs(cx - u.x) + Math.abs(cy - u.y) === 1, pass);
    if (p) { path = p.slice(1); seat = u; return; }
  }
  if (!spots.length) { restUntil = Date.now() + 2000; return; }
  const t = spots[Math.floor(Math.random() * spots.length)];
  const p = bfs(start, (cx, cy) => cx === t.x && cy === t.y, pass);
  if (p) path = p.slice(1);
  else restUntil = Date.now() + 2000;
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

// Two-finger pinch zooms in whole steps, like the + and - buttons.
const touches = new Map<number, { x: number; y: number }>();
let pinchFrom = 0;
const spread = () => { const [a, b] = [...touches.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
canvas.addEventListener('pointermove', (e) => {
  if (!touches.has(e.pointerId)) return;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size !== 2 || !pinchFrom) return;
  const d = spread();
  if (d > pinchFrom * 1.3) { setZoom(zoom + 1); pinchFrom = d; }
  else if (d < pinchFrom / 1.3) { setZoom(zoom - 1); pinchFrom = d; }
});
const lift = (e: PointerEvent) => { touches.delete(e.pointerId); if (touches.size < 2) pinchFrom = 0; };
canvas.addEventListener('pointerup', lift);
canvas.addEventListener('pointercancel', lift);

canvas.addEventListener('pointerdown', (e) => {
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 2) { pinchFrom = spread(); drag = null; return; } // second finger: it's a pinch, not a tap
  if (touches.size > 2) return;
  const { tx, ty } = tileAt(e);
  const mine = myMember();
  if (openPanel === 'decorate' && mine) {
    const tapped = slots[grid.owner[ty * grid.w + tx]];
    if (!placing && !drag && tapped?.m.id === myId && tapped.ri !== editRoom) { editRoom = tapped.ri; moving = null; renderPanel(); return; }
    const o = grid.origins[mySlot()];
    const lx = tx - o.x, ly = ty - o.y;
    const i = furnitureAt(myRoom()!, lx, ly);
    if (placing) {
      if (canPlace(myRoom()!, placing, lx, ly)) { send({ t: 'place', r: editRoom, item: placing, x: lx, y: ly }); placing = null; }
      else toast('That spot is taken or outside your room.');
    } else if (i >= 0) {
      // Grab it: drag to move, or just tap to select it.
      const f = myRoom()!.furniture[i];
      moving = i;
      drag = { index: i, gx: lx - f.x, gy: ly - f.y, lx: f.x, ly: f.y, moved: false };
      canvas.setPointerCapture(e.pointerId);
    } else if (moving !== null) {
      const f = myRoom()!.furniture[moving];
      if (f && canPlace(without(myRoom()!, moving), f.item, lx, ly)) send({ t: 'move', r: editRoom, index: moving, x: lx, y: ly });
      else toast("It doesn't fit there.");
    }
    renderPanel();
    return;
  }
  walkTo(tx, ty);
});

// Zoom: the buttons, Ctrl/Cmd + wheel, or + and - on the keyboard.
const zoomInBtn = $<HTMLButtonElement>('#zoomIn'), zoomOutBtn = $<HTMLButtonElement>('#zoomOut');
function setZoom(next: number) {
  zoom = Math.max(-3, Math.min(4, next));
  localStorage.setItem('auralis.zoom', String(zoom));
  zoomInBtn.disabled = zoom >= 4;
  zoomOutBtn.disabled = zoom <= -3;
}
zoomInBtn.addEventListener('click', () => setZoom(zoom + 1));
zoomOutBtn.addEventListener('click', () => setZoom(zoom - 1));
canvas.addEventListener('wheel', (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  setZoom(zoom + (e.deltaY < 0 ? 1 : -1));
}, { passive: false });
addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  if (e.key === '+' || e.key === '=') { e.preventDefault(); setZoom(zoom + 1); }
  else if (e.key === '-' || e.key === '_') { e.preventDefault(); setZoom(zoom - 1); }
});
setZoom(zoom);

// In Decorate the cursor shows what a click will do: a target while placing, a hand over your furniture,
// a closed hand while dragging. Otherwise the normal arrow applies.
canvas.addEventListener('pointermove', (e) => {
  let c = '';
  if (openPanel === 'decorate' && myRoom()) {
    const { tx, ty } = tileAt(e), o = grid.origins[mySlot()];
    c = drag?.moved ? 'var(--grabbing)' : placing ? 'var(--place)' : o && furnitureAt(myRoom()!, tx - o.x, ty - o.y) >= 0 ? 'var(--grab)' : '';
  }
  if (canvas.style.cursor !== c) canvas.style.cursor = c;
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const { tx, ty } = tileAt(e);
  const o = grid.origins[mySlot()];
  const lx = tx - o.x - drag.gx, ly = ty - o.y - drag.gy;
  if (lx !== drag.lx || ly !== drag.ly) { drag.lx = lx; drag.ly = ly; drag.moved = true; }
});

canvas.addEventListener('pointerup', () => {
  const mine = myMember();
  if (!drag || !mine) { drag = null; return; }
  const f = myRoom()!.furniture[drag.index];
  if (drag.moved && f) {
    if (canPlace(without(myRoom()!, drag.index), f.item, drag.lx, drag.ly)) send({ t: 'move', r: editRoom, index: drag.index, x: drag.lx, y: drag.ly });
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
  quietUntil = Date.now() + 2500; // I'm steering: no wandering on top of it
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
  const speed = 3.2; // tiles per second
  for (const [id, a] of avatars) {
    if (id === myId && a.x === a.tx && a.y === a.ty && path.length) {
      const n = path.shift()!;
      a.up = n.y < a.ty;
      a.tx = n.x; a.ty = n.y;
      a.use = path.length ? undefined : useNext ?? undefined;
      if (a.use) a.up = true; // face the thing being used
      send({ t: 'pos', x: n.x, y: n.y, use: a.use });
      if (!path.length) {
        // Watering, reading, cooking... takes a few seconds; otherwise barely a breath, then off again.
        restUntil = Date.now() + (useNext ? 4000 + Math.random() * 4000 : 150 + Math.random() * 450);
        useNext = null;
      }
    } else if (id === myId && seat && a.x === a.tx && a.y === a.ty) {
      a.tx = seat.x; a.ty = seat.y; a.up = true;
      send({ t: 'pos', x: seat.x, y: seat.y });
      // Lounging lasts a while; a workout or a bounce a little less.
      restUntil = Date.now() + (acts.get(tileKey(seat.x, seat.y))?.act === 'sit' ? 8000 + Math.random() * 7000 : 5000 + Math.random() * 5000);
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
  wander();
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
  const fit = Math.max(1, Math.floor(Math.min(aw / (roomW + T), ah / (roomH + T / 2))));
  const scale = Math.min(10, Math.max(1, fit + zoom));
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
      const room = (dy: number) => slots[grid.owner[(y + dy) * grid.w + x]]?.room;
      if (k === FLOOR || k === BLOCKED) {
        const r = room(0);
        drawFloor(ctx, px, py, r?.floor ?? FLOORS[0], x, y, r?.floorStyle);
      } else if (k === DOOR) {
        // An opening between side-by-side rooms shows both floors; a doorway between rows is plain wood.
        const l = room(0) ?? slots[grid.owner[y * grid.w + x - 1]]?.room, rr = slots[grid.owner[y * grid.w + x + 1]]?.room;
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

  // Windows, the night tint and lamps follow the viewer's local clock.
  const sky = skyNow();
  const dark = sky !== 'day';
  // Top-row rooms get windows to the outside (more as the room grows); inner rooms get a painting.
  slots.forEach((_, i) => {
    const o = grid.origins[i], s = grid.sizes[i];
    const wy = (o.y - WALL_H) * T;
    if (i < grid.cols) for (let lx = 1; lx + 2 <= s.w - 1; lx += 6) drawWindow(ctx, (o.x + lx) * T, wy, sky);
    else drawPainting(ctx, (o.x + 1) * T, wy + 8);
  });

  // Rugs under everything, then furniture, pets and avatars sorted by their bottom edge.
  const sprites: { y: number; draw: () => void }[] = [];
  // Chairs someone sits in are drawn by drawSeated, wrapped around the sitter.
  const occupied = new Set<number>();
  for (const m of members) {
    const a = avatars.get(m.id);
    if (a && (m.online || m.id === myId) && a.x === a.tx && a.y === a.ty && acts.has(tileKey(a.x, a.y))) occupied.add(tileKey(a.x, a.y));
  }
  slots.forEach(({ m, room, ri }, i) => {
    const o = grid.origins[i];
    room.furniture.forEach((f, idx) => {
      const it = ITEMS[f.item as ItemKey] as (typeof ITEMS)[ItemKey] & { chair?: boolean; top?: boolean };
      if (!it || (it.chair && occupied.has(tileKey(o.x + f.x, o.y + f.y)))) return;
      const dragged = drag?.moved && m.id === myId && ri === editRoom && drag.index === idx;
      // Drinks and toys stand on top of whatever table they were put on.
      const under = it.top ? room.furniture.find((g) => {
        const gi = ITEMS[g.item as ItemKey];
        return gi?.solid && f.x >= g.x && f.x < g.x + gi.w && f.y >= g.y && f.y < g.y + gi.h;
      }) : undefined;
      const lift = under ? SURFACE[under.item] ?? 0 : 0;
      const draw = () => {
        if (dragged) ctx.globalAlpha = 0.35;
        drawFurniture(ctx, f.item, (o.x + f.x) * T, (o.y + f.y) * T - lift, t, furnColor(f), f.flip, it.w, f.s);
        ctx.globalAlpha = 1;
      };
      if (it.top) sprites.push({ y: o.y + f.y + 0.6, draw });
      else if (!it.solid) draw();
      else sprites.push({ y: o.y + f.y + it.h - 0.5, draw });
    });
    if (ri === 0) m.pets?.forEach((p, slot) => { // pets live in their owner's first room
      const spots = petSpots[i];
      if (!spots?.length) return;
      const pos = petPos(seedOf(m.id, slot), now, spots, petToys[i]);
      sprites.push({ y: pos.y + 0.9, draw: () => drawPet(ctx, p.kind, Math.round(pos.x * T), Math.round(pos.y * T), pos.moving, pos.left, now, pos.act, p.coat, p.acc) });
    });
  });
  const labels: { x: number; y: number; m: Member; seated: boolean; lift: number }[] = [];
  const lights: { x: number; y: number; rad: number; alpha: number }[] = [];
  for (const m of members) {
    const a = avatars.get(m.id);
    if (!a || (!m.online && m.id !== myId)) continue;
    const walking = a.x !== a.tx || a.y !== a.ty;
    const act = walking ? undefined : acts.get(tileKey(a.x, a.y));
    const seated = !!m.focus && !!act && !!(ITEMS[act.item as ItemKey] as { chair?: boolean }).chair; // studying at a desk
    const stepFrame = walking ? 1 + (Math.floor(a.dist * 4) % 2) : 0;
    const ax = Math.round(a.x * T), ay = Math.round(a.y * T);
    sprites.push({
      y: a.y + 0.99,
      draw: () => (act ? drawActing(ctx, m.look, act.act, act.item, ax, ay, t, act.col, seated)
        : a.use && !walking ? drawUsing(ctx, m.look, a.use, ax, ay, t)
        : drawAvatar(ctx, m.look, ax, ay, stepFrame, a.up)),
    });
    labels.push({ x: a.x, y: a.y, m, seated, lift: seated ? 30 : act ? 12 : 7 });
    // Studying after dark: a desk lamp clicks on, on the table in front of the chair.
    if (seated && dark) {
      sprites.push({ y: a.y + 1.6, draw: () => drawDeskLamp(ctx, ax + 10, ay + T + 4) });
      lights.push({ x: ax + 15, y: ay + T - 4, rad: 34, alpha: 0.5 });
    }
  }
  sprites.sort((p, q) => p.y - q.y).forEach((s) => s.draw());

  if (dark) {
    ctx.fillStyle = NIGHT_TINT[sky];
    for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) if (grid.at(x, y)) ctx.fillRect(x * T, y * T, T, T);
    slots.forEach(({ room }, i) => {
      const o = grid.origins[i];
      for (const f of room.furniture) {
        const glow = GLOWS[f.item];
        if (glow) lights.push({ x: (o.x + f.x) * T + glow.dx, y: (o.y + f.y) * T + glow.dy, rad: glow.rad, alpha: glow.alpha });
      }
    });
    const flicker = 0.03 * Math.sin(t / 700);
    for (const l of lights) drawGlow(ctx, l.x, l.y, l.rad, (sky === 'night' ? l.alpha : l.alpha * 0.5) + flicker);
  }

  const mine = myMember();
  if (openPanel === 'decorate' && mine) {
    const o = grid.origins[mySlot()], s = grid.sizes[mySlot()];
    ctx.strokeStyle = placing ? '#ffe08a' : '#ffffffaa';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 2]);
    ctx.strokeRect(o.x * T + 0.5, o.y * T + 0.5, s.w * T - 1, s.h * T - 1);
    ctx.setLineDash([]);
    const f = moving !== null ? myRoom()!.furniture[moving] : null;
    const it = f && ITEMS[f.item as ItemKey];
    if (f && it) {
      const gx = drag?.moved ? drag.lx : f.x, gy = drag?.moved ? drag.ly : f.y;
      if (drag?.moved) {
        // Ghost of the piece being dragged, outlined green where it fits and red where it doesn't.
        drawFurniture(ctx, f.item, (o.x + gx) * T, (o.y + gy) * T, t, furnColor(f), f.flip, it.w, f.s);
        ctx.strokeStyle = canPlace(without(myRoom()!, moving!), f.item, gx, gy) ? '#6fcf8a' : '#e06a5a';
      } else ctx.strokeStyle = '#f2c14e';
      ctx.lineWidth = 2;
      ctx.strokeRect((o.x + gx) * T + 1, (o.y + gy) * T + 1, it.w * T - 2, it.h * T - 2);
    }
  }

  // Text in device pixels so it stays crisp.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.textAlign = 'center';
  for (const { x, y, m, seated, lift } of labels) {
    // A studying player gets a bigger timer bubble floating over their desk.
    const sx = (view.ox + x * T + 8) * scale, sy = (view.oy + y * T - lift) * scale;
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

// Things that light up the room at night: offset of the light from the item's top-left, size and strength.
const GLOWS: Record<string, { dx: number; dy: number; rad: number; alpha: number }> = {
  lamp: { dx: 8, dy: -4, rad: 40, alpha: 0.32 },
  fireplace: { dx: 16, dy: 6, rad: 48, alpha: 0.4 },
  pumpkin: { dx: 8, dy: 8, rad: 22, alpha: 0.3 },
  christmasTree: { dx: 8, dy: -6, rad: 28, alpha: 0.25 },
  tv: { dx: 16, dy: -6, rad: 30, alpha: 0.2 },
  arcade: { dx: 8, dy: -8, rad: 24, alpha: 0.22 },
  aquarium: { dx: 16, dy: -4, rad: 26, alpha: 0.18 },
  gamingDesk: { dx: 16, dy: -2, rad: 26, alpha: 0.2 },
  arcLamp: { dx: 8, dy: -8, rad: 36, alpha: 0.3 },
  bedsideLamp: { dx: 8, dy: 4, rad: 22, alpha: 0.25 },
  candles: { dx: 8, dy: 6, rad: 22, alpha: 0.25 },
  neonHeart: { dx: 8, dy: -4, rad: 26, alpha: 0.25 },
  fairyJar: { dx: 8, dy: 8, rad: 18, alpha: 0.22 },
  floorCandle: { dx: 8, dy: 0, rad: 22, alpha: 0.25 },
  snowflakeLamp: { dx: 8, dy: -6, rad: 24, alpha: 0.22 },
  lanternString: { dx: 8, dy: -8, rad: 26, alpha: 0.25 },
  diya: { dx: 8, dy: 8, rad: 18, alpha: 0.25 },
  ghost: { dx: 8, dy: -2, rad: 20, alpha: 0.15 },
  menorah: { dx: 8, dy: 4, rad: 20, alpha: 0.25 },
  heater: { dx: 8, dy: 0, rad: 24, alpha: 0.25 },
  discoBall: { dx: 8, dy: -6, rad: 26, alpha: 0.2 },
};

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
  ...SHELVES.map((sh) => ({ ...sh, items: (Object.keys(ITEMS) as ItemKey[]).filter((k) => (ITEMS[k] as { shelf?: string }).shelf === sh.id) })),
  { id: 'pets', label: 'Pets' },
  { id: 'petacc', label: 'Pet style' },
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
function icon(item: string, cls = 'icon', style = 0) {
  const key = `${item}|${style}`;
  if (!icons.has(key)) {
    const it = ITEMS[item as ItemKey];
    const c = document.createElement('canvas');
    const top = OVERHANG[item] ?? 0;
    c.width = it.w * T; c.height = it.h * T + top;
    drawFurniture(c.getContext('2d')!, item, 0, top, 0, undefined, false, 1, style);
    icons.set(key, c.toDataURL());
  }
  return `<img class="${cls}" src="${icons.get(key)}" alt="">`;
}
const petIcon = (kind: string, cls = 'icon', coat = 0, acc?: string) => `<img class="${cls}" src="${petIconURL(kind, coat, acc)}" alt="">`;

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
    const pic = x.items ? icon(x.items[0], 'rail-icon') : x.id === 'pets' ? petIcon('cat', 'rail-icon') : x.id === 'petacc' ? petIcon('bunny', 'rail-icon', 0, 'bow') : `<img class="rail-icon" src="${uiIconURL('house')}" alt="">`;
    return `<button class="rail-btn${x.id === tab.id ? ' on' : ''}" data-act="tab" data-v="${x.id}">${pic}<span>${x.label}</span></button>`;
  }).join('');
  let shelf = '';
  if (tab.items) {
    shelf = tab.items.map((k) => {
      const it = ITEMS[k];
      const looks = (it as { looks?: string[] }).looks;
      return `<div class="card"><b>${it.name}</b>${icon(k)}${looks ? `<small class="hint">${looks.length} styles</small>` : ''}<button data-act="buy" data-v="${k}" ${me.coins < it.price ? 'disabled' : ''}>${coin()} ${it.price}</button></div>`;
    }).join('');
  } else if (tab.id === 'petacc') {
    const owned = me.petAccs ?? [];
    shelf = Object.entries(PET_ACCS).map(([k, a]) => `<div class="card pet"><b>${a.name}</b>${petIcon(mine.pets[0]?.kind ?? 'cat', 'icon pet-icon', 0, k)}
      ${owned.includes(k) ? '<span class="tag">Owned</span>' : `<button data-act="buyacc" data-v="${k}" ${me.coins < a.price ? 'disabled' : ''}>${coin()} ${a.price}</button>`}</div>`).join('');
  } else if (tab.id === 'pets') {
    const full = mine.pets.length >= MAX_PETS;
    shelf = Object.entries(PETS).map(([k, p]) => {
      const need = p.price - me.coins;
      return `<div class="card pet"><b>${p.name}</b>${petIcon(k, 'icon pet-icon')}
        <button data-act="adopt" data-v="${k}" ${need > 0 || full ? 'disabled' : ''}>${coin()} ${p.price}</button>
        <small class="hint">${full ? 'Room is full of pets' : need > 0 ? `${need} more to go` : 'Ready to adopt!'}</small></div>`;
    }).join('');
  } else {
    const level = myRoom()!.level ?? 0;
    const owned = mine.rooms.length;
    const next = owned < MAX_ROOMS ? `<div class="card room-card"><b>Another room</b><div class="room-mini" style="--w:10;--h:8"></div>
        <small>Room ${owned + 1} of ${MAX_ROOMS}</small><button data-act="addroom" ${me.coins < ROOM_COST[owned] ? 'disabled' : ''}>${coin()} ${ROOM_COST[owned]}</button></div>` : '';
    shelf = ROOM_SIZES.map((s, i) => {
      const state = i <= level ? '<span class="tag">Owned</span>'
        : i === level + 1 ? `<button data-act="expand" ${me.coins < EXPAND_COST[i] ? 'disabled' : ''}>${coin()} ${EXPAND_COST[i]}</button>`
        : `<small class="hint">${coin()} ${EXPAND_COST[i]}</small>`;
      return `<div class="card room-card"><b>${['Cozy', 'Roomy', 'Spacious', 'Grand'][i]}</b>
        <div class="room-mini" style="--w:${s.w};--h:${s.h}"></div><small>${s.w} × ${s.h} tiles</small>${state}</div>`;
    }).join('') + next;
    shelf = roomPicker(mine) + shelf;
  }
  const note = tab.id === 'work' ? '<p class="hint">Drinks can go on any table. Your buddy studies at a desk chair behind a table.</p>'
    : tab.id === 'fitness' ? '<p class="hint">When your buddy wanders past, they hop on and work out.</p>'
    : tab.id === 'petstuff' ? '<p class="hint">Your pets climb, nap and chase the ball on their own.</p>'
    : tab.id === 'petacc' ? '<p class="hint">Buy once, then dress up any of your pets from the You panel.</p>'
    : tab.id === 'pets' ? `<p class="hint">Pets wander your room and your housemates can see them. Up to ${MAX_PETS} pets.</p>`
    : tab.id === 'room' ? `<p class="hint">Upgrades add floor space to the room you pick. Up to ${MAX_ROOMS} rooms each; new rooms join the house next to your others.</p>` : '';
  return `<div class="shop"><nav class="rail">${rail}</nav><div class="shelf">${note}<div class="grid">${shelf}</div></div></div>`;
}

// Chips to choose which of my rooms Decorate and the room shop work on.
const roomPicker = (mine: Member) => mine.rooms.length < 2 ? '' : `<div class="row room-pick">${mine.rooms.map((_, ri) =>
  `<button class="${ri === editRoom ? 'on' : 'off'}" data-act="editroom" data-v="${ri}">Room ${ri + 1}</button>`).join('')}</div>`;

function decorateBody(mine: Member) {
  const inv = Object.entries(me.inventory).filter(([k, n]) => n > 0 && ITEMS[k as ItemKey]);
  const sel = moving !== null ? myRoom()!.furniture[moving] : null;
  if (!sel) moving = null;
  const palette = sel ? colorsFor(sel.item) : [];
  const looks: string[] = sel ? (ITEMS[sel.item as ItemKey] as { looks?: string[] }).looks ?? [] : [];
  const selBar = sel ? `<div class="selected">${icon(sel.item)}<b>${ITEMS[sel.item as ItemKey].name}</b>
      <button class="off" data-act="flip" title="Turn it to face the other way">↔ Turn</button>
      <button class="off" data-act="putaway">Put away</button><button data-act="deselect">Done</button></div>
      ${looks.length ? `<h3>Style</h3><div class="row styles">${looks.map((name, k) =>
        `<button class="${(sel.s ?? 0) === k ? 'on' : 'off'}" data-act="shape" data-v="${k}">${icon(sel.item, 'chip-icon', k)}${name}</button>`).join('')}</div>` : ''}
      ${palette.length ? `<h3>Colour</h3>${swatches('recolor', palette, sel.v ?? -1, true)}` : ''}` : '';
  const hint = placing ? `Tap a spot in your room to place the <b>${ITEMS[placing].name}</b>.`
    : sel ? 'Drag it, or tap a new spot to move it there.' : 'Drag any furniture to move it, or tap it for more options.';
  return `${roomPicker(mine)}${selBar}<p class="hint">${hint}</p>
    ${inv.length ? `<h3>Storage</h3><div class="grid">${inv.map(([k, n]) => `<div class="card${placing === k ? ' on' : ''}"><b>${ITEMS[k as ItemKey].name} ×${n}</b>${icon(k)}<button data-act="place" data-v="${k}">Place</button></div>`).join('')}</div>` : '<p class="hint">Storage is empty. Visit the Shop!</p>'}
    <h3>Wallpaper</h3>${swatches('wallpaper', WALLPAPERS, myRoom()!.wallpaper)}
    <h3>Pattern</h3>${choices('pattern', WALL_PATTERNS, myRoom()!.pattern ?? 'plain')}
    <h3>Floor</h3>${swatches('floor', FLOORS, myRoom()!.floor)}
    <h3>Floor style</h3>${choices('floorStyle', FLOOR_STYLES, myRoom()!.floorStyle ?? 'planks')}
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
      ${mine.pets.length ? `<h3>Your pets</h3>${mine.pets.map((p, slot) => {
        const coats = PETS[p.kind as PetKey]?.coats ?? [];
        const accs = me.petAccs ?? [];
        return `<div class="pet-row"><span class="pet-chip">${petIcon(p.kind, 'chip-icon', p.coat, p.acc)}${PETS[p.kind as PetKey]?.name ?? p.kind}</span>
          <div class="swatches">${coats.map((c, k) => `<button class="swatch${(p.coat ?? 0) === k ? ' on' : ''}" style="background:${c}" data-act="petcoat" data-slot="${slot}" data-v="${k}" aria-label="Coat ${k + 1}"></button>`).join('')}</div>
          ${accs.length ? `<div class="row">${['', ...accs].map((a) => `<button class="${(p.acc ?? '') === a ? 'on' : 'off'}" data-act="petacc" data-slot="${slot}" data-v="${a}">${a ? PET_ACCS[a as keyof typeof PET_ACCS].name : 'None'}</button>`).join('')}</div>` : ''}</div>`;
      }).join('')}${(me.petAccs ?? []).length ? '' : '<p class="hint">Get bows, hats and more for your pets in Shop → Pet style.</p>'}` : ''}
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
  const railX = panel.querySelector('.rail')?.scrollLeft ?? 0; // keep the swiped category strip where it was
  panel.hidden = false;
  panel.style.setProperty('--theme', th.color);
  panel.innerHTML = `<header class="ph"><img src="${uiIconURL(th.icon)}" alt=""><h2>${th.title}</h2>
    <button class="close" data-act="close" aria-label="Close">✕</button></header><div class="pb">${panelBody(mine)}</div>`;
  panel.querySelector('.pb')!.scrollTop = scroll;
  const rail = panel.querySelector<HTMLElement>('.rail');
  if (rail) rail.scrollLeft = railX;
  const nameInput = panel.querySelector<HTMLInputElement>('#name');
  nameInput?.addEventListener('change', () => send({ t: 'look', name: nameInput.value, look: mine.look }));
}

panel.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
  const mine = myMember();
  if (!b || !mine) return;
  const v = b.dataset.v!;
  const room = myRoom()!;
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
    case 'tab': {
      shopTab = v; renderPanel(); panel.querySelector('.pb')!.scrollTop = 0;
      // Centre the chosen category in the strip on narrow screens.
      const rail = panel.querySelector<HTMLElement>('.rail'), on = rail?.querySelector<HTMLElement>('.rail-btn.on');
      if (rail && on) rail.scrollLeft = on.offsetLeft - (rail.clientWidth - on.offsetWidth) / 2;
      break;
    }
    case 'buy': send({ t: 'buy', item: v }); toast(`${icon(v)} Bought <b>${ITEMS[v as ItemKey].name}</b>! Place it from Decorate.`); break;
    case 'buyacc': send({ t: 'buy_acc', acc: v }); toast(`Bought the <b>${PET_ACCS[v as keyof typeof PET_ACCS].name}</b>! Put it on a pet from the You panel.`); break;
    case 'petcoat': send({ t: 'pet_style', slot: Number(b.dataset.slot), coat: Number(v) }); break;
    case 'petacc': send({ t: 'pet_style', slot: Number(b.dataset.slot), acc: v }); break;
    case 'adopt': send({ t: 'adopt', kind: v }); toast(`${petIcon(v)} Welcome home, <b>${PETS[v as PetKey].name}</b>!`, 'reward'); break;
    case 'addroom': send({ t: 'add_room' }); editRoom = mine.rooms.length; toast('A new room! Find it next to your others.', 'reward'); break;
    case 'editroom': editRoom = Number(v); moving = null; placing = null; renderPanel(); break;
    case 'expand': send({ t: 'expand', r: editRoom }); toast('Your room just got bigger!', 'reward'); break;
    case 'place': placing = v as ItemKey; moving = null; renderPanel(); break;
    case 'putaway': if (moving !== null) send({ t: 'pickup', r: editRoom, index: moving }); moving = null; renderPanel(); break;
    case 'deselect': moving = null; renderPanel(); break;
    case 'flip': if (moving !== null) send({ t: 'flip', r: editRoom, index: moving }); break;
    case 'recolor': if (moving !== null) send({ t: 'restyle', r: editRoom, index: moving, v: Number(v) }); break;
    case 'shape': if (moving !== null) send({ t: 'shape', r: editRoom, index: moving, s: Number(v) }); break;
    case 'wallpaper': case 'floor': case 'pattern': case 'floorStyle':
      send({ t: 'room', r: editRoom, wallpaper: room.wallpaper, floor: room.floor, pattern: room.pattern, floorStyle: room.floorStyle, [b.dataset.act]: v }); break;
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
  if (name === 'decorate') {
    const a = avatars.get(myId);
    const here = a ? slots[grid.owner[Math.round(a.ty) * grid.w + Math.round(a.tx)]] : undefined;
    if (here?.m.id === myId) editRoom = here.ri;
  }
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

// ---------- shared to-dos, private to-dos and chat ----------
function todoHTML(list: Todo[], empty: string) {
  return list.length
    ? list.map((t) => `<li class="${t.done ? 'done' : ''}">
        <button class="check" data-todo="toggle" data-id="${t.id}" aria-label="${t.done ? 'Mark not done' : 'Mark done'}">${t.done ? '✓' : ''}</button>
        <span class="todo-text">${esc(t.text)}${t.by ? `<small>${esc(t.by)}</small>` : ''}</span>
        <button class="del" data-todo="del" data-id="${t.id}" aria-label="Delete">✕</button></li>`).join('')
    : `<li class="empty">${empty}</li>`;
}

// Private threads: unread counts per housemate, and the highest message id seen.
const dmUnread: Record<string, number> = {};
const dmSeen: Record<string, number> = {};
let dmReady = false;

function noteNewDms() {
  for (const [peer, list] of Object.entries(me.dm ?? {})) {
    const last = list[list.length - 1];
    if (!last) continue;
    // A brand new thread after the first load is genuinely new, so count it.
    const seen = dmSeen[peer] ?? (dmReady ? 0 : last.id);
    if (last.id <= seen) continue;
    const fresh = list.filter((c) => c.id > seen && c.from !== myId).length;
    // Unread unless that thread is open on screen right now.
    const onScreen = dmPeer === peer && document.body.classList.contains('side-open');
    if (dmReady && fresh && !onScreen) {
      if (dmPeer !== peer) dmUnread[peer] = (dmUnread[peer] ?? 0) + fresh;
      unread = true;
      noteUnreadChat();
    }
    dmSeen[peer] = last.id;
  }
  dmReady = true;
}

// The chat card's recipient picker: the whole house, or one housemate.
function syncChatPeer() {
  const sel = $<HTMLSelectElement>('#chatPeer');
  const others = members.filter((m) => m.id !== myId);
  if (dmPeer && !others.some((m) => m.id === dmPeer)) dmPeer = null;
  // Pending unread counts for people who moved out would be unreachable otherwise.
  for (const peer of Object.keys(dmUnread)) if (!others.some((m) => m.id === peer)) delete dmUnread[peer];
  // Only rebuild when the list or an unread count really changed, so an open
  // picker isn't torn down in the middle of a choice by an unrelated update.
  const sig = others.map((m) => `${m.id}:${m.name}:${dmUnread[m.id] ?? 0}:${dmPeer === m.id ? 1 : 0}`).join('|');
  if (sel.dataset.sig !== sig) {
    sel.dataset.sig = sig;
    sel.innerHTML = ['<option value="">Everyone in the house</option>']
      .concat(others.map((m) => `<option value="${m.id}"${dmPeer === m.id ? ' selected' : ''}>${esc(m.name)}${dmUnread[m.id] ? ` (${dmUnread[m.id]})` : ''}</option>`))
      .join('');
  }
  sel.hidden = others.length === 0;
}

function renderSide() {
  $('#todoList').innerHTML = todoHTML(todos, 'Nothing yet. Add something to study!');
  $('#myTodoList').innerHTML = todoHTML(me.todos ?? [], 'Just for you — nobody else can see this.');
  syncChatPeer();
  const log = $('#chatLog');
  const msgs = dmPeer ? me.dm?.[dmPeer] ?? [] : chat;
  const peerName = members.find((m) => m.id === dmPeer)?.name ?? 'them';
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  log.innerHTML = msgs.length
    ? msgs.map((c) => `<p class="${c.from === myId ? 'mine' : ''}"><b>${esc(c.by)}</b>${esc(c.text)}</p>`).join('')
    : dmPeer
      ? `<p class="empty">Just you and ${esc(peerName)} — nobody else can see this.</p>`
      : '<p class="empty">Say hi to your housemates 👋</p>';
  $<HTMLInputElement>('#chatInput').placeholder = dmPeer ? `Message ${peerName}…` : 'Say something…';
  if (dmPeer) dmUnread[dmPeer] = 0;
  if (atBottom) scrollChat();
}
const scrollChat = () => { const log = $('#chatLog'); log.scrollTop = log.scrollHeight; };

function wireTodos(list: string, form: string, input: string, kinds: { add: string; toggle: string; del: string }) {
  $(list).addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-todo]');
    if (b) send({ t: b.dataset.todo === 'toggle' ? kinds.toggle : kinds.del, id: Number(b.dataset.id) });
  });
  $(form).addEventListener('submit', (e) => {
    e.preventDefault();
    const el = $<HTMLInputElement>(input);
    if (el.value.trim()) send({ t: kinds.add, text: el.value });
    el.value = '';
  });
}
wireTodos('#todoList', '#todoForm', '#todoInput', { add: 'todo_add', toggle: 'todo_toggle', del: 'todo_del' });
wireTodos('#myTodoList', '#myTodoForm', '#myTodoInput', { add: 'ptodo_add', toggle: 'ptodo_toggle', del: 'ptodo_del' });
$('#chatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $<HTMLInputElement>('#chatInput');
  if (input.value.trim()) send(dmPeer ? { t: 'dm', to: dmPeer, text: input.value } : { t: 'chat', text: input.value });
  input.value = '';
});
$('#chatPeer').addEventListener('change', () => {
  dmPeer = $<HTMLSelectElement>('#chatPeer').value || null;
  if (dmPeer) dmUnread[dmPeer] = 0;
  if (!Object.values(dmUnread).some(Boolean)) { unread = false; tickTimers(); } // caught up on everything
  renderSide();
  scrollChat();
});
$('#closeSide').addEventListener('click', () => setPanel(null));
$<HTMLImageElement>('#todoIcon').src = uiIconURL('clock');

// Each side card folds down to its header, and remembers that between visits.
type SideCard = 'todos' | 'personal' | 'chat';
const folds = (() => {
  try { return JSON.parse(localStorage.getItem('auralis.folds') ?? '{}') as Record<SideCard, boolean>; }
  catch { return {} as Record<SideCard, boolean>; }
})();
const sideCard: Record<SideCard, HTMLElement> = {
  todos: document.querySelector('.side-card.todos')!,
  personal: document.querySelector('.side-card.mine')!,
  chat: document.querySelector('.side-card.chat')!,
};
const sideLabel: Record<SideCard, string> = { todos: 'house to-dos', personal: 'my to-dos', chat: 'chat' };

function applyFold(card: SideCard) {
  const folded = !!folds[card];
  const btn = $(`#fold-${card}`);
  sideCard[card].classList.toggle('folded', folded);
  btn.setAttribute('aria-expanded', String(!folded));
  btn.setAttribute('aria-label', `${folded ? 'Expand' : 'Collapse'} ${sideLabel[card]}`);
  btn.textContent = folded ? '▸' : '▾';
  if (!folded) btn.classList.remove('dot');
}
function toggleFold(card: SideCard) {
  folds[card] = !folds[card];
  localStorage.setItem('auralis.folds', JSON.stringify(folds));
  applyFold(card);
}
for (const card of ['todos', 'personal', 'chat'] as SideCard[]) {
  applyFold(card);
  $(`#fold-${card}`).addEventListener('click', () => toggleFold(card));
  // A folded card also opens when you tap anywhere on its header.
  sideCard[card].querySelector('.side-head')!.addEventListener('click', (e) => {
    if (folds[card] && !(e.target as HTMLElement).closest('button')) toggleFold(card);
  });
}
// Landing on a new chat message should not stay hidden behind a folded card.
function noteUnreadChat() {
  if (folds.chat) $('#fold-chat').classList.add('dot');
}

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
  const i = mySlot();
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
// The landing and login page can be zoomed like any web page (for reading); the game itself can't, so pinches
// zoom the room instead of the whole page.
const viewport = document.querySelector('meta[name=viewport]')!;
function showLanding(on: boolean) {
  viewport.setAttribute('content', on ? 'width=device-width, initial-scale=1, viewport-fit=cover'
    : 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, user-scalable=no');
  document.body.classList.toggle('signed-out', on);
  document.documentElement.classList.toggle('signed-out', on);
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
    $('#authConfirmLabel').hidden = authMode !== 'signup';
    $<HTMLInputElement>('#authConfirm').required = authMode === 'signup';
    $('#authUserText').textContent = authMode === 'signup' ? 'Username' : 'Username or email';
    $('#authHint').textContent = authMode === 'signup' ? 'Already studying with us? Switch to Log in.' : 'New here? Switch to Sign up.';
    $('#authError').hidden = true;
  }));

$('#authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#authError');
  const btn = $<HTMLButtonElement>('#authSubmit');
  if (authMode === 'signup' && $<HTMLInputElement>('#authPass').value !== $<HTMLInputElement>('#authConfirm').value) {
    err.textContent = "Passwords don't match.";
    err.hidden = false;
    return;
  }
  btn.disabled = true;
  document.body.classList.add('busy');
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
    document.body.classList.remove('busy');
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
