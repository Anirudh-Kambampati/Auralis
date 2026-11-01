import {
  SHELVES, buildGrid, walkable, canPlace, placeSwaps,roomSize, MAX_ROOMS, ROOM_COST, colorsFor, ITEMS, PETS, PET_ACCS, MAX_PETS, EXPAND_COST, ROOM_SIZES,
  WALLPAPERS, WALL_PATTERNS, FLOORS, FLOOR_STYLES, SKINS, HAIRS, SHIRTS, STYLES, FACES, OUTFITS, BODIES, ACCESSORIES, FOCUS_LENGTHS,
  WALL_H, WALL, FLOOR, DOOR, BLOCKED, VOID, buddyMultiplier, focusEnd, streakDays, streakBonus, sellPrice, footprint, lying, THIRSTY_MS, isPlant, discounted, GIFT_COINS, activeEvents, nextEvent,
} from '../shared/game.js';
import {
  T, OVERHANG, SURFACE, drawSeated, drawActing, drawSeam, drawFloor, drawWall, drawWallFace, drawWallTop, drawDoor, drawWindow, drawPainting, drawFurniture, drawAvatar, drawDeskLamp, drawGlow, drawUsing, skyNow, NIGHT_TINT,
  coinURL, uiIconURL, AV, drawPaper, paintBlockText, drawWindow as drawWin, drawDroplet, drawHeart, tileURL, type Look,
} from './draw';
import { drawPet, petPos, petIconURL, seedOf } from './pets';
import { toggleSound, soundName, chime, ping } from './sounds';
import { countUnseen } from './tabBadge';
import { syncWatch } from './watch';
import { parseVideo } from '../shared/watch.js';
import { chart, streak, rangeTitle, shift, hm, RANGES } from '../shared/stats.js';
import './style.css';

type Furniture = { item: string; x: number; y: number; v?: number; s?: number; flip?: boolean; rot?: number; wateredAt?: number; off?: boolean };
type Room = { wallpaper: string; floor: string; pattern?: string; floorStyle?: string; level?: number; curtains?: boolean; furniture: Furniture[] };
type Member = {
  id: string; name: string; look: Look; rooms: Room[]; focus: Focus | null;
  totalMinutes: number; online: boolean; pos: { x: number; y: number } | null; pets: { kind: string; coat?: number; acc?: string }[]; fedAt?: number;
  exams?: { subject: string; date: string }[]; // YYYY-MM-DD, soonest first
};
type Todo = { id: number; text: string; done: boolean; by: string; all?: boolean; ticks?: string[] }; // all: everyone has to tick it
type Chat = { id: number; from: string; by: string; text: string; at: number };
type CalEvent = { id: number; date: string; time?: string; text: string; by?: string }; // date YYYY-MM-DD, time HH:MM
type Focus = { minutes: number; endsAt: number; pausedAt?: number | null };
type Session = { at: number; minutes: number; tag: string; early?: boolean };
type Me = { id: string; home?: string; visited?: { code: string; ownerName: string | null; online: number }[]; banned?: { id: string; name: string }[]; coins: number; discount?: boolean; notes?: { from: string; text: string; at: number }[]; events?: CalEvent[]; inventory: Record<string, number>; sessions: Session[]; subjects: string[]; hiddenSubjects: string[]; todos: Todo[]; dm: Record<string, Chat[]>; petAccs?: string[] };
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
let houseEvents: CalEvent[] = [];
let chat: Chat[] = [];
let dmPeer: string | null = null; // null = talking to the whole house
let houseCode = '';
let houseOwnerName = ''; // whose home this house is (empty for old shared houses with no owner)
// A housemate's group focus session that others can still join; their timers all end together.
type Group = { by: string; byName: string; minutes: number; endsAt: number; tag: string };
let group: Group | null = null;
let groupSeen = 0; // endsAt of the last group session I was told about
let notesSeen = 0; // newest desk note already shown
let noteTo: string | null = null; // housemate I'm writing a desk note for
let finishedSession = false; // the session that just ended ran to the end (not given up): take a break
let missed = 0; // messages that arrived while I was focusing, quietly
const cheers = new Map<string, { by: string; at: number }>(); // 👏 floating over a studying player
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
let lastDoneTry = 0; // when we last told the server a finished session is done
let view = { ox: 0, oy: 0, scale: 1 };
// Extra scale steps (of AV) on top of the fitted view (+ zooms in, - zooms out).
// Phones start one step closer, so faces and small things are easier to see; pinch or +/- changes it.
const savedZoom = localStorage.getItem('auralis.zoom');
let zoom = Math.max(-2, Math.min(2, savedZoom !== null ? Number(savedZoom) || 0 : innerWidth < 600 ? 1 : 0));
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
    if (!houseCode) { showLoading(false); setTimeout(welcome, 800); }
    myId = m.me.id;
    // Moved house: start in my own room, drop any walk or seat that pointed at the old house's tiles,
    // and treat its chat history as already seen.
    if (m.house.code !== houseCode) { lastChatId = -1; avatars.delete(myId); path = []; seat = null; useNext = null; arrive = null; endBreak(); }
    const wasFocusing = !!myMember()?.focus;
    const oldGrid = grid, oldSlots = slots.map((x) => `${x.m.id}:${x.ri}`);
    houseCode = m.house.code;
    houseOwnerName = m.house.ownerName ?? '';
    members = m.house.members;
    todos = m.house.todos;
    houseEvents = m.house.events ?? [];
    me = m.me;
    group = m.house.group ?? null;
    if (group && group.by !== myId && group.endsAt !== groupSeen && !myMember()?.focus) {
      groupSeen = group.endsAt;
      notify(chime);
      toast(`📚 <b>${esc(group.byName)}</b> started a group focus session. Open Focus to join in!`, 'reward');
    }
    const notes = (me.notes ?? []).filter((n) => n.at > notesSeen);
    if (notes.length) {
      notesSeen = Math.max(...notes.map((n) => n.at));
      notify(chime);
      for (const n of notes) toast(`📝 Note from <b>${esc(n.from)}</b>: ${esc(n.text)}`, 'reward');
      send({ t: 'notes_read' });
    }
    syncWatch(m.house.watch ?? null, myId, send);
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
        const d = footprint(f);
        // Beds: only the pillow row is a place to lie down, so sleepers are on the bed, head on the pillow.
        const rows = it.act === 'sleep' && !f.rot ? 1 : d.h;
        if (it.act) for (let y = 0; y < rows; y++) for (let x = 0; x < d.w; x++) acts.set(tileKey(o.x + f.x + x, o.y + f.y + y), { item: f.item, act: it.act, col: furnColor(f) });
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
    if (!focusing && wasFocusing) {
      standUp();
      if (missed) toast(`💬 ${missed} new message${missed > 1 ? 's' : ''} while you were focusing.`);
      missed = 0;
      // Pomodoro: a finished session rolls straight into a short break, then nudges you to go again.
      if (finishedSession) { // every fourth session of the day earns a long break
        const today = me.sessions.filter((s) => !s.early && isoDay(new Date(s.at)) === isoDay(new Date())).length;
        if (today % 4 === 0) startBreak(15 * 60_000, `🍅 That's ${today} today! Take a proper 15-minute break.`);
        else startBreak(5 * 60_000, `☕ Nice work! Take a 5-minute break. (${4 - (today % 4)} more until a long one)`);
      }
      finishedSession = false;
    }
    renderHud();
    renderSide();
    if (openPanel && !isSide(openPanel)) renderPanel();
  } else if (m.t === 'pos') {
    const a = avatars.get(m.id);
    if (a) { a.tx = m.x; a.ty = m.y; a.use = m.use; }
  } else if (m.t === 'leaderboard') {
    board = m;
    if (openPanel === 'stats') renderPanel();
  } else if (m.t === 'cheer') {
    cheers.set(m.to, { by: m.from, at: Date.now() }); // silent, even for the one studying
  } else if (m.t === 'reward') {
    notify(chime);
    if (!m.text) finishedSession = true; // a focus session paid out
    if (m.text) toast(esc(m.text), 'reward');
    else toast(`Session complete! +${m.coins} ${coin()}${m.buddies ? ` (×${buddyMultiplier(m.buddies)} for studying together!)` : ''}${streakBonus(m.streak) ? ` 🔥 ${m.streak}-day streak +${streakBonus(m.streak) * 100}%` : ''}`, 'reward');
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
        if (chatHidden()) pingOrHold();
        countUnseen();
        if (document.body.dataset.side !== 'chat' || dmPeer) unread = true;
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
let arrive: (() => void) | null = null; // what to do once I reach furniture I clicked (water it, nap...)
let stayMs = 0; // how long to stay on furniture I picked myself, instead of a random little while

// Installing to the home screen: the browser offers it once the page qualifies; we keep that offer for the You panel's button.
let installPrompt: (Event & { prompt: () => void }) | null = null;
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e as Event & { prompt: () => void };
  if (openPanel === 'avatar') renderPanel();
});
addEventListener('appinstalled', () => toast('📲 Auralis is on your home screen!', 'reward'));
// Only the built site has the service worker (it serves an offline page); in development it would cache stale pages.
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').catch(() => {});

// Notification sounds (rewards, new messages), on unless turned off in the You panel.
let chimes = localStorage.getItem('auralis.chimes') !== 'off';
const notify = (sound: () => void) => { if (chimes) sound(); };
// Do not disturb: messages during a focus session are counted, not pinged, and summed up afterwards.
const pingOrHold = () => { if (myMember()?.focus) missed++; else notify(ping); };

// Breaks: lying down in a bed you clicked (5 minutes) or a snack at the fridge (2), ending with a chime.
const NAP_MS = 5 * 60_000, SNACK_MS = 2 * 60_000;
let breakTimer = 0, breakEnds = 0; // breakEnds: shown counting down in the HUD
function endBreak() { clearTimeout(breakTimer); breakTimer = 0; }
function startBreak(ms: number, text: string) {
  endBreak();
  toast(text);
  breakEnds = Date.now() + ms;
  breakTimer = window.setTimeout(() => {
    breakTimer = 0;
    chime(); // an alarm you set yourself, so it rings even with notification sounds off
    if (!myMember()?.focus) standUp();
    toast("⏰ Break's over! Ready for another focus session?", 'reward');
    if (!openPanel && !myMember()?.focus) setPanel('focus');
  }, ms);
}

const TVS = new Set(['tv', 'retroTV', 'mediaConsole']);
const STARS = ['🌠 A shooting star! Make a wish.', "✨ You spotted Orion's belt.", '🪐 Is that Saturn? It is!', '🌌 The Milky Way is out tonight.', '🌙 The moon is so bright.'];
// What some furniture does once you've walked up to it, on top of the little animation.
function afterUse(f: Furniture, owner: Member, ri: number, fi: number): (() => void) | null {
  const it = ITEMS[f.item as ItemKey] as { name: string; use?: string };
  if (isPlant(f.item)) return () => { send({ t: 'water', owner: owner.id, r: ri, index: fi }); toast(`💧 Watered the ${it.name.toLowerCase()}.`); };
  if (f.item === 'foodBowl') return () => (owner.pets.length ? send({ t: 'feed', owner: owner.id, r: ri, index: fi }) : toast('No pets here to feed yet.'));
  if (f.item === 'giftBox') return () => { setPanel('house'); toast('Pick a housemate to send a gift.'); };
  if (f.item === 'whiteboard') return () => openSide('todos', '#todoInput');
  if (TVS.has(f.item)) return () => { openSide('chat', '#chatInput', '/watch '); toast('Paste a YouTube, Vimeo or Twitch link after <b>/watch</b> to watch it together.'); };
  if (it.use === 'read') return () => { if (!myMember()?.focus) setPanel('focus'); };
  if (it.use === 'snack' || it.use === 'tea') return () => startBreak(SNACK_MS, '🍪 Snack break: 2 minutes.');
  if (it.use === 'primp' || it.use === 'dress') return () => setPanel('avatar');
  if (it.use === 'stargaze') return () => toast(skyNow() === 'day' ? "It's too bright for stars. Come back after dark!" : STARS[Math.floor(Math.random() * STARS.length)]);
  return null;
}

// Walk to my own chair (preferring one just behind a desk, in any of my rooms) and sit down facing the room.
function goSit() {
  const a = avatars.get(myId);
  const mine = myMember();
  if (!mine || !a) return;
  endBreak();
  const it = (f: Furniture) => ITEMS[f.item as ItemKey] as { w: number; chair?: boolean; table?: boolean } | undefined;
  const chairs = mine.rooms.flatMap((room, ri) => room.furniture.filter((f) => it(f)?.chair).map((c) => ({
    c, i: slotOf(myId, ri),
    desk: room.furniture.some((d) => it(d)?.table && c.x >= d.x && c.x < d.x + footprint(d).w && c.y + 1 === d.y),
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
    // On furniture (in bed, on a chair) with no floor beside it: climb off over the furniture rather than be stuck.
    const onFurniture = grid.at(c.x, c.y) === BLOCKED;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { x: c.x + dx, y: c.y + dy };
      if (!prev.has(key(n.x, n.y)) && (pass(n.x, n.y) || (onFurniture && grid.at(n.x, n.y) === BLOCKED))) {
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
  camPan.x = camPan.y = 0; // the camera follows me again
  const a = avatars.get(myId);
  if (!a) return;
  // Taps on the paper around the house, or outside it entirely, are ignored.
  if (x < 0 || y < 0 || x >= grid.w || y >= grid.h) return;
  if (grid.at(x, y) === VOID) return;
  const target = walkable(grid.at(x, y)) ? { x, y } : nearestWalkable(x, y);
  seat = null;
  useNext = null;
  arrive = null;
  stayMs = 0;
  endBreak();
  quietUntil = Date.now() + 2500;
  const p = bfs({ x: a.tx, y: a.ty }, (cx, cy) => cx === target.x && cy === target.y);
  if (p && p.length > 1) path = p.slice(1);
}

// Click furniture to use it: sit on chairs, sleep in beds, work out on gym gear, water plants, read at shelves...
// Returns false when the piece does nothing, so the click just walks there.
function interact(si: number, fi: number) {
  const { m, room, ri } = slots[si], f = room.furniture[fi];
  const it = ITEMS[f.item as ItemKey] as { w: number; h: number; act?: string; use?: string };
  const a = avatars.get(myId);
  if (!a || !it || (!it.act && !it.use)) return false;
  walkTo(a.tx, a.ty); // stop whatever I was doing
  path = [];
  const o = grid.origins[si], start = { x: a.tx, y: a.ty };
  const pass = (x: number, y: number) => walkable(grid.at(x, y));
  const taken = new Set([...avatars].filter(([id]) => id !== myId).map(([, b]) => tileKey(b.tx, b.ty)));
  const fp = footprint(f);
  // Fallback when the usual spot is blocked (a sofa in front of the TV, a bed in a corner): any open tile beside the piece.
  const beside = (cx: number, cy: number) => pass(cx, cy) && !taken.has(tileKey(cx, cy))
    && cx >= o.x + f.x - 1 && cx <= o.x + f.x + fp.w && cy >= o.y + f.y - 1 && cy <= o.y + f.y + fp.h
    && (cx >= o.x + f.x && cx < o.x + f.x + fp.w || cy >= o.y + f.y && cy < o.y + f.y + fp.h); // not diagonal
  if (it.act) { // on top of it
    const tiles: { x: number; y: number }[] = [];
    for (let dy = 0; dy < fp.h; dy++) for (let dx = 0; dx < fp.w; dx++) {
      const x = o.x + f.x + dx, y = o.y + f.y + dy;
      if (acts.has(tileKey(x, y)) && !taken.has(tileKey(x, y))) tiles.push({ x, y });
    }
    if (!tiles.length) { toast('Someone is already using that.'); return true; }
    const p = bfs(start, (cx, cy) => pass(cx, cy) && tiles.some((u) => Math.abs(cx - u.x) + Math.abs(cy - u.y) === 1), pass)
      ?? bfs(start, beside, pass); // then climb on from wherever there's room
    if (!p) { toast("You can't reach that from here."); return true; }
    const end = p[p.length - 1];
    path = p.slice(1);
    seat = tiles.find((u) => Math.abs(end.x - u.x) + Math.abs(end.y - u.y) === 1) ?? tiles[0];
    stayMs = it.act === 'sleep' ? NAP_MS : 60_000;
    if (it.act === 'sleep') arrive = () => startBreak(NAP_MS, "😴 Taking a 5-minute break. You'll wake up with a chime.");
    return true;
  }
  // In front of it: the row just below.
  const fronts = Array.from({ length: fp.w }, (_, k) => ({ x: o.x + f.x + k, y: o.y + f.y + fp.h }))
    .filter((u) => (pass(u.x, u.y) || (u.x === start.x && u.y === start.y)) && !taken.has(tileKey(u.x, u.y)));
  const p = bfs(start, (cx, cy) => fronts.some((u) => u.x === cx && u.y === cy), pass)
    ?? bfs(start, beside, pass);
  if (!p) { toast("You can't reach that from here."); return true; }
  arrive = afterUse(f, m, ri, fi);
  if (p.length > 1) { path = p.slice(1); useNext = it.use!; return true; }
  // Already standing in front of it.
  a.use = it.use; a.up = true;
  send({ t: 'pos', x: a.tx, y: a.ty, use: a.use });
  restUntil = Date.now() + 6000;
  arrive?.();
  arrive = null;
  return true;
}

// Which top-row room has a window at this tile (one every 6 tiles along the back wall), or -1.
function windowAt(tx: number, ty: number) {
  return slots.findIndex((_, i) => {
    const o = grid.origins[i], s = grid.sizes[i], lx = tx - o.x, k = (lx - 1) % 6;
    return i < grid.cols && ty >= o.y - WALL_H && ty < o.y && lx >= 1 && k < 2 && lx - k + 2 <= s.w - 1;
  });
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
  const fronts: { x: number; y: number; use: string; water?: () => void; thirsty?: boolean }[] = [];
  slots.forEach(({ m, room, ri }, i) => {
    const o = grid.origins[i];
    room.furniture.forEach((f, index) => {
      const it = ITEMS[f.item as ItemKey] as { w: number; h: number; use?: string };
      if (!it?.use) return;
      const plant = isPlant(f.item);
      const water = plant ? () => send({ t: 'water', owner: m.id, r: ri, index }) : undefined;
      const thirsty = plant && Date.now() - (f.wateredAt ?? Date.now()) > THIRSTY_MS;
      const fp = footprint(f);
      for (let k = 0; k < fp.w; k++) {
        const fx = o.x + f.x + k, fy = o.y + f.y + fp.h;
        if ((seen.has(tileKey(fx, fy)) || (fx === start.x && fy === start.y)) && !taken.has(tileKey(fx, fy))) fronts.push({ x: fx, y: fy, use: it.use, water, thirsty });
      }
    });
  });
  // A thirsty plant in reach always wins: buddies water plants on their own, so nobody has to.
  const thirsty = fronts.filter((u) => u.thirsty);
  if (thirsty.length || (fronts.length && Math.random() < 0.45)) {
    const pool = thirsty.length ? thirsty : fronts;
    const u = pool[Math.floor(Math.random() * pool.length)];
    if (u.x === start.x && u.y === start.y) {
      a.use = u.use; a.up = true;
      send({ t: 'pos', x: u.x, y: u.y, use: u.use });
      restUntil = Date.now() + 4000 + Math.random() * 4000;
      u.water?.();
      return;
    }
    const p = bfs(start, (cx, cy) => cx === u.x && cy === u.y, pass);
    if (p) { path = p.slice(1); useNext = u.use; arrive = u.water ?? null; return; }
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
      const d = ITEMS[f.item as ItemKey] && footprint(f);
      return d && lx >= f.x && lx < f.x + d.w && ly >= f.y && ly < f.y + d.h;
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

// Drag the room to look around: a press that moves more than a few pixels scrolls the view instead of tapping.
const camPan = { x: 0, y: 0 }; // art pixels away from what the camera would frame on its own
let pan: { id: number; x: number; y: number; px: number; py: number; moved: boolean; down: PointerEvent } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 2) { pinchFrom = spread(); drag = null; pan = null; return; } // second finger: it's a pinch, not a tap
  if (touches.size > 2) return;
  const { tx, ty } = tileAt(e);
  // Decorate: pieces are grabbed (or placed) straight away; anywhere else the press may become a drag.
  if (openPanel === 'decorate' && myRoom()) {
    const o = grid.origins[mySlot()];
    if (placing || furnitureAt(myRoom()!, tx - o.x, ty - o.y) >= 0) { tapAt(e); return; }
  }
  pan = { id: e.pointerId, x: e.clientX, y: e.clientY, px: camPan.x, py: camPan.y, moved: false, down: e };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!pan || e.pointerId !== pan.id || touches.size > 1) return;
  const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
  if (!pan.moved && Math.hypot(dx, dy) < 8) return;
  if (!pan.moved) showTip(null);
  pan.moved = true;
  const k = (devicePixelRatio || 1) / view.scale; // screen pixels to art pixels
  camPan.x = pan.px - dx * k;
  camPan.y = pan.py - dy * k;
  canvas.style.cursor = 'var(--grabbing)';
});
const endPan = (e: PointerEvent) => {
  if (!pan || e.pointerId !== pan.id) return;
  const tap = !pan.moved && e.type === 'pointerup' && touches.size === 0 ? pan.down : null;
  if (pan.moved) canvas.style.cursor = '';
  pan = null;
  if (tap) tapAt(tap);
};
canvas.addEventListener('pointerup', endPan);
canvas.addEventListener('pointercancel', endPan);

function tapAt(e: PointerEvent) {
  const { tx, ty } = tileAt(e);
  const mine = myMember();
  if (openPanel === 'decorate' && mine) {
    const tapped = slots[grid.owner[ty * grid.w + tx]];
    if (!placing && !drag && tapped?.m.id === myId && tapped.ri !== editRoom) { editRoom = tapped.ri; moving = null; renderPanel(); return; }
    const o = grid.origins[mySlot()];
    const lx = tx - o.x, ly = ty - o.y;
    const i = furnitureAt(myRoom()!, lx, ly);
    if (placing) {
      if (placeSwaps(myRoom()!, placing, lx, ly)) { send({ t: 'place', r: editRoom, item: placing, x: lx, y: ly }); placing = null; }
      else toast('That spot is taken or outside your room.');
    } else if (i >= 0) {
      // Grab it: drag to move, or just tap to select it.
      const f = myRoom()!.furniture[i];
      moving = i;
      drag = { index: i, gx: lx - f.x, gy: ly - f.y, lx: f.x, ly: f.y, moved: false };
      canvas.setPointerCapture(e.pointerId);
    } else if (moving !== null) {
      const f = myRoom()!.furniture[moving];
      if (f && canPlace(without(myRoom()!, moving), f.item, lx, ly, f.rot)) send({ t: 'move', r: editRoom, index: moving, x: lx, y: ly });
      else toast("It doesn't fit there.");
    }
    renderPanel();
    return;
  }
  if (e.pointerType === 'touch') showTip(clickLabel(tx, ty), e.clientX, e.clientY - 40, 1200); // fingers can't hover
  // A housemate studying: cheer them on.
  const studier = studyingAt(tx, ty);
  if (studier) { send({ t: 'cheer', to: studier.id }); return; }
  // Clicking a window in one of your rooms opens or closes its curtains, for everyone.
  const wi = windowAt(tx, ty);
  if (wi >= 0 && slots[wi].m.id === myId) { send({ t: 'curtains', r: slots[wi].ri }); return; }
  const si = grid.owner[ty * grid.w + tx], hit = slots[si];
  const fi = hit ? furnitureAt(hit.room, tx - grid.origins[si].x, ty - grid.origins[si].y) : -1;
  const clicked = fi >= 0 ? hit.room.furniture[fi] : undefined;
  // Clicking something that makes a sound (record player, fireplace, clocks) in any room you can see toggles it, just for you.
  if (clicked && soundName(clicked.item)) {
    const what = soundName(clicked.item);
    toast(toggleSound(clicked.item) ? `🔊 ${what} on. Click the ${ITEMS[clicked.item as ItemKey].name.toLowerCase()} again to stop.` : `${what} off.`);
  }
  if (clicked?.item === 'deskCalendar') { if (hit.m.id === myId) setPanel('calendar'); else toast(esc(examLabel(hit.m))); return; }
  // A housemate's desk: leave them a note. A lamp in my own room: switch it on or off.
  if (clicked && hit.m.id !== myId && (ITEMS[clicked.item as ItemKey] as { table?: boolean }).table) { writeNote(hit.m.id); return; }
  if (clicked && hit.m.id === myId && LIGHTS.has(clicked.item)) {
    send({ t: 'light', r: hit.ri, index: fi });
    toast(`💡 ${ITEMS[clicked.item as ItemKey].name} ${clicked.off ? 'on' : 'off'}.`);
    return;
  }
  if (clicked && interact(si, fi)) return;
  walkTo(tx, ty);
}

// Zoom: the buttons, Ctrl/Cmd + wheel, or + and - on the keyboard.
const zoomInBtn = $<HTMLButtonElement>('#zoomIn'), zoomOutBtn = $<HTMLButtonElement>('#zoomOut');
function setZoom(next: number) {
  zoom = Math.max(-2, Math.min(2, next));
  localStorage.setItem('auralis.zoom', String(zoom));
  zoomInBtn.disabled = zoom >= 2;
  zoomOutBtn.disabled = zoom <= -2;
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
  if (pan?.moved) return; // dragging the view: keep the closed hand, no labels
  let c = '';
  if (openPanel === 'decorate' && myRoom()) {
    const { tx, ty } = tileAt(e), o = grid.origins[mySlot()];
    c = drag?.moved ? 'var(--grabbing)' : placing ? 'var(--place)' : o && furnitureAt(myRoom()!, tx - o.x, ty - o.y) >= 0 ? 'var(--grab)' : '';
  } else if (e.pointerType !== 'touch') { // a hand, and a label saying what a click does
    const { tx, ty } = tileAt(e), label = clickLabel(tx, ty);
    if (label) c = 'pointer';
    showTip(label, e.clientX + 14, e.clientY + 16);
  }
  if (openPanel === 'decorate') showTip(null);
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
    if (canPlace(without(myRoom()!, drag.index), f.item, drag.lx, drag.ly, f.rot)) send({ t: 'move', r: editRoom, index: drag.index, x: drag.lx, y: drag.ly });
    else toast("It doesn't fit there.");
  }
  drag = null;
});

// Decorate shortcuts for the selected piece: arrows nudge it a tile, R rotates, F flips, Delete puts it away, Esc is done.
addEventListener('keydown', (e) => {
  if (openPanel !== 'decorate' || moving === null || (e.target as HTMLElement).closest('input, textarea, select')) return;
  const f = myRoom()?.furniture[moving];
  if (!f) return;
  const step = ({ ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] } as Record<string, number[]>)[e.key];
  const act = { r: 'rotate', f: 'flip', Delete: 'putaway', Backspace: 'putaway', Escape: 'deselect' }[e.key.length === 1 ? e.key.toLowerCase() : e.key];
  if (step) {
    if (canPlace(without(myRoom()!, moving), f.item, f.x + step[0], f.y + step[1], f.rot)) send({ t: 'move', r: editRoom, index: moving, x: f.x + step[0], y: f.y + step[1] });
  } else if (act) panel.querySelector<HTMLButtonElement>(`button[data-act="${act}"]`)?.click(); // same as pressing the button
  else return;
  e.preventDefault();
  e.stopImmediatePropagation(); // the arrows move the piece, not the avatar
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
        if (!seat && arrive) { arrive(); arrive = null; }
      }
    } else if (id === myId && seat && a.x === a.tx && a.y === a.ty) {
      a.tx = seat.x; a.ty = seat.y; a.up = true;
      send({ t: 'pos', x: seat.x, y: seat.y });
      // Lounging lasts a while; a workout or a bounce a little less.
      restUntil = Date.now() + (stayMs || (acts.get(tileKey(seat.x, seat.y))?.act === 'sit' ? 8000 + Math.random() * 7000 : 5000 + Math.random() * 5000));
      stayMs = 0;
      seat = null;
      if (arrive) { arrive(); arrive = null; }
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
  // Keep asking until the server ends the session: a single try is lost if the connection blinks
  // or this device's clock runs ahead of the server's (it refuses "done" before its own end time).
  if (focus && Date.now() >= focusEnd(focus) && Date.now() - lastDoneTry > 3000) {
    lastDoneTry = Date.now();
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
  const coverLeft = 0;
  const aw = cw - coverRight - coverLeft, ah = Math.max(ch * 0.3, ch - coverTop - coverBottom);
  // Frame the room I'm standing in (keep the last one while I'm in an opening or doorway).
  const here = grid.owner[Math.round(me_.y) * grid.w + Math.round(me_.x)];
  if (here >= 0) camRoom = here;
  const ri = Math.min(camRoom, grid.origins.length - 1);
  const o = grid.origins[ri] ?? { x: 1, y: WALL_H }, size = grid.sizes[ri] ?? roomSize(undefined);
  const roomW = (size.w + 2) * T, roomH = (size.h + WALL_H + 1) * T; // room plus its walls
  const fit = Math.max(1, Math.floor(Math.min(aw / (roomW + T), ah / (roomH + T / 2))));
  // Characters and redrawn furniture have AV times the detail, so keep the scale a multiple of AV: crisp half-pixels.
  const scale = Math.min(5 * AV, Math.max(AV, (Math.floor(fit / AV) + zoom) * AV));
  const vw = aw / scale, vh = ah / scale;
  // Centre the whole room when it fits on screen; otherwise follow the player.
  const fits = roomW <= vw && roomH <= vh;
  // When following the player, stop at the house edges so the view never shows empty paper beyond them.
  const follow = (p: number, view: number, size: number) => (size + T <= view ? size / 2 : Math.max(view / 2 - T / 2, Math.min(size - view / 2 + T / 2, p)));
  const bx = fits ? (o.x - 1) * T + roomW / 2 : me_.x * T + 8, by = fits ? (o.y - WALL_H) * T + roomH / 2 : me_.y * T + 8;
  const tx = follow(bx + camPan.x, vw, grid.w * T), ty = follow(by + camPan.y, vh, grid.h * T);
  camPan.x = tx - bx; camPan.y = ty - by; // dragging past the edge of the house doesn't pile up
  if (!cam || cam.scale !== scale) cam = { x: tx, y: ty, scale };
  const ease = pan?.moved ? 1 : 0.12; // glide when moving to another room; stick to the finger while dragging
  cam.x += (tx - cam.x) * ease;
  cam.y += (ty - cam.y) * ease;
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
  slots.forEach(({ room }, i) => {
    const o = grid.origins[i], s = grid.sizes[i];
    const wy = (o.y - WALL_H) * T;
    if (i < grid.cols) for (let lx = 1; lx + 2 <= s.w - 1; lx += 6) drawWindow(ctx, (o.x + lx) * T, wy, sky, !!room.curtains);
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
        const gi = ITEMS[g.item as ItemKey], gd = gi && footprint(g);
        return gi?.solid && f.x >= g.x && f.x < g.x + gd.w && f.y >= g.y && f.y < g.y + gd.h;
      }) : undefined;
      const lift = under ? SURFACE[under.item] ?? 0 : 0;
      // Tiles of a desk that something stands on: its own built-in laptop/mug there is hidden (bit 1 = left, 2 = right, as drawn).
      let bare = 0;
      const fp = footprint(f);
      if (it.solid && !f.rot) for (const g of room.furniture) {
        if ((ITEMS[g.item as ItemKey] as { top?: boolean } | undefined)?.top &&g.y >= f.y && g.y < f.y + it.h && g.x >= f.x && g.x < f.x + it.w) bare |= 1 << (f.flip ? f.x + it.w - 1 - g.x : g.x - f.x);
      }
      const thirsty = isPlant(f.item) && now - (f.wateredAt ?? now) > THIRSTY_MS; // droops until someone waters it
      const draw = () => {
        if (dragged) ctx.globalAlpha = 0.35;
        if (thirsty) ctx.filter = 'grayscale(0.7) brightness(0.9)';
        drawFurniture(ctx, f.item, (o.x + f.x) * T, (o.y + f.y) * T - lift, t, furnColor(f), f.flip, it.w, f.s, bare, f.rot, it.h, lying(it));
        ctx.filter = 'none';
        ctx.globalAlpha = 1;
        if (thirsty) drawDroplet(ctx, (o.x + f.x) * T + T / 2, (o.y + f.y) * T - lift - 6 + Math.round(Math.sin(t / 300)));
      };
      if (it.top) sprites.push({ y: o.y + f.y + 0.6, draw });
      else if (!it.solid) draw();
      else sprites.push({ y: o.y + f.y + fp.h - 0.5, draw });
    });
    if (ri === 0) m.pets?.forEach((p, slot) => { // pets live in their owner's first room
      const spots = petSpots[i];
      if (!spots?.length) return;
      const pos = petPos(seedOf(m.id, slot), now, spots, petToys[i]);
      const fed = now - (m.fedAt ?? 0); // just fed: a heart floats up for a few seconds
      sprites.push({ y: pos.y + 0.9, draw: () => {
        drawPet(ctx, p.kind, Math.round(pos.x * T), Math.round(pos.y * T), pos.moving, pos.left, now, pos.act, p.coat, p.acc);
        if (fed < 6000) drawHeart(ctx, pos.x * T + T / 2, pos.y * T - fed / 400);
      } });
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
        if (glow && !f.off) lights.push({ x: (o.x + f.x) * T + glow.dx, y: (o.y + f.y) * T + glow.dy, rad: glow.rad, alpha: glow.alpha });
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
        drawFurniture(ctx, f.item, (o.x + gx) * T, (o.y + gy) * T, t, furnColor(f), f.flip, it.w, f.s, 0, f.rot, it.h, lying(it));
        ctx.strokeStyle = canPlace(without(myRoom()!, moving!), f.item, gx, gy, f.rot) ? '#6fcf8a' : '#e06a5a';
      } else ctx.strokeStyle = '#f2c14e';
      ctx.lineWidth = 2;
      const fp = footprint(f);
      ctx.strokeRect((o.x + gx) * T + 1, (o.y + gy) * T + 1, fp.w * T - 2, fp.h * T - 2);
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
    const text = m.focus ? `${m.focus.pausedAt ? '⏸' : '📖'} ${fmt(focusEnd(m.focus, now) - now)}` : m.name;
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

    // 👏 from a housemate rising over someone studying.
    const ch = cheers.get(m.id);
    if (ch && now - ch.at < 2500) {
      ctx.font = `600 ${fs}px 'Fredoka', system-ui, sans-serif`;
      ctx.globalAlpha = 1 - (now - ch.at) / 2500;
      ctx.fillStyle = '#2b2530';
      ctx.fillText(`👏 ${ch.by}`, sx, sy - fs * 1.6 - (now - ch.at) / 40);
      ctx.globalAlpha = 1;
    }
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

// Lights you can switch on and off by clicking them in your own room.
const LIGHTS = new Set(['lamp', 'arcLamp', 'bedsideLamp', 'candles', 'neonHeart', 'fairyJar', 'floorCandle', 'snowflakeLamp', 'lanternString', 'diya', 'menorah', 'discoBall',
  'skyLantern', 'sparklers', 'garbaLamp', 'bonfire', 'eidLantern', 'crescentLamp', 'lotusLamp']);
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
  skyLantern: { dx: 8, dy: -6, rad: 26, alpha: 0.3 },
  sparklers: { dx: 8, dy: 0, rad: 20, alpha: 0.25 },
  garbaLamp: { dx: 8, dy: 6, rad: 24, alpha: 0.3 },
  bonfire: { dx: 8, dy: 4, rad: 34, alpha: 0.4 },
  eidLantern: { dx: 8, dy: 4, rad: 26, alpha: 0.3 },
  crescentLamp: { dx: 8, dy: -4, rad: 24, alpha: 0.25 },
  lotusLamp: { dx: 8, dy: 6, rad: 18, alpha: 0.25 },
};

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// ---------- UI ----------
const THEMES: Record<string, { title: string; icon: string; color: string }> = {
  focus: { title: 'Focus', icon: 'clock', color: '#cfdcf5' },
  calendar: { title: 'Calendar', icon: 'calendar', color: '#f6d6e0' },
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

const progress = (f: Focus) =>
  Math.max(0, Math.min(100, 100 * (1 - (focusEnd(f) - Date.now()) / (f.minutes * 60_000))));

function renderHud() {
  $('#coins').textContent = String(me.coins);
  $('#code').innerHTML = `<img class="coin" src="${uiIconURL('house')}" alt=""> ${houseCode}`;
  tickTimers();
}

// Timers update in place so open panels (and a half-pressed give-up button) are not re-rendered.
// While focusing, the focus deck replaces the dock until the player switches to room view.
let deckHidden = false;
function tickTimers() {
  $('#breakChip').hidden = !breakTimer;
  if (breakTimer) $('#breakTime').textContent = `☕ Break ${fmt(breakEnds - Date.now())}`;
  const f = myMember()?.focus;
  const showDeck = !!f && !deckHidden;
  $('#focusChip').hidden = !f || showDeck;
  $('#deck').hidden = !showDeck;
  $('#dock').hidden = showDeck;
  if (showDeck && openPanel) setPanel(null);
  document.querySelector('#dock [data-panel="chat"]')?.classList.toggle('unread', unread);
  if (!unread) $('#fold-chat').classList.remove('dot'); // read elsewhere: the folded card's dot goes too
  if (!f) return;
  const left = fmt(focusEnd(f) - Date.now());
  $('#timer').textContent = `${f.pausedAt ? '⏸' : '📖'} ${left}`;
  $('#pauseFocus span').textContent = f.pausedAt ? 'Resume' : 'Pause';
  $('#progress').style.width = `${progress(f)}%`;
  paintBlockText($<HTMLCanvasElement>('#deckTime'), left.padStart(5, '0'), '#2b2530', '#d9cbbb');
  $('#deckFill').style.width = `calc(${progress(f)}% - 6px)`;
  $('#deckMarker').style.left = `${progress(f)}%`;
  const buddies = members.filter((m) => m.id !== myId && m.focus && !m.focus.pausedAt).length;
  $('#deckNote').innerHTML = buddies
    ? `Earning ${Math.ceil(f.minutes * buddyMultiplier(buddies))} ${coin()} · ✨ ×${buddyMultiplier(buddies)} with ${buddies} studying`
    : `Earning ${f.minutes} ${coin()}`;
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
$('#pauseFocus').addEventListener('click', () => send({ t: myMember()?.focus?.pausedAt ? 'focus_resume' : 'focus_pause' }));
$('#hideDeck').addEventListener('click', () => { deckHidden = true; tickTimers(); });
$('#focusChip').addEventListener('click', () => { deckHidden = false; tickTimers(); });
// Done resting early: get up out of bed (or off the sofa) and carry on.
$('#skipBreak').addEventListener('click', () => { endBreak(); restUntil = 0; standUp(); tickTimers(); toast('Break ended.'); });
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

function copyCode(code = houseCode) {
  const shown = () => toast(`The house code is <b>${code}</b>`);
  if (navigator.clipboard) navigator.clipboard.writeText(code).then(() => toast(`Copied house code <b>${code}</b>!`), shown);
  else shown();
}
$('#code').addEventListener('click', () => copyCode());

const icons = new Map<string, string>();
function icon(item: string, cls = 'icon', style = 0) {
  const key = `${item}|${style}`;
  if (!icons.has(key)) {
    const it = ITEMS[item as ItemKey];
    const c = document.createElement('canvas');
    const top = OVERHANG[item] ?? 0;
    c.width = it.w * T * AV; c.height = (it.h * T + top) * AV;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.scale(AV, AV);
    drawFurniture(g, item, 0, top, 0, undefined, false, 1, style);
    icons.set(key, c.toDataURL());
  }
  return `<img class="${cls}" src="${icons.get(key)}" alt="">`;
}
const petIcon = (kind: string, cls = 'icon', coat = 0, acc?: string) => `<img class="${cls}" src="${petIconURL(kind, coat, acc)}" alt="">`;

function avatarPreview(look: Look) {
  const c = document.createElement('canvas');
  c.width = 16 * AV; c.height = 22 * AV;
  const g = c.getContext('2d')!;
  g.scale(AV, AV);
  drawAvatar(g, look, 0, 5, 0, false);
  return `<img class="preview" src="${c.toDataURL()}" alt="Your character">`;
}

const swatches = (act: string, list: string[], current: string | number | undefined, byIndex = false) =>
  `<div class="swatches">${list.map((c, i) => `<button class="swatch${(byIndex ? i : c) === current ? ' on' : ''}" style="background:${c}" data-act="${act}" data-v="${byIndex ? i : c}" aria-label="${c}"></button>`).join('')}</div>`;

// Wall pattern and floor style buttons show what they look like, in the room's own colour.
const tilePicker = (act: string, list: string[], current: string, kind: 'floor' | 'wall', color: string) =>
  `<div class="row tile-picks">${list.map((v) => `<button class="tile-pick ${v === current ? 'on' : 'off'}" data-act="${act}" data-v="${v}" aria-label="${v}" aria-pressed="${v === current}">
    <img src="${tileURL(kind, color, v)}" alt=""><small>${v}</small></button>`).join('')}</div>`;
let storeShelf = 'all'; // Decorate's storage, filtered to one shop shelf
// Focus panel extras: today's finished sessions as tomatoes, and one tap to go again with the last length and subject.
function tomatoes() {
  const n = me.sessions.filter((s) => !s.early && isoDay(new Date(s.at)) === isoDay(new Date())).length;
  return n ? `<p class="center tomatoes" title="Sessions finished today">${'🍅'.repeat(Math.min(n, 12))}${n > 12 ? ` ×${n}` : ''} <small class="hint">${n} today · long break every 4</small></p>` : '';
}
// What finishing a session now would make the streak, and the bonus that pays.
function streakLine() {
  const now = Date.now(), days = streakDays([...me.sessions, { at: now }], now, new Date().getTimezoneOffset());
  const bonus = streakBonus(days);
  return days > 1 ? `<p class="center hint">🔥 Finish one today for a ${days}-day streak${bonus ? `: +${bonus * 100}% coins` : ''}. (3 days +10%, 7 days +25%, 30 days +50%)</p>` : '';
}
function againButton() {
  const len = Number(localStorage.getItem('auralis.length'));
  return FOCUS_LENGTHS.includes(len) ? `<div class="center"><button data-act="focus" data-v="${len}">▶ Again: ${len} min${lastTag ? ` of ${esc(lastTag)}` : ''}</button></div>` : '';
}
// Character options as pictures: my character wearing each choice, the whole body or just the head.
const LOOK_LABEL: Record<string, string> = { halfup: 'half up', twintails: 'twin tails', manbun: 'man bun', sidelong: 'side long', catears: 'cat ears', round: 'round glasses', chubby: 'plus' };
const lookPics = new Map<string, string>();
function lookTiles(act: keyof Look, list: string[], look: Look, head = false) {
  const current = look[act] ?? list[0];
  return `<div class="row tile-picks">${list.map((v) => {
    const key = `${head}|${Object.values({ ...look, [act]: v }).join()}`;
    let url = lookPics.get(key);
    if (!url) {
      const c = document.createElement('canvas');
      c.width = 16 * AV; c.height = (head ? 16 : 22) * AV;
      const g = c.getContext('2d')!;
      g.scale(AV, AV);
      drawAvatar(g, { ...look, [act]: v }, 0, head ? 4 : 5, 0, false);
      url = c.toDataURL();
      lookPics.set(key, url);
    }
    return `<button class="tile-pick ${v === current ? 'on' : 'off'}" data-act="${act}" data-v="${v}" aria-label="${LOOK_LABEL[v] ?? v}" aria-pressed="${v === current}">
      <img class="${head ? 'head' : 'full'}" src="${url}" alt=""><small>${LOOK_LABEL[v] ?? v}</small></button>`;
  }).join('')}</div>`;
}
const randomLook = (): Look => ({
  skin: pickOne(SKINS), hair: pickOne(HAIRS), shirt: pickOne(SHIRTS), style: pickOne(STYLES), face: pickOne(FACES), outfit: pickOne(OUTFITS),
  body: pickOne(BODIES), acc: Math.random() < 0.5 ? 'none' : pickOne(ACCESSORIES),
});

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);

function festivalNote() {
  const on = activeEvents(), next = nextEvent();
  const now = on.length ? `${on.map((e) => `${e.emoji} <b>${e.name}</b>`).join(' · ')}: festive picks first! ` : '';
  const soon = next ? `Next up: ${next.emoji} ${next.name}, ${next.day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}.` : '';
  return `<p class="hint">${now}${soon}</p>`;
}

function shopBody(mine: Member) {
  const tab = SHOP_TABS.find((x) => x.id === shopTab) ?? SHOP_TABS[0];
  const rail = SHOP_TABS.map((x) => {
    const pic = x.items ? icon(x.items[0], 'rail-icon') : x.id === 'pets' ? petIcon('cat', 'rail-icon') : x.id === 'petacc' ? petIcon('bunny', 'rail-icon', 0, 'bow') : `<img class="rail-icon" src="${uiIconURL('house')}" alt="">`;
    return `<button class="rail-btn${x.id === tab.id ? ' on' : ''}" data-act="tab" data-v="${x.id}">${pic}<span>${x.label}</span></button>`;
  }).join('');
  let shelf = '';
  if (tab.items) {
    // The Seasonal shelf leads with the festivals on right now (their picks can come from other shelves too).
    const items = tab.id === 'seasonal' ? [...new Set([...activeEvents().flatMap((e) => e.items as ItemKey[]), ...tab.items])] : tab.items;
    shelf = items.map((k) => {
      const it = ITEMS[k];
      const looks = (it as { looks?: string[] }).looks;
      const price = discounted(it.price, me.discount);
      return `<div class="card"><b>${it.name}</b>${icon(k)}${looks ? `<small class="hint">${looks.length} styles</small>` : ''}<button data-act="buy" data-v="${k}" ${me.coins < price ? 'disabled' : ''}>${coin()} ${price !== it.price ? `<s>${it.price}</s> ` : ''}${price}</button></div>`;
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
  const note = me.discount && tab.items ? '<p class="hint">🎉 10% off your next buy, for finishing a house to-do together.</p>'
    : tab.id === 'seasonal' ? festivalNote()
    : tab.id === 'work' ? '<p class="hint">Drinks can go on any table. Your buddy studies at a desk chair behind a table.</p>'
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
      <button class="off" data-act="rotate" title="Turn it: side, back, other side, front">⟳ Rotate</button>
      <button class="off" data-act="flip" title="Mirror it to face the other way">↔ Flip</button>
      <button class="off" data-act="putaway">Put away</button><button data-act="deselect">Done</button></div>
      ${looks.length ? `<h3>Style</h3><div class="row styles">${looks.map((name, k) =>
        `<button class="${(sel.s ?? 0) === k ? 'on' : 'off'}" data-act="shape" data-v="${k}">${icon(sel.item, 'chip-icon', k)}${name}</button>`).join('')}</div>` : ''}
      ${palette.length ? `<h3>Colour</h3>${swatches('recolor', palette, sel.v ?? -1, true)}` : ''}` : '';
  const hint = placing ? `Tap a spot in your room to place the <b>${ITEMS[placing].name}</b>.`
    : sel ? 'Drag it, or tap a new spot to move it there. Keys: arrows move · R rotate · F flip · Delete put away · Esc done.'
    : 'Drag any furniture to move it, or tap it for more options.';
  const shelves = SHELVES.filter((sh) => inv.some(([k]) => (ITEMS[k as ItemKey] as { shelf?: string }).shelf === sh.id));
  if (!shelves.some((sh) => sh.id === storeShelf)) storeShelf = 'all';
  const shown = storeShelf === 'all' ? inv : inv.filter(([k]) => (ITEMS[k as ItemKey] as { shelf?: string }).shelf === storeShelf);
  const filter = shelves.length > 1 ? `<div class="row chips">${[{ id: 'all', label: `All (${inv.length})` }, ...shelves].map((sh) =>
    `<button class="small-chip ${storeShelf === sh.id ? 'on' : 'off'}" data-act="storeShelf" data-v="${sh.id}">${sh.label}</button>`).join('')}</div>` : '';
  return `${roomPicker(mine)}${selBar}<p class="hint">${hint}</p>
    ${inv.length ? `<h3>Storage</h3>${filter}<div class="grid">${shown.map(([k, n]) => `<div class="card${placing === k ? ' on' : ''}"><b>${ITEMS[k as ItemKey].name} ×${n}</b>${icon(k)}<button data-act="place" data-v="${k}">Place</button>${sellPrice(k) ? `<button class="off small" data-act="sell" data-v="${k}">Sell ${coin()} ${sellPrice(k)}</button>` : ''}</div>`).join('')}</div>` : '<p class="hint">Storage is empty. Visit the Shop!</p>'}
    <h3>Wallpaper</h3>${swatches('wallpaper', WALLPAPERS, myRoom()!.wallpaper)}
    <h3>Pattern</h3>${tilePicker('pattern', WALL_PATTERNS, myRoom()!.pattern ?? 'plain', 'wall', myRoom()!.wallpaper)}
    <h3>Floor</h3>${swatches('floor', FLOORS, myRoom()!.floor)}
    <h3>Floor style</h3>${tilePicker('floorStyle', FLOOR_STYLES, myRoom()!.floorStyle ?? 'planks', 'floor', myRoom()!.floor)}
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
  if (openPanel === 'calendar') return calendarBody();
  if (openPanel === 'focus') {
    const f = mine.focus;
    const others = members.filter((m) => m.id !== myId && m.focus && !m.focus.pausedAt);
    const together = others.length ? `<p class="center">Studying with you: <b>${others.map((m) => esc(m.name)).join(', ')}</b> ✨ ×${buddyMultiplier(others.length)} coins</p>` : '';
    return (f
      ? `<p class="hint center">Studying at your desk…</p>
         <p class="big" id="ptimer">${fmt(focusEnd(f) - Date.now())}</p>
         <div class="bar panel-bar"><i id="pbar" style="width:${progress(f)}%"></i></div>
         <p class="center">Finish to earn <b>${f.minutes}</b> ${coin()}</p>${together}
         <div class="center"><button class="danger" data-act="cancel">Give up</button></div>`
      : `${tomatoes()}${streakLine()}${againButton()}${group && group.by !== myId ? `<div class="invite">📚 <b>${esc(group.byName)}</b> is studying <b>${esc(group.tag)}</b>, ${fmt(group.endsAt - Date.now())} left.
           <button data-act="joingroup">Join them</button></div>` : ''}
         <h3>What are you studying?</h3>
         <div class="row"><input id="tag" maxlength="24" placeholder="Study" value="${esc(lastTag)}" aria-label="Subject">
           <button class="off" data-act="tagsave" title="Save as a quick pick">★ Save</button></div>
         ${subjectChips()}
         <h3>How long?</h3>
         <div class="tiles">${FOCUS_LENGTHS.map((n) => `<button class="tile" data-act="focus" data-v="${n}"><b>${n}</b><small>min</small><span class="reward">+${n} ${coin()}</span></button>`).join('')}</div>
         ${members.length > 1 ? '<label class="center invite-check"><input type="checkbox" id="groupInvite"> Invite housemates to join this session</label>' : ''}
         <p class="hint center">You'll walk to your desk and study until the timer ends. Study at the same time as housemates for +25% coins each, up to ×2.</p>${together}`) + examsHTML(mine);
  }
  if (openPanel === 'shop') return shopBody(mine);
  if (openPanel === 'decorate') return decorateBody(mine);
  if (openPanel === 'avatar') {
    return `<div class="me">${avatarPreview(mine.look)}<div class="me-info">
        <label>Name <input id="name" maxlength="16" value="${esc(mine.name)}"></label>
        <p class="hint">Total focus: <b>${mine.totalMinutes}</b> min</p>
        <div class="me-actions"><button class="off small-chip" data-act="logout">Log out</button>
        <button class="off small-chip" data-act="chimes">${chimes ? '🔔 Sounds on' : '🔕 Sounds off'}</button>
        ${installPrompt ? '<button class="off small-chip" data-act="install">📲 Install app</button>' : ''}
        <a class="hint" href="/privacy.html" target="_blank" rel="noopener">Privacy policy</a></div></div></div>
      ${mine.pets.length ? `<h3>Your pets</h3>${mine.pets.map((p, slot) => {
        const coats = PETS[p.kind as PetKey]?.coats ?? [];
        const accs = me.petAccs ?? [];
        return `<div class="pet-row"><span class="pet-chip">${petIcon(p.kind, 'chip-icon', p.coat, p.acc)}${PETS[p.kind as PetKey]?.name ?? p.kind}</span>
          <div class="swatches">${coats.map((c, k) => `<button class="swatch${(p.coat ?? 0) === k ? ' on' : ''}" style="background:${c}" data-act="petcoat" data-slot="${slot}" data-v="${k}" aria-label="Coat ${k + 1}"></button>`).join('')}</div>
          ${accs.length ? `<div class="row">${['', ...accs].map((a) => `<button class="${(p.acc ?? '') === a ? 'on' : 'off'}" data-act="petacc" data-slot="${slot}" data-v="${a}">${a ? PET_ACCS[a as keyof typeof PET_ACCS].name : 'None'}</button>`).join('')}</div>` : ''}</div>`;
      }).join('')}${(me.petAccs ?? []).length ? '' : '<p class="hint">Get bows, hats and more for your pets in Shop → Pet style.</p>'}` : ''}
      <div class="center"><button class="off" data-act="randomlook">🎲 Randomize look</button></div>
      <h3>Body type</h3>${lookTiles('body', BODIES, mine.look)}
      <h3>Skin tone</h3>${swatches('skin', SKINS, mine.look.skin)}
      <h3>Hair style</h3>${lookTiles('style', STYLES, mine.look, true)}
      <h3>Hair colour</h3>${swatches('hair', HAIRS, mine.look.hair)}
      <h3>Face</h3>${lookTiles('face', FACES, mine.look, true)}
      <h3>Accessory</h3>${lookTiles('acc', ACCESSORIES, mine.look, true)}
      <h3>Outfit</h3>${lookTiles('outfit', OUTFITS, mine.look)}
      <h3>Outfit colour</h3>${swatches('shirt', SHIRTS, mine.look.shirt)}`;
  }
  // house
  const away = !!me.home && me.home !== houseCode;
  return `${away
    ? `<p class="hint">You're visiting ${houseOwnerName ? `<b>${esc(houseOwnerName)}</b>'s house` : "a friend's house"}. Your own home keeps its code, so you can always go back.</p>
    <div class="code-big">${houseCode}</div>
    <div class="center"><button data-act="home">🏠 Go home (${me.home})</button> <button class="off" data-act="copyhome">Copy my home code</button></div>`
    : `<p class="hint">This is your home, and its code never changes. Share it: when friends join, their rooms open up into yours to make one big house.</p>
    <div class="code-big">${houseCode}</div>
    <div class="center"><button class="off" data-act="copy">Copy code</button></div>`}
    <h3>Housemates</h3>
    <ul class="members">${members.map((m) => `<li><span class="dot${m.online ? ' on' : ''}"></span>${esc(m.name)}${m.id === myId ? ' (you)' : ''}${m.focus ? '<span class="tag">📖 studying</span>' : ''}${m.id !== myId ? `<button class="off small" data-act="gift" data-v="${m.id}" title="Send ${esc(m.name)} ${GIFT_COINS} coins">🎁 ${GIFT_COINS}</button><button class="off small" data-act="noteto" data-v="${m.id}" aria-label="Leave ${esc(m.name)} a note">✉️</button>` : ''}${!away && m.id !== myId ? `<button class="off small" data-act="kick" data-v="${m.id}">Remove</button>` : ''}</li>`).join('')}</ul>
    ${noteTo && members.some((m) => m.id === noteTo) ? `<h3>Note for ${esc(members.find((m) => m.id === noteTo)!.name)}'s desk</h3>
    <div class="row"><input id="noteText" maxlength="140" placeholder="Good luck on the exam!"><button data-act="sendnote">Leave note</button></div>` : ''}
    <h3>Join a friend</h3>
    <div class="row"><input id="join" placeholder="Friend's code" maxlength="5" autocapitalize="characters"><button data-act="join">Join</button></div>
    <h3>Recent houses</h3>
    ${me.visited?.length ? `<ul class="members">${me.visited.map((h) => `<li><span class="who">${h.ownerName ? `${esc(h.ownerName)}'s house` : 'A shared house'} <span class="code-small">${h.code}</span></span>
      <span class="tag">${h.online} online</span>${h.code === houseCode ? '<span class="tag">Here</span>' : `<button class="small" data-act="rejoin" data-v="${h.code}">Join</button>`}<button class="off small" data-act="forget" data-v="${h.code}" aria-label="Forget this house">✕</button></li>`).join('')}</ul>` : '<p class="hint">Houses you visit show up here.</p>'}
    <h3>Removed from your house</h3>
    ${me.banned?.length ? `<ul class="members">${me.banned.map((b) => `<li><span class="who">${esc(b.name)}</span><button class="off small" data-act="unban" data-v="${b.id}">Allow back</button></li>`).join('')}</ul>` : '<p class="hint">Nobody. People you remove show up here, so you can let them back in.</p>'}`;
}

function renderPanel() {
  const mine = myMember();
  if (!openPanel || isSide(openPanel) || !mine) { panel.hidden = true; return; }
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
      localStorage.setItem('auralis.length', v);
      endBreak();
      send({ t: 'focus_start', minutes: Number(v), tag: lastTag || 'Study', tz: new Date().getTimezoneOffset(), group: !!panel.querySelector<HTMLInputElement>('#groupInvite')?.checked });
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
    case 'rotate': if (moving !== null) send({ t: 'turn', r: editRoom, index: moving }); break;
    case 'storeShelf': storeShelf = v; renderPanel(); break;
    case 'sell': // two taps, so nothing gets sold by a stray click
      if (!b.classList.contains('armed')) {
        b.classList.add('armed');
        b.textContent = `Tap to sell for ${sellPrice(v)}`;
        setTimeout(() => { if (b.isConnected) renderPanel(); }, 3000);
      } else {
        send({ t: 'sell', item: v });
        toast(`Sold the <b>${ITEMS[v as ItemKey].name}</b> for ${sellPrice(v)} ${coin()}.`);
      }
      break;
    case 'recolor': if (moving !== null) send({ t: 'restyle', r: editRoom, index: moving, v: Number(v) }); break;
    case 'shape': if (moving !== null) send({ t: 'shape', r: editRoom, index: moving, s: Number(v) }); break;
    case 'wallpaper': case 'floor': case 'pattern': case 'floorStyle':
      send({ t: 'room', r: editRoom, wallpaper: room.wallpaper, floor: room.floor, pattern: room.pattern, floorStyle: room.floorStyle, [b.dataset.act]: v }); break;
    case 'skin': case 'hair': case 'shirt': case 'style': case 'face': case 'outfit': case 'body': case 'acc':
      send({ t: 'look', name: mine.name, look: { ...mine.look, [b.dataset.act]: v } }); break;
    case 'randomlook': send({ t: 'look', name: mine.name, look: randomLook() }); break;
    case 'copy': copyCode(); break;
    case 'join': send({ t: 'join', code: panel.querySelector<HTMLInputElement>('#join')!.value.trim() }); break;
    case 'home': send({ t: 'leave' }); break;
    case 'copyhome': copyCode(me.home); break;
    case 'rejoin': send({ t: 'join', code: v }); break;
    case 'forget': send({ t: 'forget', code: v }); break;
    case 'unban': send({ t: 'unban', id: v }); break;
    case 'kick': // two taps, so nobody gets removed by a stray click
      if (!b.classList.contains('armed')) {
        b.classList.add('armed');
        b.textContent = 'Tap again';
        setTimeout(() => { b.classList.remove('armed'); b.textContent = 'Remove'; }, 3000);
      } else send({ t: 'kick', id: v });
      break;
    case 'logout': signOut(true); break;
    case 'chimes':
      chimes = !chimes;
      localStorage.setItem('auralis.chimes', chimes ? 'on' : 'off');
      if (chimes) chime();
      renderPanel();
      break;
    case 'gift': send({ t: 'gift', to: v }); break;
    case 'install': installPrompt?.prompt(); installPrompt = null; renderPanel(); break;
    case 'noteto': writeNote(v); break;
    case 'sendnote': {
      const text = panel.querySelector<HTMLInputElement>('#noteText')!.value.trim();
      if (text && noteTo) send({ t: 'note', to: noteTo, text });
      noteTo = null;
      renderPanel();
      break;
    }
    case 'joingroup': send({ t: 'focus_join', tz: new Date().getTimezoneOffset() }); setPanel(null); break;
    case 'examadd': {
      const subject = panel.querySelector<HTMLInputElement>('#examSubject')!.value.trim(), date = panel.querySelector<HTMLInputElement>('#examDate')!.value;
      if (subject && date) send({ t: 'exam_add', subject, date });
      else toast('Add a subject and a date.');
      break;
    }
    case 'examdel': send({ t: 'exam_del', index: Number(v) }); break;
    case 'calScope': calScope = v; renderPanel(); break;
    case 'calMonth': calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + Number(v), 1); renderPanel(); break;
    case 'calDay': calDay = v; renderPanel(); break;
    case 'caladd': {
      const text = panel.querySelector<HTMLInputElement>('#calText')!.value.trim(), time = panel.querySelector<HTMLInputElement>('#calTime')!.value;
      if (text) send({ t: 'event_add', scope: calScope, date: calDay, time, text });
      break;
    }
    case 'caldel': send({ t: 'event_del', scope: calScope, id: Number(v) }); break;
    case 'snapshot': saveSnapshot(); break;
  }
});

// Open the House panel with a note form for a housemate (also what clicking their desk does).
function writeNote(id: string) {
  noteTo = id;
  setPanel('house');
  panel.querySelector<HTMLInputElement>('#noteText')?.focus();
}

// ---------- what a click does: hover labels, cheering, exam countdowns ----------
const ACT_LABELS: Record<string, string> = { sit: 'Sit', sleep: 'Nap (5-min break)', bounce: 'Bounce', lift: 'Work out', run: 'Run', punch: 'Box', bike: 'Ride', stretch: 'Stretch' };
const USE_LABELS: Record<string, string> = {
  water: 'Water', read: 'Study here', snack: 'Snack (2-min break)', tea: 'Tea (2-min break)', primp: 'Change your look', dress: 'Change your look',
  stargaze: 'Stargaze', feed: 'Feed the pets', music: 'Play music', strum: 'Play guitar', drum: 'Drum', dj: 'DJ', warm: 'Warm up', wind: 'Wind it up',
};
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

// A housemate studying at the tile (or just under their timer bubble), if any.
function studyingAt(tx: number, ty: number) {
  return members.find((m) => {
    const a = avatars.get(m.id);
    return m.id !== myId && m.focus && m.online && a && Math.round(a.tx) === tx && (Math.round(a.ty) === ty || Math.round(a.ty) - 1 === ty);
  });
}

// What clicking this tile would do, in a few words (null: just walk there). Mirrors the click handler.
function clickLabel(tx: number, ty: number): string | null {
  if (tx < 0 || ty < 0 || tx >= grid.w || ty >= grid.h) return null;
  const studier = studyingAt(tx, ty);
  if (studier) return `Cheer ${studier.name} on 👏`;
  const wi = windowAt(tx, ty);
  if (wi >= 0 && slots[wi].m.id === myId) return slots[wi].room.curtains ? 'Open curtains' : 'Close curtains';
  const si = grid.owner[ty * grid.w + tx] ?? -1, hit = slots[si];
  const fi = hit ? furnitureAt(hit.room, tx - grid.origins[si].x, ty - grid.origins[si].y) : -1;
  if (fi < 0) return null;
  const f = hit.room.furniture[fi], it = ITEMS[f.item as ItemKey] as { table?: boolean; act?: string; use?: string };
  const sound = soundName(f.item) ? ` · 🔊 ${soundName(f.item)}` : '';
  if (f.item === 'deskCalendar') return examLabel(hit.m);
  if (hit.m.id !== myId && it.table) return `Leave ${hit.m.name} a note`;
  if (hit.m.id === myId && LIGHTS.has(f.item)) return f.off ? 'Lights on' : 'Lights off';
  if (f.item === 'giftBox') return 'Send a gift';
  if (f.item === 'whiteboard') return 'House to-dos';
  if (TVS.has(f.item)) return 'Watch together';
  if (it.act) return ACT_LABELS[it.act] ?? cap(it.act);
  if (it.use) return (USE_LABELS[it.use] ?? cap(it.use)) + sound;
  return sound ? sound.slice(3) : null;
}

const tip = document.createElement('div');
tip.id = 'tip';
tip.hidden = true;
document.body.append(tip);
let tipTimer = 0;
function showTip(text: string | null, x = 0, y = 0, ms = 0) {
  clearTimeout(tipTimer);
  tip.hidden = !text;
  if (!text) return;
  tip.textContent = text;
  tip.style.left = `${Math.min(x, innerWidth - tip.offsetWidth - 8)}px`;
  tip.style.top = `${y}px`;
  if (ms) tipTimer = window.setTimeout(() => { tip.hidden = true; }, ms);
}
canvas.addEventListener('pointerleave', () => showTip(null));

const DAY_MS = 86_400_000;
function daysTo(date: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = Math.round((Date.parse(`${date}T00:00:00`) - +today) / DAY_MS);
  return d <= 0 ? 'today!' : d === 1 ? 'tomorrow' : `in ${d} days`;
}
function examLabel(m: Member) {
  const next = m.exams?.[0];
  if (m.id === myId) return next ? `Your next exam: ${next.subject} ${daysTo(next.date)}` : 'Add an exam to count down to';
  return next ? `${m.name}'s next exam: ${next.subject} ${daysTo(next.date)}` : `${m.name} has no exams coming up`;
}
function examsHTML(mine: Member) {
  const list = mine.exams ?? [];
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  return `<h3>Exam countdown</h3>
    ${list.length ? `<ul class="members">${list.map((x, i) => `<li><span class="who"><b>${esc(x.subject)}</b> ${daysTo(x.date)}</span>
      <button class="off small" data-act="examdel" data-v="${i}" aria-label="Remove ${esc(x.subject)}">✕</button></li>`).join('')}</ul>` : ''}
    <div class="row"><input id="examSubject" maxlength="24" placeholder="Subject" aria-label="Exam subject"><input id="examDate" type="date" min="${today}" aria-label="Exam date"><button data-act="examadd">Add</button></div>
    <p class="hint">A desk calendar (Shop → Decor) shows your next exam to housemates.</p>`;
}

// ---------- calendar: the house's shared one, or my own (with my exams in it) ----------
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
let calScope = 'house';
let calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let calDay = isoDay(new Date());
function calendarBody() {
  const list: CalEvent[] = calScope === 'house' ? houseEvents
    : [...(me.events ?? []), ...(myMember()?.exams ?? []).map((x, i) => ({ id: -1 - i, date: x.date, text: `📝 ${x.subject} exam` }))];
  const y = calMonth.getFullYear(), mo = calMonth.getMonth(), today = isoDay(new Date());
  const blanks = (new Date(y, mo, 1).getDay() + 6) % 7; // weeks start on Monday
  const busy = new Set(list.map((e) => e.date));
  const cells = Array.from({ length: new Date(y, mo + 1, 0).getDate() }, (_, k) => {
    const d = isoDay(new Date(y, mo, k + 1));
    return `<button class="day${d === calDay ? ' on' : ''}${d === today ? ' today' : ''}" data-act="calDay" data-v="${d}" aria-label="${d}${busy.has(d) ? ', has plans' : ''}">${k + 1}${busy.has(d) ? '<i></i>' : ''}</button>`;
  });
  const day = list.filter((e) => e.date === calDay).sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
  const label = new Date(`${calDay}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  return `<div class="seg small">${[['house', '🏠 House'], ['me', '👤 Mine']].map(([k, l]) =>
      `<button class="${calScope === k ? 'on' : 'off'}" data-act="calScope" data-v="${k}">${l}</button>`).join('')}</div>
    <p class="hint">${calScope === 'house' ? 'Everyone in the house sees and can add to this calendar.' : 'Only you can see this one. Your exams show up here too.'}</p>
    <div class="cal-head"><button class="off small" data-act="calMonth" data-v="-1" aria-label="Previous month">‹</button>
      <b>${calMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</b>
      <button class="off small" data-act="calMonth" data-v="1" aria-label="Next month">›</button></div>
    <div class="cal">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<span>${d}</span>`).join('')}${'<span></span>'.repeat(blanks)}${cells.join('')}</div>
    <h3>${label}</h3>
    ${day.length ? `<ul class="members">${day.map((e) => `<li><span class="who">${e.time ? `<b>${e.time}</b> ` : ''}${esc(e.text)}${calScope === 'house' && e.by ? ` <small class="hint">${esc(e.by)}</small>` : ''}</span>
      ${e.id >= 0 ? `<button class="off small" data-act="caldel" data-v="${e.id}" aria-label="Delete ${esc(e.text)}">✕</button>` : ''}</li>`).join('')}</ul>` : '<p class="hint">Nothing planned.</p>'}
    <div class="row"><input id="calText" maxlength="60" placeholder="${calScope === 'house' ? 'Group study at the library' : 'Dentist'}" aria-label="What's happening">
      <input id="calTime" type="time" aria-label="Time (optional)"><button data-act="caladd">Add</button></div>`;
}

// ---------- first visit: a short tour ----------
const TOUR = [
  '👋 Welcome to Auralis! This is your room. Your little buddy wanders around and uses things on their own.',
  '🖱️ Click furniture to use it: sit, nap, work out, water plants, play music… Hover (or tap) to see what a click does.',
  '⏰ Open <b>Focus</b> in the dock to study. Your buddy sits at the desk and you earn a coin a minute.',
  '🛍️ Spend coins in the <b>Shop</b>, then arrange your room in <b>Decorate</b>.',
  "🏠 Share your house code (top right) so friends' rooms join yours. Study at the same time for up to ×2 coins!",
];
function welcome() {
  if (localStorage.getItem('auralis.tour')) return;
  let i = 0;
  const box = document.createElement('div');
  box.id = 'tour';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Quick tour');
  const show = () => {
    box.innerHTML = `<p>${TOUR[i]}</p><div class="row"><small>${i + 1} / ${TOUR.length}</small>
      <button class="off" data-t="skip">Skip</button><button data-t="next">${i === TOUR.length - 1 ? 'Got it!' : 'Next'}</button></div>`;
    box.querySelector<HTMLButtonElement>('[data-t="next"]')!.focus();
  };
  box.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLButtonElement>('button')?.dataset.t;
    if (!t) return;
    if (t === 'next' && ++i < TOUR.length) { show(); return; }
    box.remove();
    localStorage.setItem('auralis.tour', 'done');
  });
  document.body.append(box);
  show();
}

const requestBoard = () => send({ t: 'leaderboard', scope: boardScope, period: boardPeriod });

// To-dos and chat open from the dock as a card above it, one at a time.
const isSide = (name: string | null): name is SideCard => name === 'todos' || name === 'chat';
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
  document.body.classList.toggle('side-open', isSide(name));
  document.body.dataset.side = isSide(name) ? name : '';
  if (isSide(name) && folds[name]) toggleFold(name);
  if (name === 'chat') { unread = false; tickTimers(); scrollChat(); }
  renderPanel();
  document.body.classList.toggle('panel-open', !panel.hidden);
}
document.querySelectorAll<HTMLButtonElement>('#dock button').forEach((b) =>
  b.addEventListener('click', () => {
    if (b.dataset.panel === 'focus' && myMember()?.focus) { deckHidden = false; tickTimers(); return; }
    const card = b.dataset.panel!;
    setPanel(openPanel === card ? null : card);
  }));

// ---------- shared to-dos, private to-dos and chat ----------
// "Everyone" to-dos show my own tick, and are crossed off only once the whole house has ticked them.
function todoHTML(list: Todo[], empty: string) {
  return list.length
    ? list.map((t) => {
      const ticked = t.all ? !!t.ticks?.includes(myId) : t.done;
      const waiting = t.all ? members.filter((m) => !t.ticks?.includes(m.id)) : [];
      const all = t.all ? ` · 👥 ${members.length - waiting.length}/${members.length}${waiting.length && !t.done ? `, waiting on ${waiting.map((m) => esc(m.name)).join(', ')}` : ''}` : '';
      return `<li class="${t.done ? 'done' : ''}">
        <button class="check${ticked && !t.done ? ' mine' : ''}" data-todo="toggle" data-id="${t.id}" aria-label="${ticked ? 'Untick' : 'Tick'}">${ticked ? '✓' : ''}</button>
        <span class="todo-text">${esc(t.text)}${t.by || all ? `<small>${esc(t.by ?? '')}${all}</small>` : ''}</span>
        <button class="del" data-todo="del" data-id="${t.id}" aria-label="Delete">✕</button></li>`;
    }).join('')
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
    const onScreen = dmPeer === peer && document.body.dataset.side === 'chat';
    if (dmReady) countUnseen(fresh);
    if (dmReady && fresh && !onScreen) {
      pingOrHold();
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
    sel.innerHTML = ['<option value="">Everyone</option>']
      .concat(others.map((m) => `<option value="${m.id}"${dmPeer === m.id ? ' selected' : ''}>${esc(m.name)}${dmUnread[m.id] ? ` (${dmUnread[m.id]})` : ''}</option>`))
      .join('');
  }
  sel.hidden = others.length === 0;
}

function renderSide() {
  $('#todoList').innerHTML = todoScope === 'house' ? todoHTML(todos, 'Nothing yet. Add something to study!')
    : todoHTML(me.todos ?? [], 'Just for you — nobody else can see this.');
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
  $<HTMLTextAreaElement>('#chatInput').placeholder = dmPeer ? `Message ${peerName}…` : 'Say something…';
  if (dmPeer) dmUnread[dmPeer] = 0;
  if (atBottom) scrollChat();
}
const scrollChat = () => { const log = $('#chatLog'); log.scrollTop = log.scrollHeight; };

// One to-do card, switched between the house's list and my private one.
let todoScope = localStorage.getItem('auralis.todoScope') === 'me' ? 'me' : 'house';
const todoKinds = () => (todoScope === 'house' ? { add: 'todo_add', toggle: 'todo_toggle', del: 'todo_del' } : { add: 'ptodo_add', toggle: 'ptodo_toggle', del: 'ptodo_del' });
function setTodoScope(scope: string) {
  todoScope = scope;
  localStorage.setItem('auralis.todoScope', scope);
  $('#todoScope').querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
    b.className = b.dataset.scope === scope ? 'on' : 'off';
    b.setAttribute('aria-pressed', String(b.dataset.scope === scope));
  });
  sideCard.todos.classList.toggle('personal', scope === 'me');
  todoAll.hidden = scope === 'me'; // "everyone ticks it" only makes sense for the house
  $<HTMLTextAreaElement>('#todoInput').placeholder = scope === 'me' ? 'Add a private to-do…' : todoAll.getAttribute('aria-pressed') === 'true' ? 'Everyone ticks this…' : 'Add a to-do…';
  renderSide();
}
$('#todoScope').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-scope]');
  if (b) setTodoScope(b.dataset.scope!);
});
$('#todoList').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-todo]');
  if (b) send({ t: b.dataset.todo === 'toggle' ? todoKinds().toggle : todoKinds().del, id: Number(b.dataset.id) });
});
$('#todoForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const el = $<HTMLTextAreaElement>('#todoInput');
  if (el.value.trim()) send({ t: todoKinds().add, text: el.value, ...(todoScope === 'house' ? { all: todoAll.getAttribute('aria-pressed') === 'true' } : {}) });
  el.value = '';
});
// The 👥 button makes the next house to-do one that everyone has to tick.
const todoAll = $<HTMLButtonElement>('#todoAll');
todoAll.addEventListener('click', () => {
  const on = todoAll.getAttribute('aria-pressed') !== 'true';
  todoAll.setAttribute('aria-pressed', String(on));
  todoAll.className = on ? 'on' : 'off';
  $<HTMLTextAreaElement>('#todoInput').placeholder = on ? 'Everyone ticks this…' : 'Add a to-do…';
});

$('#chatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $<HTMLTextAreaElement>('#chatInput');
  const watch = /^\/watch\b\s*(.*)$/i.exec(input.value.trim());
  if (watch) { // easter egg: /watch <link> starts a watch party for the house, /watch stop ends it
    const url = watch[1];
    if (!url) toast('Type <b>/watch</b> and a YouTube, Vimeo, Twitch, Dailymotion or .mp4 link.');
    else if (url.toLowerCase() !== 'stop' && !parseVideo(url)) toast("Can't play that link. Try YouTube, Vimeo, Twitch, Dailymotion or a direct .mp4/.webm link.");
    else { send({ t: 'watch', url }); input.value = ''; }
    return;
  }
  if (input.value.trim()) send(dmPeer ? { t: 'dm', to: dmPeer, text: input.value } : { t: 'chat', text: input.value });
  input.value = '';
});
// The to-do and chat boxes grow with what's typed (CSS caps them at a few lines). Enter still sends: messages are one line.
for (const box of [$<HTMLTextAreaElement>('#todoInput'), $<HTMLTextAreaElement>('#chatInput')]) {
  const fit = () => { box.style.height = 'auto'; box.style.height = `${box.scrollHeight + 6}px`; }; // + its borders
  box.addEventListener('input', fit);
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); box.form!.requestSubmit(); }
  });
  box.form!.addEventListener('submit', () => requestAnimationFrame(fit)); // shrink back once it's been cleared
}
$('#chatPeer').addEventListener('change', () => {
  dmPeer = $<HTMLSelectElement>('#chatPeer').value || null;
  if (dmPeer) dmUnread[dmPeer] = 0;
  if (!Object.values(dmUnread).some(Boolean)) { unread = false; tickTimers(); } // caught up on everything
  renderSide();
  scrollChat();
});
$('#closeSide').addEventListener('click', () => setPanel(null));
$<HTMLImageElement>('#todoIcon').src = uiIconURL('todo');

// Each side card folds down to its header, and remembers that between visits.
type SideCard = 'todos' | 'chat';
const folds = (() => {
  try { return JSON.parse(localStorage.getItem('auralis.folds') ?? '{}') as Record<SideCard, boolean>; }
  catch { return {} as Record<SideCard, boolean>; }
})();
const sideCard: Record<SideCard, HTMLElement> = {
  todos: document.querySelector('.side-card.todos')!,

  chat: document.querySelector('.side-card.chat')!,
};
const sideLabel: Record<SideCard, string> = { todos: 'to-dos', chat: 'chat' };

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
// Bring a side card into view (unfolded, and as a sheet on phones) and put the cursor in its input.
function openSide(card: SideCard, input: string, text = '') {
  if (folds[card]) toggleFold(card);
  setPanel(card);
  if (card === 'chat') { unread = false; tickTimers(); scrollChat(); }
  const el = $<HTMLInputElement>(input);
  if (text) el.value = text;
  el.focus();
}
// Group chat you can't see right now: worth a ping.
const chatHidden = () => document.hidden || document.body.dataset.side !== 'chat';
for (const card of ['todos', 'chat'] as SideCard[]) {
  applyFold(card);
  $(`#fold-${card}`).addEventListener('click', () => toggleFold(card));
  // A folded card also opens when you tap anywhere on its header.
  sideCard[card].querySelector('.side-head')!.addEventListener('click', (e) => {
    if (folds[card] && !(e.target as HTMLElement).closest('button')) toggleFold(card);
  });
}
setTodoScope(todoScope); // the list picked last time
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
hero.width = HW * T * AV; hero.height = HH * T * AV; // 2x, so the characters' detail shows
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
  burst(((e.clientX - r.left) / r.width) * HW * T, ((e.clientY - r.top) / r.height) * HH * T, 14);
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
  c.setTransform(AV, 0, 0, AV, 0, 0);
  c.clearRect(0, 0, HW * T, HH * T);
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
buddy.width = 16 * AV; buddy.height = 22 * AV;
const pickOne = <V>(list: readonly V[]) => list[Math.floor(Math.random() * list.length)];
let buddyLook: Look = { ...heroLooks[0] };
function drawBuddy() {
  const c = buddy.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  c.setTransform(AV, 0, 0, AV, 0, 0);
  c.clearRect(0, 0, 16, 22);
  drawAvatar(c, buddyLook, 0, 5, 0, false);
  $('#buddyTags').textContent = `${buddyLook.style} · ${buddyLook.outfit} · ${buddyLook.face}`;
}
$('#shuffleBuddy').addEventListener('click', () => {
  buddyLook = randomLook();
  drawBuddy();
  buddy.classList.remove('pop');
  void buddy.offsetWidth;
  buddy.classList.add('pop');
});
drawBuddy();

if (token) connect();
else showLanding(true);
requestAnimationFrame(frame);
