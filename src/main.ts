import {
  SHELVES, buildGrid, walkable, canPlace, placeSwaps,roomSize, MAX_ROOMS, ROOM_COST, colorsFor, ITEMS, PETS, PET_ACCS, MAX_PETS, bondLevel, NOTIFY, wantsNotify, EXPAND_COST, ROOM_SIZES,
  WALLPAPERS, WALL_PATTERNS, FLOORS, FLOOR_STYLES, SKINS, HAIRS, SHIRTS, STYLES, FACES, OUTFITS, BODIES, SIZES, ACCESSORIES, FOCUS_LENGTHS, isFocusLength, SCAR_ACCS, SCAR_COLOURS,
  WALL_H, WALL, FLOOR, DOOR, BLOCKED, VOID, buddyMultiplier, focusEnd, streakDays, streakBonus, sellPrice, footprint, lying, canRotate, THIRSTY_MS, isPlant, discounted, GIFT_COINS, activeEvents, nextEvent,
  docName, attachLabel, DOC_TYPES, usernameProblem, emailProblem, passwordProblem, LIGHTS, DRINKS, caffeineMinutes,
  CLAW_COST, readyKey, pieceReadyAt, CRAFT, craftedPrice, guestBondLevel,
} from '../shared/game.js';
import { GUIDE_SECTIONS, GUIDE_START, GUIDE_TIPS, tourSteps, unseenTips } from '../shared/guide.js';
import {
  T, OVERHANG, SURFACE, AVATAR_H, avatarScale, lookKey, drawSeated, drawActing, drawSeam, drawFloor, drawWall, drawWallFace, drawWallTop, drawDoor, drawWindow, drawPainting, drawFurniture, drawAvatar, drawDeskLamp, drawGlow, drawUsing, drawSingSpotlight, drawFlames, drawClaw, skyNow, weatherNow, skyProgress, nightTint,
  coinURL, uiIconURL, AV, drawPaper, isDark, paintBlockText, drawWindow as drawWin, drawDroplet, drawHeart, tileURL, ACC_COL, ACC_COLORS, ACC_TINT, type Look,
} from './draw';
import { drawPet, petPos, petIconURL, seedOf, singPetAct } from './pets';
import { toggleSound, soundName, chime, ping, taskComplete, stopAllSounds, setVolume } from './sounds';
import { countUnseen } from './tabBadge';
import { syncWatch, type Watch } from './watch';
import { parseVideo } from '../shared/watch.js';
import { chart, streak, rangeTitle, shift, hm, RANGES } from '../shared/stats.js';
import './style.css';

type Furniture = { item: string; x: number; y: number; v?: number; s?: number; flip?: boolean; rot?: number; wateredAt?: number; off?: boolean; col?: string };
type Room = { wallpaper: string; floor: string; pattern?: string; floorStyle?: string; level?: number; curtains?: boolean; wallColor?: string; floorColor?: string; furniture: Furniture[] };
type Member = {
  id: string; name: string; look: Look; rooms: Room[]; focus: Focus | null;
  totalMinutes: number; online: boolean; pos: { x: number; y: number } | null; pets: { kind: string; name?: string; coat?: number; acc?: string; away?: boolean; follow?: boolean; bond?: number; myBond?: number; fav?: string | null; sofa?: { r: number; index: number; pats: number } }[]; fedAt?: number;
  exams?: { subject: string; date: string }[]; // YYYY-MM-DD, soonest first
  caffeineSince?: number; caffeineUntil?: number; tipsyUntil?: number; // the caffeine window rides on the member, so housemates see the flame
  presence?: Presence;
};
// all: everyone has to tick it. to: who it's for (older ones have neither). at: reminder time. mine: one of my older private to-dos.
type Todo = { id: number; text: string; done: boolean; by: string; byId?: string; all?: boolean; to?: string[]; ticks?: string[]; at?: number; mine?: boolean; repeat?: 'daily' | 'weekly' | 'monthly'; repeatUntil?: number; parentId?: number; priority?: 'low' | 'medium' | 'high' };
type Presence = { status: string; custom?: string; until?: number; at?: number } | null;
type Chat = { id: number; from: string; by: string; text: string; at: number; img?: string; replyTo?: number }; // img: key of a picture
type CalEvent = { id: number; date: string; time?: string; text: string; by?: string }; // date YYYY-MM-DD, time HH:MM
type Announcement = { id: number; text: string; by: string; byId: string; at: number };
type Focus = { minutes: number; endsAt: number; tag?: string; pausedAt?: number | null };
type Session = { at: number; minutes: number; tag: string; early?: boolean };
type Inbox = { kind: string; from?: string; by?: string; text: string; at: number; n?: number };
type Friend = { id: string; name: string; look: Look; online: boolean; focus: boolean; status: 'friend' | 'incoming' | 'outgoing'; here?: boolean; visit?: boolean; asked?: boolean; presence?: Presence };
type Me = { id: string; home?: string; visited?: { code: string; ownerName: string | null; online: number }[]; banned?: { id: string; name: string }[]; coins: number; discount?: boolean; notes?: { from: string; text: string; at: number }[]; inbox?: Inbox[]; inboxSeen?: number; tipsSeen?: string[]; events?: CalEvent[]; pushKey?: string; notify?: Record<string, boolean>; groups?: Record<string, { name: string; members: string[]; msgs: Chat[] }>; friends?: Friend[]; inventory: Record<string, number>; crafted?: { item: string; col: string }[]; sessions: Session[]; subjects: string[]; hiddenSubjects: string[]; todos: Todo[]; dm: Record<string, Chat[]>; petAccs?: string[]; watch?: Watch | null };
type Board = { scope: string; period: string; rows: { name: string; me: boolean; minutes: number; members?: number }[] };
type Avatar = { x: number; y: number; tx: number; ty: number; up: boolean; dist: number; use?: string };
type ItemKey = keyof typeof ITEMS;
type PetKey = keyof typeof PETS;

type SessionTemplate = { id: string; name: string; work: number; break: number; sessions: number };

const SESSION_TEMPLATES: SessionTemplate[] = [
  { id: 'pomodoro', name: 'Pomodoro', work: 25, break: 5, sessions: 4 },
  { id: 'deep', name: 'Deep Work', work: 50, break: 10, sessions: 2 },
  { id: 'ultradian', name: 'Ultradian', work: 90, break: 20, sessions: 2 },
  { id: 'short', name: 'Quick Sprint', work: 15, break: 5, sessions: 6 },
];

// The window the app lives in right now: this tab, or the floating picture-in-picture window it moves into.
let ui: Document = document, win: Window = window;
const $ = <E extends HTMLElement>(s: string) => ui.querySelector(s) as E;
const keyFns: ((e: KeyboardEvent) => void)[] = []; // keyboard shortcuts, attached to whichever window has the app
const onKey = (fn: (e: KeyboardEvent) => void) => { keyFns.push(fn); addEventListener('keydown', fn); };

// Global keyboard shortcuts
onKey((e) => {
  // Escape to close chat row menus
  if (e.key === 'Escape') {
    document.querySelectorAll<HTMLElement>('.chat-row-menu-panel:not([hidden])').forEach(p => p.hidden = true);
  }
});
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
let houseAnnouncements: Announcement[] = [];
let chat: Chat[] = [];
let dmPeer: string | null = null; // null = talking to the whole house
let houseCode = '';
let houseOwnerName = ''; // whose home this house is (empty for old shared houses with no owner)
let lastHouseCode = ''; // detect entering a different house to show unseen items once
let focusSeen: Set<string> | null = null; // housemates who were studying at the last state; null until the first one
let notesSeen = 0; // newest desk note already shown
let noteTo: string | null = null; // housemate I'm writing a desk note for
let finishedSession = false; // the session that just ended ran to the end (not given up): take a break
let missed = 0; // messages that arrived while I was focusing, quietly
const cheers = new Map<string, { text: string; at: number; hop?: boolean }>(); // 👏 or ✋ floating up over a player (hop: a little jump too)
const petCheers = new Map<string, { text: string; at: number }>(); // 👏 floating up over a pet cheering its owner
const petCheerCount = new Map<string, number>(); // 👏 how many times each pet cheered this session
const petPlay = new Map<string, number>(); // key -> until timestamp (pets play together after high-five)
const petNameAt = new Map<string, number>(); // key -> until: this pet's name tag is showing (names come and go)
let hoverPet: { m: Member; slot: number } | null = null; // pet being hovered
const petPaths = new Map<string, { goal: { x: number; y: number }; path: { x: number; y: number }[] }>(); // key -> the goal a pet is walking to and the tiles left
const petTrickAt = new Map<string, number>(); // key -> until: this pet is in the middle of a trick
const petSaid = new Map<string, number>(); // key -> when I last said this pet came over to me
const petGreetMe = new Map<string, number>(); // key -> when this pet came to greet me at the door (not my pet)
const petSeat = new Map<string, { x: number; y: number; until: number }>(); // key -> the chair this pet is curled up on, and when it gives up on its own
const petSunAt = new Map<string, { x: number; y: number; until: number }>(); // key -> the sunny patch it is dozing in, until then
const petActAt = new Map<string, { act: string; at: number }>(); // key -> a line-driven act the pet is performing right now
const petSofaToasted = new Set<string>(); // keys whose sofa-put-to-sleep toast has already been shown
let logonGreeted = false; // my pets have already come to say hello since I signed in
let me: Me = { id: myId, coins: 0, inventory: {}, sessions: [], subjects: [], hiddenSubjects: [], todos: [], dm: {} };
let statsTab = 'mine';
let statsRange = 'week';
let statsAnchor = Date.now();
let boardScope = 'house', boardPeriod = 'week';
let board: Board | null = null;
let grid = buildGrid([]);
let petSpots: { x: number; y: number }[][] = []; // walkable floor tiles per room, for pets to wander
let petSun: { x: number; y: number; act: string }[][] = []; // floor under each window, where a sunbath happens
let petNear: number[][] = []; // per room: the rooms its pets can walk into (through an opening or doorway)
let petRoutes = new Map<string, { x: number; y: number }[] | null>(); // pet walks between rooms, cached until the house changes

// A pet's name, or a phrase for it when its owner never gave one.
const petNameOf = (p: { kind: string; name?: string }) => p.name ?? `The ${(PETS as Record<string, { name?: string }>)[p.kind]?.name?.toLowerCase() ?? 'pet'}`;
// A spot a little way from someone, so a pet settles beside them instead of standing on them.
const spotNear = (who: { x: number; y: number }, spread: number) => ({ x: who.x + (Math.random() - 0.5) * spread, y: who.y + (Math.random() - 0.5) * spread });
// Which room a point is in: a pet walks straight at its goal, so it may only go to someone in its own room.
const roomAtPoint = (x: number, y: number) => grid.owner[Math.round(y) * grid.w + Math.round(x)];

// The nearest person who is singing, within earshot of a pet (4 tiles).
function nearestSinger(px: number, py: number) {
  let best: { x: number; y: number; d: number } | null = null;
  for (const m of members) {
    const a = avatars.get(m.id);
    if (!a || (!m.online && m.id !== myId) || a.use !== 'sing' || m.focus) continue;
    const d = Math.hypot(a.x - px, a.y - py);
    if (d <= 4 && (!best || d < best.d)) best = { x: a.x, y: a.y, d };
  }
  return best;
}

// A microphone within one tile of the singer, not counting the piece they are standing in front of:
// that extra mic is what turns a solo into a duet. A pure placement check, done while drawing.
function micNearTile(x: number, y: number) {
  const gx = Math.round(x), gy = Math.round(y);
  const si = grid.owner[gy * grid.w + gx];
  const hit = slots[si];
  if (!hit) return false;
  const o = grid.origins[si];
  return hit.room.furniture.some((f) => f.item === 'microphone'
    && Math.abs(o.x + f.x - gx) <= 1 && Math.abs(o.y + f.y - gy) <= 1
    && !(o.x + f.x === gx && o.y + f.y === gy - 1));
}
const avatars = new Map<string, Avatar>();
const bubbles = new Map<string, { text: string; until: number }>();
let lastChatId = -1;
let unread = false;
let path: { x: number; y: number }[] = [];
let openPanel: string | null = null;
let guideOpen: string | null = null; // which Guide card is expanded, or null
let shopTab = 'cozy';
let placing: ItemKey | null = null;
let placingCrafted = -1; // which handmade piece is being placed, or -1
let gifting: { kind: 'crafted'; index: number } | { kind: 'item'; item: string } | null = null; // a piece waiting for a housemate to be picked
let moving: number | null = null; // index of the furniture picked up in Decorate
let drag: { index: number; gx: number; gy: number; lx: number; ly: number; moved: boolean } | null = null;
let lastDoneTry = 0; // when we last told the server a finished session is done
let view = { ox: 0, oy: 0, scale: 1 };
// Extra scale steps (of AV) on top of the fitted view (+ zooms in, - zooms out).
// Phones start one step closer, so faces and small things are easier to see; pinch or +/- changes it.
const savedZoom = localStorage.getItem('auralis.zoom');
let zoom = Math.max(-2, Math.min(2, savedZoom !== null ? Number(savedZoom) || 0 : innerWidth < 600 ? 1 : 0));
// The deepest zoom-out step. It is two beyond the fitted room for a small house, and further when the whole house
// needs it (five rooms and up), so the whole house can be looked at at once. Recomputed as the house grows.
let minZoom = -2;
let cam: { x: number; y: number; scale: number } | null = null; // camera target in art pixels, eased
let camRoom = 0;

// ---------- network ----------
let ws: WebSocket;
const serverUrl = import.meta.env.VITE_SERVER ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
// Loading screen until the first house state arrives; after a few seconds explain the wait.
let hintTimer = 0;
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;
const baseReconnectDelay = 1500;
let reconnectTimer = 0; // the pending retry, so coming back to the tab can go now instead of waiting it out
let reconnecting = false; // true from a drop until the next state arrives: one message per outage, not one per tap
// Intents made while the socket is between lives. The server has not met us until it answers with `state`,
// so these go out when that lands, in the order they were made.
const outbox: object[] = [];
function showLoading(on: boolean) {
  $('#loading').hidden = !on;
  clearTimeout(hintTimer);
  $('#loadHint').hidden = true;
  if (on) hintTimer = window.setTimeout(() => ($('#loadHint').hidden = false), 5000);
}

function connect() {
  // One socket at a time: two of them make the server close the first, and the pair then take turns.
  if (ws?.readyState === 0 || ws?.readyState === 1) return;
  if (!houseCode) showLoading(true);
  const sock = new WebSocket(serverUrl);
  ws = sock;
  sock.onopen = () => {
    if (sock !== ws) return; // a newer connection has taken over
    reconnectAttempts = 0; // Reset on successful connection
    sock.send(JSON.stringify({ t: 'hello', token })); // a fresh socket introduces itself before anything else
  };
  sock.onclose = (e) => {
    if (sock !== ws) return; // replaced: this close says nothing about the socket that is live now
    if (!token) return; // Don't reconnect if logged out
    if (e.code === 1000) return; // Normal closure, don't reconnect
    const delay = Math.min(baseReconnectDelay * Math.pow(1.5, reconnectAttempts), 30000); // Exponential backoff, max 30s
    reconnectAttempts = Math.min(reconnectAttempts + 1, maxReconnectAttempts);
    console.log(`WebSocket disconnected (code: ${e.code}). Reconnecting in ${delay}ms... (attempt ${reconnectAttempts}/${maxReconnectAttempts})`);
    scheduleReconnect(delay);
  };
  sock.onerror = (err) => {
    console.error('WebSocket error:', err);
  };
  sock.onmessage = (e) => { if (sock === ws) onMessage(JSON.parse(e.data)); };
}

function scheduleReconnect(delay: number) {
  clearTimeout(reconnectTimer);
  reconnectTimer = window.setTimeout(() => { reconnectTimer = 0; connect(); }, delay);
}
// Back in a way the backoff cannot see — a tab that was asleep, a phone that changed network: retry now.
function retryNow() {
  if (!token || ws?.readyState === 0 || ws?.readyState === 1) return;
  clearTimeout(reconnectTimer);
  reconnectTimer = 0;
  connect();
}
addEventListener('online', retryNow);
document.addEventListener('visibilitychange', () => { if (!document.hidden) retryNow(); });

// Everything made while the socket was down, once the server has met us again.
function flushOutbox() {
  if (ws?.readyState !== 1) return;
  for (const m of outbox.splice(0)) ws.send(JSON.stringify(m));
}

// A dropped socket is usually a blink (a sleeping laptop, a host restarting) and it comes back on its own.
// Hold the intent for it rather than throwing the action away, and say what happened once per outage: toasting
// on every tap made a reconnect in progress look like the game itself being broken.
const send = (m: object) => {
  if (ws?.readyState === 1) { ws.send(JSON.stringify(m)); return true; }
  if (token) {
    outbox.push(m);
    if (outbox.length > 100) outbox.shift(); // a long outage is not worth replaying minutes of movement
    if (!reconnecting) { reconnecting = true; toast('Connection lost — reconnecting…', '', { ms: 4000 }); }
    return true;
  }
  toast('Not connected — try again in a moment.', 'error');
  return false;
};

function onMessage(m: any) {
  if (m.t === 'auth') {
    signOut(false); // token expired or revoked
    return;
  }
  if (m.t === 'state') {
    if (!houseCode) { showLoading(false); setTimeout(welcome, 800); }
    myId = m.me.id;
    reconnecting = false; // back: what was written during the gap can go now
    flushOutbox();
    // Moved house: start in my own room, drop any walk or seat that pointed at the old house's tiles,
    // and treat its chat history as already seen.
    if (m.house.code !== houseCode) { lastChatId = -1; avatars.delete(myId); path = []; seat = null; useNext = null; arrive = null; endBreak(); stopAllSounds(); }
    const wasFocusing = !!myMember()?.focus;
    const oldGrid = grid, oldSlots = slots.map((x) => `${x.m.id}:${x.ri}`);
    houseCode = m.house.code;
    houseOwnerName = m.house.ownerName ?? '';
    members = m.house.members;
    for (const member of members) for (const r of member.rooms) for (const f of r.furniture) if (!canRotate(f.item) && f.rot !== undefined) delete f.rot;
    todos = m.house.todos;
    houseEvents = m.house.events ?? [];
    houseAnnouncements = m.house.announcements ?? [];
    me = { ...m.me, sessions: m.me.sessions ?? me.sessions }; // study history only comes when it changed
    // Initialize house chat read position from server
    const houseThread = `h:${houseCode}`;
    lastChatId = (m.me.threadSeen ?? {})[houseThread] ?? -1;
    // A mute I just changed is the truth for the rest of the session: state messages that were already in
    // flight when I clicked still carry the old value, and would flip the bell back.
    const myMutes = new Map([...mutedThreads].filter(([thread]) => muteChosen.has(thread)));
    mutedThreads.clear();
    for (const [thread, until] of Object.entries(m.me.mutedThreads ?? {})) mutedThreads.set(thread, until as number);
    for (const [thread, until] of myMutes) mutedThreads.set(thread, until);
    for (const thread of muteChosen) if (!myMutes.has(thread)) mutedThreads.delete(thread);
    threadThemes.clear();
    for (const [thread, color] of Object.entries(m.me.chatThemes ?? {})) threadThemes.set(thread, color as string);
    subscribePush();
    renderNotifyPrefs();
    // Entering a (new or current) house: show unseen object types in it once per item (remembered per user).
    if (houseCode && houseCode !== lastHouseCode) {
      lastHouseCode = houseCode;
      maybeShowHouseItemsTour();
    }
    const started = joinable().filter((o) => focusSeen && !focusSeen.has(o.id));
    if (started.length && !myMember()?.focus) {
      notify(chime);
      for (const o of started) {
        toast(`📚 <b>${esc(o.name)}</b> started studying <b>${esc(o.focus!.tag ?? 'Study')}</b>. Open Focus to join in!`, 'reward');
        sysNotify('study', '📚 Study time', `${o.name} started studying ${o.focus!.tag ?? 'Study'}`);
      }
    }
    for (const o of members) { // pets greet owners who just came online, and do a happy spin when a session ends
      if (o.presence) userPresence.set(o.id, { status: o.presence.status, custom: o.presence.custom || '', until: o.presence.until || 0, at: o.presence.at || Date.now() });
      else userPresence.delete(o.id);
      if (focusSeen?.has(o.id) && !o.focus) petDone.set(o.id, Date.now());
      if (o.online && !onlineSeen.has(o.id)) petGreet.set(o.id, Date.now());
    }
    for (const f of me.friends ?? []) {
      if (f.presence) userPresence.set(f.id, { status: f.presence.status, custom: f.presence.custom || '', until: f.presence.until || 0, at: f.presence.at || Date.now() });
    }
    onlineSeen = new Set(members.filter((o) => o.online).map((o) => o.id));
    // Signing in: my own pets get up from wherever they were dozing and trot over to say hello, and so does any pet
    // in the house that likes me best.
    if (!logonGreeted) {
      logonGreeted = true;
      petGreet.set(myId, Date.now());
      for (const o of members) o.pets?.forEach((pet, slot) => {
        if (pet.fav !== myId) return;
        const k = `${o.id}:${slot}`;
        petGreetMe.set(k, Date.now());
        petSeat.delete(k); petSunAt.delete(k);
      });
      for (const k of [...petSeat.keys(), ...petSunAt.keys()]) if (k.startsWith(`${myId}:`)) { petSeat.delete(k); petSunAt.delete(k); }
    }
    focusSeen = new Set(members.filter((o) => o.focus).map((o) => o.id));
    const notes = (me.notes ?? []).filter((n) => n.at > notesSeen);
    if (notes.length) {
      notesSeen = Math.max(...notes.map((n) => n.at));
      notify(chime);
      for (const n of notes) toast(`📝 Note from <b>${esc(n.from)}</b>: ${esc(n.text)}`, 'reward');
      send({ t: 'notes_read' });
    }
    // Something I own has something to teach and I have not been shown it yet: that is the tour's cue.
    if (!tourRows.length) {
      const fresh = unseenTips(myThings(), seenTips());
      if (fresh.length) openTour(fresh.map((s) => ({ item: s.item, text: s.text })));
    }
    syncWatch((m.me?.watch ?? m.house.watch ?? null) as Watch, myId, send);
    noteNewDms();
    renderBell();
    slots = members.flatMap((mem) => mem.rooms.map((room, ri) => ({ m: mem, room, ri })));
    if (editRoom >= (myMember()?.rooms.length ?? 1)) editRoom = 0;
    grid = buildGrid(slots.map((x) => x.room));
    // Someone joined, left or grew their room, so rooms may sit elsewhere in the grid now:
    // move everyone along with the room they were standing in.
    for (const [id, a] of avatars) {
      const x = Math.round(a.tx), y = Math.round(a.ty);
      const ownerAt = (cx: number, cy: number) => (cx >= 0 && cy >= 0 && cx < oldGrid.w && cy < oldGrid.h ? oldGrid.owner[cy * oldGrid.w + cx] : -1);
      const was = [ownerAt(x, y), ownerAt(x - 1, y), ownerAt(x, y - 1)].find((k) => k >= 0) ?? -1;
      if (was < 0) continue;
      const key = oldSlots[was];
      const now = slots.findIndex((x) => `${x.m.id}:${x.ri}` === key);
      if (now < 0) { // the room was sold: whoever stood in it waits in its owner's first room
        const ownerId = key.slice(0, key.indexOf(':'));
        const home = slots.findIndex((x) => x.m.id === ownerId && x.ri === 0);
        if (home < 0) continue;
        const o = grid.origins[home], s = grid.sizes[home];
        a.x = a.tx = o.x + (s.w >> 1); a.y = a.ty = o.y + (s.h >> 1);
        if (id === myId) { path = []; seat = null; send({ t: 'pos', x: a.tx, y: a.ty }); }
        continue;
      }
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
    // Pets and their naps belong to housemates: forget the state of pets whose owner has left the house.
    const live = new Set(slots.map(({ m }) => `${m.id}:`));
    for (const map of [petFx, petNameAt, petTrickAt, petSaid, petSeat, petSunAt, petGreetMe, petActAt, petSofaToasted]) for (const k of map.keys()) if (!live.has(k.slice(0, k.indexOf(':') + 1))) map.delete(k);
    // The floor under each window is a patch of sun: the tiles a pet lies in when it sunbathes.
    petSun = slots.map((_, i) => {
      const o = grid.origins[i], s = grid.sizes[i], out: { x: number; y: number; act: string }[] = [];
      const mine = petSpots[i] ?? [];
      if (!o || !s) return out;
      for (let lx = 1; lx + 2 <= s.w - 1; lx += 6) for (let j = 0; j < 2; j++) { // windows are 2 tiles wide, every 6
        const x = o.x + lx + j, ys = mine.filter((sp) => sp.x === x).map((sp) => sp.y);
        if (ys.length) out.push({ x, y: Math.min(...ys), act: 'sun' });
      }
      return out;
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
        if (it.act) for (let y = 0; y < rows; y++) for (let x = 0; x < d.w; x++) acts.set(tileKey(o.x + f.x + x, o.y + f.y + y), { item: f.item, act: it.act, col: furnColor(f), z: o.y + f.y + d.h - 0.5 });
        if (it.pet) toys.push({ x: o.x + f.x, y: o.y + f.y, act: it.pet });
      }
      return toys;
    });
    // Rooms linked by a run of open (door) tiles: everything touching the same run is a neighbour.
    petNear = slots.map(() => []);
    petRoutes = new Map();
    const doneDoor = new Set<number>();
    for (let c = 0; c < grid.w * grid.h; c++) {
      if (grid.cell[c] !== DOOR || doneDoor.has(c)) continue;
      const rooms = new Set<number>(), stack = [c];
      doneDoor.add(c);
      while (stack.length) {
        const d = stack.pop()!, x = d % grid.w, y = Math.floor(d / grid.w);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, n = ny * grid.w + nx;
          if (grid.at(nx, ny) === DOOR && !doneDoor.has(n)) { doneDoor.add(n); stack.push(n); }
          else if (grid.at(nx, ny) !== VOID && grid.owner[n] >= 0) rooms.add(grid.owner[n]);
        }
      }
      for (const r of rooms) for (const o of rooms) if (r !== o && !petNear[r].includes(o)) petNear[r].push(o);
    }
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
      petCheerCount.clear(); // new focus session: pets get two cheers again
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
    cheers.set(m.to, { text: `👏 ${m.from}`, at: Date.now() }); // silent, even for the one studying
  } else if (m.t === 'invite') { // a housemate who's studying asks me along: one tap joins, ending when theirs does
    if (myMember()?.focus) return;
    notify(chime);
    toast(`📚 <b>${esc(m.by)}</b> invites you to study <b>${esc(m.tag)}</b> together. <u>Tap to join</u> (or open Focus)`, 'reward', {
      ms: 10_000, onClick: () => send({ t: 'focus_join', id: m.from, tz: new Date().getTimezoneOffset() }),
    });
  } else if (m.t === 'history') { // older messages of a thread, asked for by scrolling to the top
    const key = m.k === 'h' ? `h:${houseCode}` : m.k === 'g' ? `g:${m.id}` : m.id;
    olderMsgs[key] = [...m.msgs, ...threadMsgs(key === `h:${houseCode}` ? null : key)];
    if (m.msgs.length < 50) historyDone.add(key);
    historyBusy = false;
    renderSide();
  } else if (m.t === 'renamed') {
    toast(`You're now <b>${esc(m.name)}</b>. That's your username too: log in with it (or your email).`, 'reward');
  } else if (m.t === 'remind') { // a to-do I'm on just came due (missed: it came due while I was away)
    notify(chime);
    toast(`⏰ ${m.missed ? 'While you were away' : 'Reminder'}: <b>${esc(m.text)}</b>`, 'reward', { ms: 12_000, onClick: () => setPanel('todos') });
    if (!m.missed) sysNotify('todo', 'Auralis reminder', m.text);
  } else if (m.t === 'pat') {
    patAt.set(`${m.owner}:${m.slot}`, Date.now());
    petNameAt.set(`${m.owner}:${m.slot}`, Date.now() + 6000); // fussing over a pet shows its name for a moment
    const pet = m.owner === myId ? myMember()?.pets[m.slot] : members.find((o) => o.id === m.owner)?.pets[m.slot];
    // Whoever petted already has their answer: their own follow toast, or — for someone else's pet — the line
    // the server sent them from PET_LINES. Naming the patter here would only overwrite that line.
    if (pet && m.by !== myId) toast(`💕 <b>${esc(m.name)}</b> petted ${petName(pet)}.`);
    // A pet napping on a pet sofa stays put until patted twice in a row: the server clears sofa then.
    if (!pet?.sofa) {
      petSeat.delete(`${m.owner}:${m.slot}`); // a pat wakes the pet: it gets off the chair or out of the sun
      petSunAt.delete(`${m.owner}:${m.slot}`);
    }
    if (m.act) petActAt.set(`${m.owner}:${m.slot}`, { act: m.act, at: Date.now() });
  } else if (m.t === 'fetch') { // the thrower's pets run for the ball, or the room owner's if they have none
    const who = [m.by, m.owner].map((id) => members.find((o) => o.id === id)).find((o) => o?.pets.some((p) => !p.away));
    who?.pets.forEach((p, slot) => { if (!p.away) fetches.set(`${who.id}:${slot}`, { x: m.x, y: m.y, by: m.by, at: Date.now() }); });
  } else if (m.t === 'highfive') {
    const at = Date.now();
    for (const id of [m.from, m.to]) cheers.set(id, { text: '✋', at, hop: true });
    if (m.to === myId) toast(`✋ <b>${esc(m.by)}</b> high-fived you!`);
    // Pets of both players play together for 5 seconds
    if (m.petPlay) {
      const fromPets = members.find(o => o.id === m.petPlay.from)?.pets ?? [];
      const toPets = members.find(o => o.id === m.petPlay.to)?.pets ?? [];
      [...fromPets, ...toPets].forEach((p, slot) => {
        if (!p.away) {
          const owner = m.petPlay.from === m.from ? m.petPlay.from : m.petPlay.to;
          const key = `${owner}:${slot}`;
          petPlay.set(key, at + 5000); // play for 5 seconds
        }
      });
    }
  } else if (m.t === 'reward') {
    notify(chime);
    if (!m.text) {
      finishedSession = true; // a focus session paid out
      sysNotify('focus', 'Auralis', `Session complete! +${m.coins} coins`);
    }
    if (m.text) toast(esc(m.text), 'reward');
    else toast(`Session complete! +${m.coins} ${coin()}${m.buddies ? ` (×${buddyMultiplier(m.buddies)} for studying together!)` : ''}${streakBonus(m.streak) ? ` 🔥 ${m.streak}-day streak +${streakBonus(m.streak) * 100}%` : ''}${m.cheerBonus ? ` 👏 Cheers +${m.cheerBonus}` : ''}`, 'reward');
  } else if (m.t === 'crafted') { // a handmade piece was made, or arrived from a housemate
    const name = esc(ITEMS[m.piece.item as ItemKey]?.name ?? 'piece');
    if (m.from) toast(`🎁 <b>${esc(m.from)}</b> made you a ${name}! It's in your Storage.`, 'reward');
    else if (m.to) toast(`🎁 Sent to your housemate.`);
    else toast(`✨ Made a ${name}. It's in Storage.`, 'reward');
    if (openPanel === 'decorate') renderPanel();
  } else if (m.t === 'gift_item') { // a stored piece (a claw prize, say) was handed over
    const name = esc(ITEMS[m.item as ItemKey]?.name ?? 'piece');
    if (m.from) toast(`🎁 <b>${esc(m.from)}</b> gave you a ${name}! It's in your Storage.`, 'reward');
    else if (m.to) toast(`🎁 Sent the ${name} to your housemate.`);
    if (openPanel === 'decorate') renderPanel();
  } else if (m.t === 'inbox') {
    me.inbox = m.inbox;
    renderBell();
  } else if (m.t === 'todo_assigned') {
    notify(chime);
    toast(`📋 <b>${esc(m.by)}</b> assigned you: ${esc(m.text)}`, 'reward', { ms: 10_000, onClick: () => setPanel('todos') });
  } else if (m.t === 'todo_completed') {
    notify(taskComplete);
    toast(`✅ <b>${esc(m.by)}</b> completed: ${esc(m.text)}`, 'reward', { ms: 8_000, onClick: () => setPanel('todos') });
  } else if (m.t === 'friend_matches') {
    $('#friendSuggest').innerHTML = m.names.map((n: string) => `<option value="${esc(n)}">`).join('');
  } else if (m.t === 'error') {
    toast(esc(m.text), 'error');
  } else if (m.t === 'info') { // news that isn't a refusal: a plain toast
    toast(esc(m.text));
  } else if (m.t === 'typing') { // typing indicator
    if (typingThread && typingThread.thread === m.thread && m.user !== myId) {
      if (m.typing) typingThread.users.set(m.user, { name: m.name, at: Date.now() });
      else typingThread.users.delete(m.user);
      renderSide();
    }
  } else if (m.t === 'presence') { // user presence/status
    userPresence.set(m.id, { status: m.status, custom: m.custom || '', until: m.until || 0, at: m.at || Date.now() });
    renderSide();
  } else if (m.t === 'mute') { // mute thread
    if (m.until === -1) mutedThreads.delete(m.thread);
    else if (m.until === 0) mutedThreads.set(m.thread, 0);
    else mutedThreads.set(m.thread, m.until);
    syncChatList();
  } else if (m.t === 'theme') { // chat theme
    if (m.color) threadThemes.set(m.thread, m.color);
    else threadThemes.delete(m.thread);
    if (threadKey(dmPeer) === m.thread) applyThreadTheme(m.thread);
    syncChatList();
  }
}

// New chat lines pop up as speech bubbles over the speaker for a few seconds.
function receiveChat(list: Chat[]) {
  const first = lastChatId < 0;
  const thread = threadKey(null);
  const muted = isMuted(thread);
  const known = new Set(chat.map((c) => c.id));
  for (const c of list) {
    if (known.has(c.id)) continue;
    const isNew = first || c.id > lastChatId;
    if (isNew) {
      bubbles.set(c.from, { text: c.img ? `${attachLabel(c.img)} ${c.text}`.trim() : c.text, until: Date.now() + 6000 });
      if (c.from !== myId) {
        if (!muted) {
          if (chatHidden()) pingOrHold();
          countUnseen();
          if (!viewing(null)) { houseUnread++; unread = true; sysNotify('house', `${c.by} · house chat`, c.img ? attachLabel(c.img) : c.text); }
          noteUnreadChat();
        } else if (!viewing(null)) {
          houseUnread++; unread = true; noteUnreadChat(); // silent: show unread badge but no sound/notification
        }
      }
    }
    known.add(c.id);
    chat.push(c);
  }
  chat.sort((a, b) => a.id - b.id);
  lastChatId = Math.max(lastChatId, 0, ...list.map((c) => c.id));
}

// ---------- house helpers ----------
const myIndex = () => members.findIndex((m) => m.id === myId);
const myMember = () => members[myIndex()];
// Coffee and wine wear off: the window is on the member, so housemates see the same flame.
const caffeinated = (m: Member | undefined, now = Date.now()) => !!m && (m.caffeineUntil ?? 0) > now;
const tipsy = (m: Member | undefined, now = Date.now()) => !!m && (m.tipsyUntil ?? 0) > now;
// Every room in the house in grid order: each housemate's rooms, first room first.
type Slot = { m: Member; room: Room; ri: number };
let slots: Slot[] = [];
let editRoom = 0; // which of my rooms Decorate and the room shop work on
const slotOf = (id: string, ri = 0) => slots.findIndex((x) => x.m.id === id && x.ri === ri);
const mySlot = () => slotOf(myId, editRoom);
const myRoom = () => myMember()?.rooms[editRoom] ?? myMember()?.rooms[0];
const furnColor = (f: Furniture) => f.col || (f.v === undefined ? undefined : colorsFor(f.item)[f.v]);

// Tiles of furniture a character can use (chairs, sofas, gym balls, treadmills...) and what they do there.
// Tiles you can use by standing on them; z = where that piece sorts when drawn, so whoever uses it is drawn on top.
let acts = new Map<number, { item: string; act: string; col?: string; z: number }>();
let petToys: { x: number; y: number; act: string }[][] = []; // per room: cat towers, beds, balls...
// Pet reactions, keyed by owner id or `${owner}:${slot}`: all from messages and state changes every client sees.
const petGreet = new Map<string, number>(), petDone = new Map<string, number>(), patAt = new Map<string, number>();
const fetches = new Map<string, { x: number; y: number; by: string; at: number }>();
const petFx = new Map<string, { x: number; y: number; left?: boolean }>(); // where a pet is drawn (and faces) while off its usual wander
const trails = new Map<string, { pts: { x: number; y: number }[]; movedAt: number }>(); // per person: recent path, newest last
// The point `dist` tiles back along a trail from its newest end (or its oldest point, if the trail is shorter).
function trailPoint(pts: { x: number; y: number }[], dist: number) {
  for (let i = pts.length - 1; i > 0; i--) {
    const a = pts[i], b = pts[i - 1], l = Math.hypot(b.x - a.x, b.y - a.y);
    if (dist <= l) return { x: a.x + ((b.x - a.x) * dist) / l, y: a.y + ((b.y - a.y) * dist) / l };
    dist -= l;
  }
  return pts[0];
}
console.assert(JSON.stringify(trailPoint([{ x: 0, y: 0 }, { x: 0, y: 2 }, { x: 3, y: 2 }], 4)) === '{"x":0,"y":1}', 'trailPoint walks back along the path');
let petHits: { m: Member; slot: number; x: number; y: number }[] = [], onlineSeen = new Set<string>();
const petName = (p: Member['pets'][number]) => esc(p.name ?? PETS[p.kind as PetKey]?.name ?? 'Your pet');
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
// Light or dark backdrop, picked with the button by the house code; index.html applies the saved one before first paint.
const themeBtn = $<HTMLButtonElement>('#theme');
function setTheme(theme: string) {
  ui.documentElement.dataset.theme = theme;
  // Pin the browser bar colour too, instead of letting it follow the system.
  ui.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => (m.content = theme === 'dark' ? '#3b3442' : '#efe6da'));
}
if (ui.documentElement.dataset.theme) setTheme(ui.documentElement.dataset.theme);
function labelTheme() {
  const next = isDark() ? 'light' : 'dark';
  themeBtn.textContent = isDark() ? '☀️' : '🌙';
  themeBtn.title = themeBtn.ariaLabel = `Switch to ${next} mode`;
}
labelTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', labelTheme); // following the system until picked
const muteBtn = $<HTMLButtonElement>('#mute'), volMore = $<HTMLButtonElement>('#volMore'), volMenu = $<HTMLElement>('#volMenu');
const sliders = ui.querySelectorAll<HTMLInputElement>('input[data-vol]'); // master first
let muted = localStorage.getItem('auralis.muted') === 'on';
function applyVolume() {
  sliders.forEach((s) => setVolume(s.dataset.vol!, s.dataset.vol === 'all' && muted ? 0 : +s.value));
  muteBtn.textContent = muted || sliders[0].value === '0' ? '🔇' : '🔊';
  muteBtn.title = muteBtn.ariaLabel = muted ? 'Unmute' : 'Mute';
}
sliders.forEach((s) => {
  s.value = localStorage.getItem(`auralis.volume.${s.dataset.vol}`) ?? '1';
  s.addEventListener('input', () => {
    if (s.dataset.vol === 'all') { muted = false; localStorage.setItem('auralis.muted', 'off'); }
    localStorage.setItem(`auralis.volume.${s.dataset.vol}`, s.value);
    applyVolume();
  });
});
applyVolume();
muteBtn.addEventListener('click', () => {
  muted = !muted;
  localStorage.setItem('auralis.muted', muted ? 'on' : 'off');
  applyVolume();
});
volMore.addEventListener('click', () => { volMenu.hidden = !volMenu.hidden; volMore.ariaExpanded = String(!volMenu.hidden); });
$<HTMLButtonElement>('#stopAll').addEventListener('click', () => { stopAllSounds(); toast('All sounds stopped.'); });
themeBtn.addEventListener('click', () => {
  setTheme(isDark() ? 'light' : 'dark');
  try { localStorage.setItem('auralis.theme', ui.documentElement.dataset.theme!); } catch {}
  labelTheme();
});
// Do not disturb: messages during a focus session are counted, not pinged, and summed up afterwards.
const pingOrHold = () => { if (myMember()?.focus) missed++; else notify(ping); };

// Breaks: lying down in a bed you clicked (5 minutes) or a snack at the fridge (2), ending with a chime.
const NAP_MS = 5 * 60_000, SNACK_MS = 2 * 60_000;
const clawAt = new Map<string, number>(); // "member:room:index" -> when the claw was played, for the grabber animation
// A wait belongs to whoever used the piece, not to the piece: ask about me and this piece, never about the furniture.
const myReady = (f: Furniture, r: number, i: number) => pieceReadyAt(me, readyKey(r, i, f.item));
let breakTimer = 0, breakEnds = 0; // breakEnds: shown counting down in the HUD
function endBreak() { clearTimeout(breakTimer); breakTimer = 0; }
function startBreak(ms: number, text: string) {
  if (myMember()?.focus) { toast('Finish or give up your focus session before taking a break.', 'error'); return; }
  endBreak();
  toast(text);
  breakEnds = Date.now() + ms;
  breakTimer = window.setTimeout(() => {
    breakTimer = 0;
    chime(); // an alarm you set yourself, so it rings even with notification sounds off
    if (!myMember()?.focus) standUp();
    // Auto-continue session template if active
    const templateId = localStorage.getItem('auralis.template');
    const sessionNum = parseInt(localStorage.getItem('auralis.templateSession') ?? '1', 10);
    if (templateId) {
      const template = SESSION_TEMPLATES.find((t) => t.id === templateId);
      if (template && sessionNum < template.sessions) {
        const nextSession = sessionNum + 1;
        localStorage.setItem('auralis.templateSession', String(nextSession));
        const tag = localStorage.getItem('auralis.tag') || template.name;
        send({ t: 'focus_start', minutes: template.work, tag, tz: new Date().getTimezoneOffset() });
        toast(`⏰ Break's over! Starting ${template.name} session ${nextSession}/${template.sessions}.`, 'reward');
        goSit();
        return;
      } else if (template && sessionNum >= template.sessions) {
        // Template complete
        localStorage.removeItem('auralis.template');
        localStorage.removeItem('auralis.templateSession');
        toast(`🎉 ${template.name} complete! ${template.sessions} sessions done.`, 'reward');
      }
    }
    toast("⏰ Break's over! Ready for another focus session?", 'reward');
    if (!openPanel && !myMember()?.focus) setPanel('focus');
  }, ms);
}

const TVS = new Set(['tv', 'retroTV', 'mediaConsole']);
// Furniture a pet can be put to sleep on, read from the catalog itself (`pet: 'sleep'`), so the click target and
// the server's `pet_sofa` check can never drift apart. The cat tower is a perch, not a bed.
const PET_SLEEP_FURNITURE = new Set(Object.keys(ITEMS).filter((k) => (ITEMS[k as ItemKey] as { pet?: string }).pet === 'sleep'));
// Pieces a click does something special with, beyond act/use/light/sound (see tapAt).
const CLICKABLE = new Set(['petBall', ...PET_SLEEP_FURNITURE, 'deskCalendar', 'giftBox', 'whiteboard', 'clawMachine',
  'potteryWheel', 'easel', 'loom', 'craftTable', 'sewingTable']);
const STARS = ['🌠 A shooting star! Make a wish.', "✨ You spotted Orion's belt.", '🪐 Is that Saturn? It is!', '🌌 The Milky Way is out tonight.', '🌙 The moon is so bright.'];
// What some furniture does once you've walked up to it, on top of the little animation.
function afterUse(f: Furniture, owner: Member, ri: number, fi: number): (() => void) | null {
  const it = ITEMS[f.item as ItemKey] as { name: string; use?: string };
  if (isPlant(f.item)) return () => { send({ t: 'water', owner: owner.id, r: ri, index: fi }); toast(`💧 Watered the ${it.name.toLowerCase()}.`); };
  const drink = DRINKS[f.item as keyof typeof DRINKS] as { caffeine?: number; rest?: number; tipsy?: boolean } | undefined;
  if (drink) return () => {
    // The server owns the effect: caffeine for the three caffeinated drinks, a tipsy window for wine.
    // Wine also starts a break here, which is why it is sent as well as rested.
    send({ t: 'brew', owner: owner.id, r: ri, index: fi });
    if (drink.tipsy) startBreak((drink.rest ?? 2) * 60_000, `🍷 A short rest. Take two minutes.`);
    else toast(`☕ Caffeinated for ${drink.caffeine} minutes.`);
  };
  if (f.item === 'foodBowl') return () => (owner.pets.some((p) => !p.away) ? send({ t: 'feed', owner: owner.id, r: ri, index: fi }) : toast('No pets here to feed yet.'));
  if (f.item === 'giftBox') return () => { setPanel('house'); toast('Pick a housemate to send a gift.'); };
  if (f.item === 'whiteboard') return () => { setPanel('todos'); openTodoModal(); };
  if (CRAFT[f.item as keyof typeof CRAFT]) return () => {
    const ready = myReady(f, ri, fi);
    if (ready) { toast(`⏳ Ready ${fmt(ready - Date.now())} from now.`); return; }
    send({ t: 'craft', owner: owner.id, r: ri, index: fi });
  };
  if (f.item === 'clawMachine') return () => {
    const ready = myReady(f, ri, fi);
    if (ready) { toast(`🕹️ The claw is resetting. Ready ${fmt(ready - Date.now())} from now.`); return; }
    if (me.coins < CLAW_COST) { toast(`The claw costs ${coin()} ${CLAW_COST}.`, 'error'); return; }
    clawAt.set(`${owner.id}:${ri}:${fi}`, Date.now());
    send({ t: 'claw', owner: owner.id, r: ri, index: fi });
  };
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

// Pets hop over furniture too, so a crowded room never shuts them in — but they never go through a wall. A goal
// that sits on a piece (a pet bed, a chair cushion) is reached from a floor tile beside it, since the piece
// itself is blocked in the grid.
function petRoute(a: { x: number; y: number }, b: { x: number; y: number }) {
  const k = `${a.x},${a.y}>${b.x},${b.y}`;
  if (!petRoutes.has(k)) {
    const bx = Math.round(b.x), by = Math.round(b.y), onPiece = !walkable(grid.at(bx, by));
    const done = onPiece
      ? (x: number, y: number) => (x === bx && y === by) || Math.abs(x - bx) + Math.abs(y - by) === 1
      : (x: number, y: number) => x === bx && y === by;
    petRoutes.set(k, bfs({ x: Math.round(a.x), y: Math.round(a.y) }, done, (x, y) => walkable(grid.at(x, y))));
  }
  return petRoutes.get(k)!;
}

// The straight line between two points, tile by tile. Without a route the pet may only walk this line across open
// floor; the last tile is a piece of furniture it is allowed to step onto, so that one is only checked when it is not.
function petLineClear(a: { x: number; y: number }, b: { x: number; y: number }, ontoPiece: boolean) {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
  for (let i = 1; i < steps + (ontoPiece ? 0 : 1); i++) {
    const t = i / steps;
    if (!walkable(grid.at(Math.round(a.x + (b.x - a.x) * t), Math.round(a.y + (b.y - a.y) * t)))) return false;
  }
  return true;
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
    if (!tiles.length) { toast('Someone is already using that.', 'error'); return true; }
    const p = bfs(start, (cx, cy) => pass(cx, cy) && tiles.some((u) => Math.abs(cx - u.x) + Math.abs(cy - u.y) === 1), pass)
      ?? bfs(start, beside, pass); // then climb on from wherever there's room
    if (!p) { toast("You can't reach that from here.", 'error'); return true; }
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
  if (!p) { toast("You can't reach that from here.", 'error'); return true; }
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

// Light pouring in through the windows, widening as it falls ( / \ ): sunny white by day, golden at dusk, faint
// moonlight at night, dimmer when it isn't clear, none behind closed curtains. Top-row rooms have their windows on
// the back wall; any room whose front wall faces outside gets the same light coming up from the front.
// The pools are soft and low-contrast: they tint the floor rather than drawing a bright wedge, so they blend into the room.
const BEAM: Record<string, [string, number]> = { day: ['255,246,220', 0.10], dusk: ['255,190,120', 0.09], night: ['175,195,255', 0.05] };
// Window light falls a little shorter than it used to, so a sunlit room doesn't wash out the whole floor.
const BEAM_LEN = 0.78;
function drawWindowLight(sky: string, weather: string, onScreen: (x: number, y: number, w: number, h: number) => boolean) {
  const [rgb, a0] = BEAM[sky], a = weather === 'clear' ? a0 : a0 * 0.5;
  const beam = (xl: number, xr: number, y: number, dir: 1 | -1, len: number) => {
    const end = y + dir * len, spread = len * 0.4, g = ctx.createLinearGradient(0, y, 0, end);
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(0.5, `rgba(${rgb},${a * 0.5})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(xl, y); ctx.lineTo(xr, y); ctx.lineTo(xr + spread, end); ctx.lineTo(xl - spread, end);
    ctx.closePath();
    ctx.fill();
  };
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  slots.forEach(({ m, ri, room }, i) => {
    const o = grid.origins[i], s = grid.sizes[i];
    if (curtainsOf(m, ri, room) || !onScreen(o.x, o.y, s.w, s.h)) return;
    const front = o.y + s.h; // the wall row in front of the room
    for (let lx = 1; lx + 2 <= s.w - 1; lx += 6) { // same spacing as the windows drawn on the back wall
      const xl = (o.x + lx) * T + 7, xr = (o.x + lx) * T + 25; // the glass
      if (i < grid.cols) beam(xl, xr, o.y * T, 1, Math.min(5, s.h) * T * BEAM_LEN);
      if (frontWindow(o.x + lx, front)) beam(xl, xr, front * T, -1, Math.min(3, s.h) * T * BEAM_LEN);
    }
  });
  ctx.restore();
}

// Curtains I closed (or opened) in other people's rooms: only on my screen, remembered in this browser.
const myCurtains: Record<string, boolean> = (() => { try { return JSON.parse(localStorage.getItem('auralis.curtains') ?? '{}'); } catch { return {}; } })();
const curtainsOf = (m: Member, ri: number, room: Room) => myCurtains[`${m.id}:${ri}`] ?? !!room.curtains;
// A room's front wall has a (hidden) window at x when that stretch of wall faces outside.
const frontWindow = (x: number, front: number) => grid.at(x, front) === WALL && !grid.at(x, front + 1) && grid.at(x + 1, front) === WALL;
// Which room has a window at this tile, or -1: on the back wall of a top-row room, or a hidden one in a front wall
// facing outside (one every 6 tiles along either). Clicking one opens or closes that room's curtains.
function windowAt(tx: number, ty: number) {
  return slots.findIndex((_, i) => {
    const o = grid.origins[i], s = grid.sizes[i], lx = tx - o.x, k = (lx - 1) % 6;
    if (lx < 1 || k >= 2 || lx - k + 2 > s.w - 1) return false;
    return (i < grid.cols && ty >= o.y - WALL_H && ty < o.y) || (ty === o.y + s.h && frontWindow(o.x + lx - k, ty));
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

// Everything under a tile, topmost first: a tabletop thing sits above the solid piece it stands on, so it wins the click.
// Decorate walks this list to reach the piece underneath without moving anything.
function furnitureHits(room: Room, lx: number, ly: number) {
  const rank = (f: Furniture) => { const it = ITEMS[f.item as ItemKey] as { top?: boolean; solid?: boolean } | undefined; return it?.top ? 2 : it?.solid ? 1 : 0; };
  return room.furniture
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => {
      const d = ITEMS[f.item as ItemKey] && footprint(f);
      return d && lx >= f.x && lx < f.x + d.w && ly >= f.y && ly < f.y + d.h;
    })
    .sort((a, b) => rank(b.f) - rank(a.f));
}
// What a click uses: the topmost thing there that actually does something, falling through a mug that does nothing to the
// table under it.
const isInteractive = (f: Furniture) => {
  const it = ITEMS[f.item as ItemKey] as { act?: string; use?: string } | undefined;
  return !!it && (!!it.act || !!it.use || LIGHTS.has(f.item) || CLICKABLE.has(f.item) || !!soundName(f.item));
};
function furnitureAt(room: Room, lx: number, ly: number) {
  const hits = furnitureHits(room, lx, ly);
  return (hits.find(({ f }) => isInteractive(f)) ?? hits[0])?.i ?? -1;
}
// Decorate picking: tap the same tile again to step down through what's stacked there, so a counter stays reachable
// under the machine on it.
let pickKey = '', pickDepth = 0, pickWhen = 0;
function pickAt(room: Room, lx: number, ly: number) {
  const key = `${lx},${ly}`, now = Date.now();
  pickDepth = key === pickKey && now - pickWhen < 3000 ? pickDepth + 1 : 0;
  pickKey = key; pickWhen = now;
  const hits = furnitureHits(room, lx, ly);
  if (pickDepth >= hits.length) pickDepth = 0;
  return { i: hits[pickDepth]?.i ?? -1, depth: pickDepth, count: hits.length };
}

const without = (room: Room, index: number) => ({ ...room, furniture: room.furniture.filter((_, k) => k !== index) });

// ---------- input ----------
function tileAt(e: PointerEvent) {
  const dpr = win.devicePixelRatio || 1;
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
  const k = (win.devicePixelRatio || 1) / view.scale; // screen pixels to art pixels
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
    const hit = placing ? { i: -1, depth: 0, count: 0 } : pickAt(myRoom()!, lx, ly);
    const i = hit.i;
    if (placing) {
      // A handmade piece is one instance and is never swapped away, so it only goes where it fits.
      const fits = placingCrafted >= 0 ? canPlace(myRoom()!, placing, lx, ly) : !!placeSwaps(myRoom()!, placing, lx, ly);
      if (fits) {
        send({ t: 'place', r: editRoom, item: placing, x: lx, y: ly, ...(placingCrafted >= 0 ? { crafted: true } : {}) });
        placing = null; placingCrafted = -1;
      }
      else toast('That spot is taken or outside your room.', 'error');
    } else if (i >= 0) {
      // Grab it: drag to move, or just tap to select it.
      const f = myRoom()!.furniture[i];
      moving = i;
      drag = { index: i, gx: lx - f.x, gy: ly - f.y, lx: f.x, ly: f.y, moved: false };
      canvas.setPointerCapture(e.pointerId);
      if (hit.count > 1) toast(hit.depth ? `${ITEMS[f.item as ItemKey].name} selected. Tap again for the next one down.` : `${ITEMS[f.item as ItemKey].name} is on top. Tap again to reach what's under it.`);
    } else if (moving !== null) {
      const f = myRoom()!.furniture[moving];
      if (f && canPlace(without(myRoom()!, moving), f.item, lx, ly, f.rot)) send({ t: 'move', r: editRoom, index: moving, x: lx, y: ly });
      else toast("It doesn't fit there.", 'error');
    }
    renderPanel();
    return;
  }
  if (e.pointerType === 'touch') showTip(clickLabel(tx, ty), e.clientX, e.clientY - 40, 1200); // fingers can't hover
  // Clicking a window in one of your rooms opens or closes its curtains, for everyone.
  const wi = windowAt(tx, ty);
  if (wi >= 0) {
    const { m, ri, room } = slots[wi];
    if (m.id === myId) send({ t: 'curtains', r: ri });
    else { myCurtains[`${m.id}:${ri}`] = !curtainsOf(m, ri, room); localStorage.setItem('auralis.curtains', JSON.stringify(myCurtains)); }
    return;
  }
  const si = grid.owner[ty * grid.w + tx], hit = slots[si];
  const fi = hit ? furnitureAt(hit.room, tx - grid.origins[si].x, ty - grid.origins[si].y) : -1;
  const clicked = fi >= 0 ? hit.room.furniture[fi] : undefined;
  if (clicked?.item === 'petBall') { send({ t: 'fetch', owner: hit.m.id, x: grid.origins[si].x + clicked.x, y: grid.origins[si].y + clicked.y }); return; }
  if (clicked && PET_SLEEP_FURNITURE.has(clicked.item)) {
    // Pet positions are grid tiles and `clicked` is room-local: in any room but the first, the two never met, so a
    // pet you could see curled up on its bed could not be patted awake through it.
    const co = grid.origins[si];
    const petOnFurniture = petHits.find((h) => Math.abs(h.x - (co.x + clicked.x)) < 0.4 && Math.abs(h.y - (co.y + clicked.y)) < 0.4);
    if (petOnFurniture) {
      send({ t: 'pat', owner: petOnFurniture.m.id, slot: petOnFurniture.slot });
      const p = petOnFurniture.m.pets[petOnFurniture.slot];
      if (petOnFurniture.m.id === myId && !mine?.focus) {
        send({ t: 'pet_style', slot: petOnFurniture.slot, follow: !p.follow });
        toast(p.follow ? `🐾 ${petName(p)} went back to wandering.` : `🐾 ${petName(p)} is following you!`);
      } else if (petOnFurniture.m.id === myId) toast(`💕 You petted ${petName(p)}.`);
    } else {
      send({ t: 'pet_sofa', owner: hit.m.id, r: hit.ri, index: fi });
    }
    return;
  }
  // A housemate: cheer them on while they study. Idle while I study: invite them along. Both idle: a high five.
  // A pet: pat it (everyone sees the hearts). My own also starts or stops following me, if I'm not studying.
  const pet = petHits.find((h) => Math.abs(h.x - tx) < 0.75 && Math.abs(h.y - ty) < 0.75);
  if (pet) {
    send({ t: 'pat', owner: pet.m.id, slot: pet.slot });
    const p = pet.m.pets[pet.slot];
    if (pet.m.id === myId && !mine?.focus) {
      send({ t: 'pet_style', slot: pet.slot, follow: !p.follow });
      toast(p.follow ? `🐾 ${petName(p)} went back to wandering.` : `🐾 ${petName(p)} is following you!`);
    } else if (pet.m.id === myId) toast(`💕 You petted ${petName(p)}.`);
    return;
  }
  const friend = friendAt(tx, ty), focus = mine?.focus;
  if (friend) {
    if (friend.focus) send({ t: 'cheer', to: friend.id });
    else if (focus?.pausedAt) toast(`Resume your session first, then invite ${esc(friend.name)}.`);
    else send({ t: focus ? 'invite' : 'highfive', to: friend.id });
    return;
  }
  // Clicking something that makes a sound (record player, fireplace, clocks) in any room you can see toggles it, just for you.
  if (clicked && soundName(clicked.item)) {
    const what = soundName(clicked.item);
    toast(toggleSound(clicked.item) ? `🔊 ${what} on. Click the ${ITEMS[clicked.item as ItemKey].name.toLowerCase()} again to stop.` : `${what} off.`);
  }
  if (clicked?.item === 'deskCalendar') { if (hit.m.id === myId) setPanel('calendar'); else toast(esc(examLabel(hit.m))); return; }
  // A housemate's desk: leave them a note. A lamp in my own room: switch it on or off.
  if (clicked && hit.m.id !== myId && (ITEMS[clicked.item as ItemKey] as { table?: boolean }).table) { writeNote(hit.m.id); return; }
  // Anyone in the house can reach any room's lamps: click one to switch it on or off.
  if (clicked && members.some((m) => m.id === hit.m.id) && LIGHTS.has(clicked.item)) {
    send({ t: 'light', owner: hit.m.id, r: hit.ri, index: fi });
    toast(`💡 ${ITEMS[clicked.item as ItemKey].name} ${clicked.off ? 'on' : 'off'}.`);
    return;
  }
  if (clicked && interact(si, fi)) return;
  walkTo(tx, ty);
}

// Zoom: the buttons, Ctrl/Cmd + wheel, or + and - on the keyboard.
const zoomInBtn = $<HTMLButtonElement>('#zoomIn'), zoomOutBtn = $<HTMLButtonElement>('#zoomOut');
function setZoom(next: number) {
  zoom = Math.max(minZoom, Math.min(2, next)); // minZoom is deeper in a big house, so the whole house is reachable
  localStorage.setItem('auralis.zoom', String(zoom));
  zoomInBtn.disabled = zoom >= 2;
  zoomOutBtn.disabled = zoom <= minZoom;
}
zoomInBtn.addEventListener('click', () => setZoom(zoom + 1));
zoomOutBtn.addEventListener('click', () => setZoom(zoom - 1));
canvas.addEventListener('wheel', (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  setZoom(zoom + (e.deltaY < 0 ? 1 : -1));
}, { passive: false });
onKey((e) => {
  if ((e.target as HTMLElement).closest('input, textarea, select')) return;
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
      // Track hovered pet for name display
      const pet = petHits.find((h) => Math.abs(h.x - tx) < 0.75 && Math.abs(h.y - ty) < 0.75);
      hoverPet = pet ? { m: pet.m, slot: pet.slot } : null;
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
    else toast("It doesn't fit there.", 'error');
  }
  drag = null;
});

// Decorate shortcuts for the selected piece: arrows nudge it a tile, R rotates, F flips, Delete puts it away, Esc is done.
onKey((e) => {
  if (openPanel !== 'decorate' || moving === null || (e.target as HTMLElement).closest('input, textarea, select')) return;
  const f = myRoom()?.furniture[moving];
  if (!f) return;
  const step = ({ ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] } as Record<string, number[]>)[e.key];
  const act = { ...(canRotate(f.item) ? { r: 'rotate' } : {}), f: 'flip', Delete: 'putaway', Backspace: 'putaway', Escape: 'deselect' }[e.key.length === 1 ? e.key.toLowerCase() : e.key];
  if (step) {
    if (canPlace(without(myRoom()!, moving), f.item, f.x + step[0], f.y + step[1], f.rot)) send({ t: 'move', r: editRoom, index: moving, x: f.x + step[0], y: f.y + step[1] });
  } else if (act) panel.querySelector<HTMLButtonElement>(`button[data-act="${act}"]`)?.click(); // same as pressing the button
  else return;
  e.preventDefault();
  e.stopImmediatePropagation(); // the arrows move the piece, not the avatar
});
onKey((e) => {
  const a = avatars.get(myId);
  const d = ({ ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] } as Record<string, number[]>)[e.key];
  if (!a || !d || (e.target as HTMLElement).closest('input, textarea, select')) return;
  const n = path[path.length - 1] ?? { x: a.tx, y: a.ty };
  if (walkable(grid.at(n.x + d[0], n.y + d[1]))) path = [...path.slice(0, 1), { x: n.x + d[0], y: n.y + d[1] }];
  quietUntil = Date.now() + 2500; // I'm steering: no wandering on top of it
});

// ---------- loop ----------
let last = performance.now();
function tick(t: number) {
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  step(dt);
  render(t, dt);
}
let loopGen = 0;
function startLoop() { // a new loop on the current window; the old one stops at its next frame
  const gen = ++loopGen;
  const frame = () => { if (gen !== loopGen) return; tick(performance.now()); win.requestAnimationFrame(frame); };
  win.requestAnimationFrame(frame);
}

function step(dt: number) {
  const speed = caffeinated(myMember()) ? 4.2 : 3.2; // tiles per second; coffee makes you quick
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
}

// Framing needs the size of the chrome around the room, but reading offsetHeight/offsetWidth forces layout.
// Measure only when that chrome can have changed (a sheet opened, the chat grew, a card folded), not every frame.
const deckEl = $<HTMLElement>('#deck'), dockEl = $<HTMLElement>('#dock'), sideEl = $<HTMLElement>('#side');
let chromeRev = 0;
const chromeDirty = () => { chromeRev++; };
let chrome = { key: '', below: 0, right: 0 };
function measureChrome(dpr: number) {
  const wide = win.innerWidth >= 900;
  const sheet = !wide ? (!panel.hidden ? panel : ui.body.classList.contains('side-open') ? sideEl : null) : null;
  const below = !deckEl.hidden ? deckEl.offsetHeight + (wide ? 24 : 0)
    : sheet ? sheet.offsetHeight + dockEl.offsetHeight + 40 : dockEl.offsetHeight + 24;
  const column = !panel.hidden ? panel : ui.body.classList.contains('side-open') ? sideEl : null; // wide screens: a column on the right
  return { below, right: wide && column ? (column.offsetWidth + 20) * dpr : 0 };
}

function render(t: number, dt: number) {
  const dpr = win.devicePixelRatio || 1;
  const cw = Math.round(win.innerWidth * dpr), ch = Math.round(win.innerHeight * dpr);
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw; canvas.height = ch;
    // Match CSS size to whole device pixels so the browser never resamples the canvas.
    canvas.style.width = `${cw / dpr}px`; canvas.style.height = `${ch / dpr}px`;
  }
  ctx.imageSmoothingEnabled = false; // sprites are pre-baked canvases; smoothing would blur them when scaled up
  const me_ = avatars.get(myId) ?? { x: 0, y: 0 };
  const now = Date.now();
  // Fit and centre my room in the part of the screen not covered by the HUD, dock, deck, side bar or panel.
  const chromeKey = `${win.innerWidth}x${win.innerHeight}@${dpr}|${chromeRev}`;
  if (chrome.key !== chromeKey) chrome = { key: chromeKey, ...measureChrome(dpr) };
  const coverTop = 70 * dpr, coverBottom = chrome.below * dpr, coverRight = chrome.right;
  const coverLeft = 0;
  const aw = cw - coverRight - coverLeft, ah = Math.max(ch * 0.3, ch - coverTop - coverBottom);
  // Frame the room I'm standing in (keep the last one while I'm in an opening or doorway).
  const here = grid.owner[Math.round(me_.y) * grid.w + Math.round(me_.x)];
  if (here >= 0) camRoom = here;
  const ri = Math.min(camRoom, grid.origins.length - 1);
  const o = grid.origins[ri] ?? { x: 1, y: WALL_H }, size = grid.sizes[ri] ?? roomSize(undefined);
  const roomW = (size.w + 2) * T, roomH = (size.h + WALL_H + 1) * T; // room plus its walls
  const fit = Math.max(1, Math.floor(Math.min(aw / (roomW + T), ah / (roomH + T / 2))));
  // How far out the whole house has to be to fit on screen, so the minus button can reach it: a big house is wider
  // than any one room, so its deepest step is further out than a small one's.
  const houseFit = Math.floor(Math.min(aw / (grid.w * T), ah / (grid.h * T)));
  const steps = Math.floor(fit / AV), deep = houseFit >= AV ? Math.floor(houseFit / AV) - steps : -steps;
  const minZoomNow = Math.min(-2, deep);
  // Characters and redrawn furniture have AV times the detail, so the scale stays a multiple of AV — except in a
  // house too big to fit even at that, which drops to whole art pixels (still crisp, no smoothing) instead.
  const deepest = houseFit >= AV ? AV : 1;
  if (minZoomNow !== minZoom) {
    minZoom = minZoomNow;
    if (zoom < minZoom) { zoom = minZoom; localStorage.setItem('auralis.zoom', String(zoom)); }
    zoomOutBtn.disabled = zoom <= minZoom;
  }
  const scale = Math.min(5 * AV, Math.max(deepest, (steps + Math.min(2, Math.max(minZoom, zoom))) * AV));
  const vw = aw / scale, vh = ah / scale;
  // Centre the whole room when it fits on screen; otherwise follow the player.
  const fits = roomW <= vw && roomH <= vh;
  // When following the player, stop at the house edges so the view never shows empty paper beyond them.
  const follow = (p: number, view: number, size: number) => (size + T <= view ? size / 2 : Math.max(view / 2 - T / 2, Math.min(size - view / 2 + T / 2, p)));
  const bx = fits ? (o.x - 1) * T + roomW / 2 : me_.x * T + 8, by = fits ? (o.y - WALL_H) * T + roomH / 2 : me_.y * T + 8;
  const tx = follow(bx + camPan.x, vw, grid.w * T), ty = follow(by + camPan.y, vh, grid.h * T);
  camPan.x = tx - bx; camPan.y = ty - by; // dragging past the edge of the house doesn't pile up
  if (!cam || cam.scale !== scale) cam = { x: tx, y: ty, scale };
  const ease = pan?.moved ? 1 : 1 - Math.exp(-dt * 8); // glide when moving to another room (same pace at any frame rate); stick to the finger while dragging
  cam.x += (tx - cam.x) * ease;
  cam.y += (ty - cam.y) * ease;
  // Snapped to screen pixels, not art pixels: tiles stay crisp and a glide moves one screen pixel at a time, not in steps.
  view = { scale, ox: Math.round((coverLeft / scale + vw / 2 - cam.x) * scale) / scale, oy: Math.round((coverTop / scale + vh / 2 - cam.y) * scale) / scale };
  // Only what's on screen gets drawn: a tile around it, and a few rows below for tall furniture reaching up into view.
  const X0 = Math.max(0, Math.floor(-view.ox / T) - 1), X1 = Math.min(grid.w, Math.ceil((cw / scale - view.ox) / T) + 1);
  const Y0 = Math.max(0, Math.floor(-view.oy / T) - 1), Y1 = Math.min(grid.h, Math.ceil((ch / scale - view.oy) / T) + 4);
  const onScreen = (x: number, y: number, w = 1, h = 1) => x + w >= X0 && x <= X1 && y + h >= Y0 && y <= Y1;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawPaper(ctx, cw, ch, scale);
  ctx.setTransform(scale, 0, 0, scale, view.ox * scale, view.oy * scale);

  // Soft drop shadow under the whole house, like a diorama on a table.
  ctx.fillStyle = 'rgba(43,37,48,0.13)';
  for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) if (grid.at(x, y)) ctx.fillRect(x * T + 5, y * T + 7, T, T);

  for (let y = Y0; y < Y1; y++) {
    for (let x = X0; x < X1; x++) {
      const k = grid.at(x, y);
      const px = x * T, py = y * T;
      const room = (dy: number) => slots[grid.owner[(y + dy) * grid.w + x]]?.room;
      if (k === FLOOR || k === BLOCKED) {
        const r = room(0);
        drawFloor(ctx, px, py, r?.floorColor ?? r?.floor ?? FLOORS[0], x, y, r?.floorStyle);
      } else if (k === DOOR) {
        // An opening shows the floors on either side meeting in the middle. Between rows it's a few tiles deep:
        // each tile takes the nearer room's floor, and the middle one is split.
        const at = (dx: number, dy: number) => slots[grid.owner[(y + dy) * grid.w + x + dx]]?.room;
        const l = at(-1, 0), rr = at(1, 0);
        let du = 1, dd = 1;
        while (grid.at(x, y - du) === DOOR) du++;
        while (grid.at(x, y + dd) === DOOR) dd++;
        const u = at(0, -du), d = at(0, dd);
        if (l && rr) drawSeam(ctx, px, py, x, y, [l, rr, l, rr]);
        else if (u && d) drawSeam(ctx, px, py, x, y, du < dd ? [u, u, u, u] : dd < du ? [d, d, d, d] : [u, u, d, d]);
        else drawDoor(ctx, px, py, x, y);
      }
      else if (k === WALL) {
        // Two-tile back wall: the row touching the floor gets the panel strip, the row above it the crown.
        const paper = (cx: number) => {
          const own = (dy: number) => (y + dy < grid.h ? slots[grid.owner[(y + dy) * grid.w + cx]]?.room : undefined);
          const below = own(1), below2 = grid.at(x, y + 1) === WALL ? own(2) : undefined;
          if (below) drawWallFace(ctx, px, py, below.wallColor ?? below.wallpaper, below.pattern);
          else if (below2) drawWallTop(ctx, px, py, below2.wallColor ?? below2.wallpaper, below2.pattern);
          return !!(below || below2);
        };
        // Over the opening between side-by-side rooms, each half carries on its own room's wallpaper.
        const fy = grid.at(x, y + 1) === WALL ? y + 2 : y + 1;
        if (grid.at(x, fy) === DOOR && grid.owner[fy * grid.w + x - 1] >= 0 && grid.owner[fy * grid.w + x + 1] >= 0) {
          for (const side of [0, 1]) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(px + side * 8, py, 8, T);
            ctx.clip();
            paper(x + (side ? 1 : -1));
            ctx.restore();
          }
        } else if (!paper(x)) drawWall(ctx, px, py);
      }
    }
  }

  // One crisp outline around the outside of the house, and soft shade where walls meet the floor.
  for (let y = Y0; y < Y1; y++) {
    for (let x = X0; x < X1; x++) {
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
  const progress = skyProgress();
  const sky = skyNow(), weather = weatherNow();
  const dark = sky !== 'day';
  const tint = nightTint(progress);
  // Top-row rooms get windows to the outside (more as the room grows); lower rooms a painting on the corner wall left by the opening above.
  slots.forEach(({ m, ri, room }, i) => {
    const o = grid.origins[i], s = grid.sizes[i];
    const wy = (o.y - WALL_H) * T;
    if (!onScreen(o.x, o.y - WALL_H, s.w, WALL_H)) return;
    if (i < grid.cols) for (let lx = 1; lx + 2 <= s.w - 1; lx += 6) drawWindow(ctx, (o.x + lx) * T, wy, sky, curtainsOf(m, ri, room), weather, t);
    else if (grid.at(o.x, o.y - 1) === WALL && grid.at(o.x + 1, o.y - 1) === WALL) drawPainting(ctx, o.x * T + 6, wy + 8);
  });

  // Whose room is whose: a soft name on the floor in the middle of each room (under rugs and furniture),
  // once the house has more than one person in it.
  if (members.length > 1) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = "700 11px 'Fredoka', system-ui, sans-serif";
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(43,37,48,0.25)';
    ctx.fillStyle = 'rgba(255,250,243,0.7)';
    slots.forEach(({ m, ri }, i) => {
      const o = grid.origins[i], s = grid.sizes[i];
      if (!o || !s || !onScreen(o.x, o.y, s.w, s.h)) return;
      const text = `${m.name}'s room${ri ? ` ${ri + 1}` : ''}`, cx = (o.x + s.w / 2) * T, cy = (o.y + s.h / 2) * T; // the floor's middle
      ctx.strokeText(text, cx, cy);
      ctx.fillText(text, cx, cy);
    });
    ctx.restore();
  }
  // Rugs under everything, then furniture, pets and avatars sorted by their bottom edge.
  const petLabels: { x: number; y: number; name: string }[] = [];
  const sprites: { y: number; draw: () => void }[] = [];
  // Chairs someone sits in are drawn by drawSeated, wrapped around the sitter.
  const occupied = new Set<number>();
  for (const m of members) {
    const a = avatars.get(m.id);
    if (a && (m.online || m.id === myId) && a.x === a.tx && a.y === a.ty && acts.has(tileKey(a.x, a.y))) occupied.add(tileKey(a.x, a.y));
  }
  // Anyone sitting (not studying) is a lap any pet in that room may hop onto.
  const laps: { x: number; y: number; act: string }[][] = slots.map(() => []);
  for (const m of members) {
    const a = avatars.get(m.id);
    if (!a || m.focus || (!m.online && m.id !== myId) || a.x !== a.tx || a.y !== a.ty || acts.get(tileKey(a.x, a.y))?.act !== 'sit') continue;
    laps[grid.owner[a.y * grid.w + a.x]]?.push({ x: a.x, y: a.y, act: 'lap' });
  }
  // Empty seats: a pet may curl up on a chair or sofa, and only gets up when someone clicks it.
  const seats: { x: number; y: number }[][] = slots.map(() => []);
  for (const [k, v] of acts) {
    if (v.act !== 'sit') continue;
    const ax = k % 10000, ay = Math.floor(k / 10000), room = grid.owner[ay * grid.w + ax];
    if (room < 0 || !seats[room]) continue;
    if (members.some((o) => { const a = avatars.get(o.id); return !!a && (o.online || o.id === myId) && a.x === ax && a.y === ay; })) continue;
    seats[room].push({ x: ax, y: ay });
  }
  const sunny = sky === 'day' && weather !== 'rain' && weather !== 'snow';
  const areas = slots.map((_, j) => ({ spots: petSpots[j], toys: petToys[j], laps: laps[j] }));
  type PetNow = { m: Member; p: Member['pets'][number]; slot: number; seed: number; room: number; pos: ReturnType<typeof petPos>; goal?: { x: number; y: number }; act?: string; run?: boolean };
  const pets: PetNow[] = [];
  slots.forEach(({ m, room, ri }, i) => {
    const o = grid.origins[i];
    room.furniture.forEach((f, idx) => {
      const it = ITEMS[f.item as ItemKey] as (typeof ITEMS)[ItemKey] & { chair?: boolean; top?: boolean };
      if (!it || (it.chair && occupied.has(tileKey(o.x + f.x, o.y + f.y)))) return;
      if (!onScreen(o.x + f.x, o.y + f.y, Math.max(it.w, it.h), Math.max(it.w, it.h))) return;
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
      if (it.solid && !(canRotate(f.item) && f.rot)) for (const g of room.furniture) {
        if ((ITEMS[g.item as ItemKey] as { top?: boolean } | undefined)?.top &&g.y >= f.y && g.y < f.y + it.h && g.x >= f.x && g.x < f.x + it.w) bare |= 1 << (f.flip ? f.x + it.w - 1 - g.x : g.x - f.x);
      }
      const thirsty = isPlant(f.item) && now - (f.wateredAt ?? now) > THIRSTY_MS; // droops until someone waters it
      const draw = () => {
        if (dragged) ctx.globalAlpha = 0.35;
        drawFurniture(ctx, f.item, (o.x + f.x) * T, (o.y + f.y) * T - lift, t, furnColor(f), f.flip, it.w, f.s, bare, f.rot, it.h, lying(it), thirsty);
        ctx.globalAlpha = 1;
        const played = clawAt.get(`${m.id}:${ri}:${idx}`);
        if (played && now - played < 5000) drawClaw(ctx, (o.x + f.x) * T, (o.y + f.y) * T - lift, now, played);
        if (thirsty) drawDroplet(ctx, (o.x + f.x) * T + T / 2, (o.y + f.y) * T - lift - 6 + Math.round(Math.sin(t / 300)));
      };
      if (it.top) sprites.push({ y: o.y + f.y + 0.6, draw });
      else if (!it.solid) draw();
      else sprites.push({ y: o.y + f.y + fp.h - 0.5, draw });
    });
    if (ri === 0) m.pets?.forEach((p, slot) => { // pets live in their owner's first room
      if (!petSpots[i]?.length || p.away) return; // switched off in the You panel
      const seed = seedOf(m.id, slot);
      pets.push({ m, p, slot, seed, room: i, pos: petPos(seed, now, areas, i, petNear[i], petRoute) });
    });
  });
  // Breadcrumbs of where each person walked, so a following pet can walk the same path behind them.
  for (const m of members) {
    const a = avatars.get(m.id);
    if (!a) continue;
    const tr = trails.get(m.id) ?? { pts: [{ x: a.x, y: a.y }], movedAt: 0 }, last = tr.pts[tr.pts.length - 1];
    if (Math.hypot(a.x - last.x, a.y - last.y) > 0.2) { tr.pts.push({ x: a.x, y: a.y }); if (tr.pts.length > 60) tr.pts.shift(); tr.movedAt = now; }
    trails.set(m.id, tr);
  }
  // What each pet does over its usual wander, most important first: fetch, the nap it is already in, a nap beside
  // its studying owner (followers roam free while I study), the happy spin for a finished session or a pat,
  // greeting its owner or following their trail, a lazy sunbathe or a stolen chair, and finally company. Company is
  // only someone actually here (online, or me) and only in the room the pet is standing in, since its errand is
  // to settle beside them.
  const present = new Map(members.filter((o) => o.online || o.id === myId).map((o) => [o.id, avatars.get(o.id)] as const).filter((e): e is [string, Avatar] => !!e[1]));
  const meHere = present.get(myId);
  for (const x of pets) {
    const { m, p, slot } = x, key = `${m.id}:${slot}`, here = present.get(m.id) ?? null;
    const side = slot % 2 ? -0.7 : 0.7, back = slot > 1 ? 0.6 : 0.25, fe = fetches.get(key), fa = fe ? now - fe.at : Infinity;
    const guestA = m.id === myId ? undefined : meHere, myLvl = guestBondLevel(p.myBond ?? 0);
    const by = fe && avatars.get(fe.by), tr = trails.get(m.id), gap = 2.5 + slot * 0.9;
    // A pet asleep on a chair, or dozing in a patch of sun, stays put: a click wakes either one early, and both get
    // up on their own when their spell runs out, so a pet in a house nobody clicks is never stuck there all session.
    const seat = petSeat.get(key), sunning = petSunAt.get(key);
    // Pet sleep furniture: a pet clicked onto a pet bed/sofa/hammock/etc. naps there until patted twice in a row.
    const sofa = p.sofa;
    const wasSofa = petSofaToasted.has(key);
    if (sofa) {
      // `sofa.r` is a room index within the owner's own rooms, and `x.room` is the slot of the room the pet lives
      // in (its owner's first), so their room r is that many slots along. `slots[sofa.r]` was the *first*
      // housemate's room, which broke every nap for anyone else in the house.
      const sRoom = slots[x.room + sofa.r], so = grid.origins[x.room + sofa.r];
      const sf = sRoom?.m.id === m.id ? sRoom.room.furniture[sofa.index] : undefined;
      if (sf && so && PET_SLEEP_FURNITURE.has(sf.item)) {
        petSeat.delete(key);
        // Furniture x/y is room-local and a pet walks the whole grid, so the bed's tile needs its room's origin.
        // (`sf.x` alone was the tile in the *first* room, which is why a pet sent to a bed in another room ran off
        // to the top-left of the house and never lay down.)
        x.goal = { x: so.x + sf.x, y: so.y + sf.y };
        x.act = 'chair';
        if (!wasSofa) {
          petSofaToasted.add(key);
          toast(`💤 ${petName(p)} is napping on the ${ITEMS[sf.item as ItemKey].name.toLowerCase()}. Pat ${petName(p)} twice to wake it up.`);
        }
      } else {
        delete p.sofa;
        petSofaToasted.delete(key);
      }
    } else if (wasSofa) {
      petSofaToasted.delete(key);
      toast(`🐾 ${petName(p)} got up from its nap.`);
    }
    if (sunning && sunning.until <= now) petSunAt.delete(key);
    if (seat && seat.until <= now) petSeat.delete(key);
    if (!x.goal && seat && seat.until > now) { x.goal = { x: seat.x, y: seat.y }; x.act = 'chair'; }
    else if (!x.goal && sunning && sunning.until > now) { x.goal = { x: sunning.x, y: sunning.y }; x.act = 'sun'; }
    else if (!x.goal && fe && fa < 4500) x.goal = fa < 2000 || !by ? fe : { x: by.x + side, y: by.y + back };
    else if (!x.goal && here && m.focus && !p.follow) { x.goal = { x: here.x + side, y: here.y + back }; x.act = 'sleep'; }
    // Pet cheers owner during focus (like a supportive housemate): twice per session, that's it
    if (here && m.focus && !p.follow && x.act === 'sleep' && (petCheerCount.get(key) ?? 0) < 2 && Math.random() < 0.001 * dt * 60) {
      petCheers.set(key, { text: '👏', at: now });
      petCheerCount.set(key, (petCheerCount.get(key) ?? 0) + 1);
    }
    else if (!x.goal && now - (petDone.get(m.id) ?? 0) < 3000 || (now - (patAt.get(key) ?? 0) < 1200 && bondLevel(p.bond) >= 2)) x.run = true;
    else if (!x.goal && here && p.follow && !m.focus) {
      // A follower walks your own path while you move, and comes to sit beside you when you stop, so the
      // toggle reads as a change straight away instead of waiting for the next time you walk away.
      if (tr && now - tr.movedAt < 600) x.goal = trailPoint(tr.pts, gap);
      else if (Math.hypot(x.pos.x - here.x, x.pos.y - here.y) > gap + 1.5) x.goal = spotNear(here, gap - 0.8);
    }
    else if (!x.goal && here && now - (petGreet.get(m.id) ?? 0) < 5000) { // greeting: run up, but stop a little way off
      const dx = x.pos.x - here.x, dy = x.pos.y - here.y, d = Math.hypot(dx, dy) || 1;
      if (d > gap) x.goal = { x: here.x + (dx / d) * gap, y: here.y + (dy / d) * gap };
    }
    // The same hello from a pet that likes me best, when its owner isn't the one who just walked in.
    else if (!x.goal && guestA && now - (petGreetMe.get(key) ?? 0) < 5000 && roomAtPoint(guestA.x, guestA.y) === roomAtPoint(x.pos.x, x.pos.y)) {
      const dx = x.pos.x - guestA.x, dy = x.pos.y - guestA.y, d = Math.hypot(dx, dy) || 1;
      if (d > gap) x.goal = { x: guestA.x + (dx / d) * gap, y: guestA.y + (dy / d) * gap };
    }
    // Lazy afternoons: on a clear day a pet finds the light under a window, or curls up on an empty chair.
    else if (!x.goal && sunny && petSun[x.room]?.length && Math.random() < 0.0004 * dt * 60) {
      const spots = petSun[x.room], spot = spots[Math.floor(Math.random() * spots.length)];
      petSunAt.set(key, { x: spot.x, y: spot.y, until: now + 20_000 + Math.random() * 25_000 });
    }
    else if (!x.goal && seats[x.room]?.length && Math.random() < 0.00005 * dt * 60) {
      const sp = seats[x.room][Math.floor(Math.random() * seats[x.room].length)];
      petSeat.set(key, { x: sp.x, y: sp.y, until: now + 240_000 + Math.random() * 240_000 }); // a four-to-eight minute nap
    }
    // Company: the owner comes first, then the housemate this pet has bonded with most. A guest bond grows from
    // every pat, bowl filled and ball thrown, and shows only in what the pet does — never as a number. With the
    // owner away, the pet settles beside its favourite guest instead of drifting back to an empty room.
    else if (!x.goal) {
      const cur = petFx.get(key) ?? x.pos, room = roomAtPoint(cur.x, cur.y);
      const inRoom = (who: Avatar) => roomAtPoint(who.x, who.y) === room;
      const favA = present.get(p.fav ?? '');
      if (!here && favA && inRoom(favA)) { // owner away: walk over to the favourite guest and stay beside them
        if (Math.hypot(favA.x - cur.x, favA.y - cur.y) > 2.2) x.goal = spotNear(favA, 1);
        else if (Math.random() < 0.03) { x.goal = spotNear(favA, 0.9); x.act = Math.random() < 0.3 ? 'sleep' : undefined; }
      } else if (guestA && myLvl && inRoom(guestA) && Math.hypot(cur.x - guestA.x, cur.y - guestA.y) > 1.9 && Math.random() < Math.min(0.06, 0.008 * myLvl) * (here ? 1 : 3) * dt * 60) {
        x.goal = spotNear(guestA, 1.5); // a guest it has fussed over often: come over
      } else if (here && Math.random() < 0.0015 * (1 + bondLevel(p.bond)) * dt * 60) x.goal = spotNear(here, 1.6); // the owner, now and then
    }
    // A pet that likes you enough shows off: a little spin and a hop, close by.
    if (!x.goal && myLvl >= 2 && guestA && Math.random() < 0.008 * dt * 60
      && Math.hypot(guestA.x - x.pos.x, guestA.y - x.pos.y) < 3) { petTrickAt.set(key, now + 1600); petNameAt.set(key, now + 5500); }
    // A pet near someone singing stops to watch, or bounces along on the beat. Which one is a pure function
    // of the pet's seed and the clock; a second microphone nearby makes pets prefer the quiet watch.
    const singer = !x.goal && !x.run ? nearestSinger(x.pos.x, x.pos.y) : null;
    if (singer) {
      const side = x.pos.x < singer.x ? -0.9 : 0.9;
      x.goal = { x: singer.x + side, y: singer.y + 0.55 };
      x.act = micNearTile(singer.x, singer.y) ? 'watch' : singPetAct(x.seed, now);
    }
  }
  // Pet play from high-five: pets with active play state chase each other
  const playingPets = pets.filter((x) => (petPlay.get(`${x.m.id}:${x.slot}`) ?? 0) > now);
  for (const A of playingPets) for (const B of playingPets) {
    if (A === B || A.goal || B.goal || Math.hypot(A.pos.x - B.pos.x, A.pos.y - B.pos.y) > 3) continue;
    const cx = (A.pos.x + B.pos.x) / 2, cy = (A.pos.y + B.pos.y) / 2, sx = Math.sin(now / 300) * 1.2, sy = Math.cos(now / 300) * 0.6;
    A.goal = { x: cx + sx, y: cy + sy }; B.goal = { x: cx - sx, y: cy - sy }; A.run = B.run = true; A.act = 'dance'; B.act = 'dance';
  }
  // Two idle pets close together play chase around each other.
  const idle = pets.filter((x) => !x.goal && !x.run && !x.pos.moving && !x.pos.act);
  for (const A of idle) for (const B of idle) {
    if (A === B || A.goal || B.goal || Math.hypot(A.pos.x - B.pos.x, A.pos.y - B.pos.y) > 2) continue;
    const cx = (A.pos.x + B.pos.x) / 2, cy = (A.pos.y + B.pos.y) / 2, sx = Math.sin(now / 400) * 0.7, sy = Math.cos(now / 400) * 0.35;
    A.goal = { x: cx + sx, y: cy + sy }; B.goal = { x: cx - sx, y: cy - sy }; A.run = B.run = true;
  }
  petHits = [];
  for (const { m, p, slot, seed, pos, goal, act, run } of pets) {
    const key = `${m.id}:${slot}`, fx = petFx.get(key);
    let { x: px, y: py, moving, left, act: pact } = pos;
    if (goal || fx) {
      const cur = fx ?? { x: px, y: py, left };
      let tx = goal?.x ?? px, ty = goal?.y ?? py;
      // A stored route belongs to the goal it was built for, and it starts from where the pet actually stands: `pos`
      // is the wander ghost, still ticking along under a pet that is off on an errand, so routing from it sent the
      // pet chasing a spot it was never at.
      const cached = petPaths.get(key);
      if (!goal || !cached || Math.abs(cached.goal.x - goal.x) > 0.5 || Math.abs(cached.goal.y - goal.y) > 0.5) petPaths.delete(key);
      if (goal && !petPaths.has(key)) {
        const built = petRoute({ x: Math.round(cur.x), y: Math.round(cur.y) }, { x: Math.round(goal.x), y: Math.round(goal.y) });
        if (built && built.length > 1) petPaths.set(key, { goal: { x: goal.x, y: goal.y }, path: built.slice(1) }); // skip current position
      }
      const path = petPaths.get(key)?.path;
      if (path && path.length) {
        // Follow the path: move toward the next waypoint
        const next = path[0];
        tx = next.x; ty = next.y;
        const dx = tx - cur.x, dy = ty - cur.y, d = Math.hypot(dx, dy);
        if (d < 0.3) { // reached waypoint
          path.shift();
          if (!path.length) petPaths.delete(key);
        }
      }
      const dx = tx - cur.x, dy = ty - cur.y;
      // A route is walkable by construction. Without one, the straight step is only taken across open floor (and
      // onto a piece of furniture at the end), so a goal behind a wall is never walked to: the pet stays put.
      const ontoPiece = !!goal && grid.at(Math.round(goal.x), Math.round(goal.y)) === BLOCKED;
      const cut = !(path && path.length) && !!goal && !petLineClear(cur, goal, ontoPiece);
      const d = cut ? 0 : Math.hypot(dx, dy), step = d ? Math.min(d, dt * 5) / d : 0;
      cur.x += dx * step; cur.y += dy * step;
      if (!goal && !path && d < 0.05) petFx.delete(key); else petFx.set(key, cur);
      // The act that comes with a goal (curling up on the bed, sleeping beside its owner) only shows once the pet
      // is there: a pet still walking to its bed is just walking, not asleep in the middle of the room.
      const arrived = !!goal && Math.hypot(goal.x - cur.x, goal.y - cur.y) < 0.4;
      px = cur.x; py = cur.y; moving = d > 0.05; pact = moving ? undefined : goal ? (arrived ? act : undefined) : pact;
      // Face the way it last really walked: tiny steps toward a target that keeps moving mustn't flip it back and forth.
      if (d && Math.abs(dx) > 0.02) cur.left = dx < 0;
      left = cur.left ?? left;
    }
    if (run) { moving = true; if (!goal) left = Math.floor(now / 150) % 2 === 0; } // spin: flip side to side
    petHits.push({ m, slot, x: px, y: py });
    // Names are not always on screen: a pet wears its name while it trots about, for a moment after it is fussed
    // over or does a trick, and now and then while it idles (a per-pet offset, so they never all flicker at once).
    const nameNow = (petNameAt.get(key) ?? 0) > now;
    if ((petTrickAt.get(key) ?? 0) > now) { pact = 'trick'; left = Math.floor(now / 160) % 2 === 0; }
    const temp = petActAt.get(key);
    if (temp && now - temp.at < 1500) pact = temp.act;
    else if (temp) petActAt.delete(key);
    const guestA = m.id === myId ? undefined : meHere; // me, when this pet isn't mine
    const myLvl = guestBondLevel(p.myBond ?? 0);
    const isHovered = hoverPet?.m.id === m.id && hoverPet?.slot === slot;
    if (p.name && (nameNow || isHovered)) petLabels.push({ x: px, y: py - (pact === 'perch' ? 1 : 0), name: p.name });
    // The pet it likes has come over: say so, quietly and not every ten seconds.
    if (guestA && myLvl && Math.hypot(px - guestA.x, py - guestA.y) < 1.9 && now - (petSaid.get(key) ?? 0) > 120_000) {
      petSaid.set(key, now);
      petNameAt.set(key, now + 6000);
      toast(`🐾 <b>${esc(petNameOf(p))}</b> comes over to keep you company.`, 'reward');
    }
    const love = Math.min(now - (m.fedAt ?? 0), (now - (patAt.get(key) ?? 0)) * 4); // fed or petted: a heart floats up
    const petCheer = petCheers.get(key);
    sprites.push({ y: py + (pact === 'lap' ? 2 : pact === 'chair' ? 1.4 : 0.9), draw: () => {
      drawPet(ctx, p.kind, Math.round(px * T), Math.round(py * T), moving, left, now, pact, p.coat, p.acc);
      if (love < 6000) drawHeart(ctx, px * T + T / 2, py * T - love / 400);
      // Pet cheer: 👏 floating up like a housemate cheer
      if (petCheer && now - petCheer.at < 2500) {
        ctx.font = `600 ${T * 0.9}px 'Fredoka', system-ui, sans-serif`;
        ctx.globalAlpha = 1 - (now - petCheer.at) / 2500;
        ctx.fillStyle = '#2b2530';
        ctx.fillText(petCheer.text, px * T, py * T - T * 1.2 - (now - petCheer.at) / 40);
        ctx.globalAlpha = 1;
      }
    } });
  }
  const labels: { x: number; y: number; m: Member; seated: boolean; lift: number }[] = [];
  const lights: { x: number; y: number; rad: number; alpha: number }[] = [];
  for (const m of members) {
    const a = avatars.get(m.id);
    if (!a || (!m.online && m.id !== myId)) continue;
    const walking = a.x !== a.tx || a.y !== a.ty;
    const act = walking ? undefined : acts.get(tileKey(a.x, a.y));
    const seated = !!m.focus && !!act && !!(ITEMS[act.item as ItemKey] as { chair?: boolean }).chair; // studying at a desk
    const stepFrame = walking ? 1 + (Math.floor(a.dist * 4) % 2) : 0;
    const pop = cheers.get(m.id), hop = pop?.hop && now - pop.at < 660 ? Math.round(Math.abs(Math.sin((now - pop.at) / 105)) * 3) : 0; // a high five: two quick hops
    // Tipsy is a slow, wide sway: a couple of pixels was invisible, so it leans properly and bobs.
    const sway = tipsy(m) ? Math.sin(now / 260) : 0;
    const ax = Math.round(a.x * T + sway * 3);
    const ay = Math.round(a.y * T) - hop - (tipsy(m) ? Math.round(Math.abs(Math.sin(now / 260)) * 2) : 0);
    const singing = !act && a.use === 'sing' && !walking;
    const duet = singing && micNearTile(a.x, a.y);
    // The spotlight is its own sprite just behind the singer, so the mic stand, notes and singer stay crisp on top.
    if (singing) sprites.push({ y: a.y - 0.8, draw: () => drawSingSpotlight(ctx, ax, ay, t, duet) });
    sprites.push({
      y: act ? Math.max(a.y + 0.99, act.z + 0.01) : a.y + 0.99, // on a bed's pillow row: drawn over the bed, not under it
      draw: () => (act ? drawActing(ctx, m.look, act.act, act.item, ax, ay, t, act.col, seated)
        : singing ? drawUsing(ctx, m.look, 'sing', ax, ay, t, duet)
        : a.use && !walking ? drawUsing(ctx, m.look, a.use, ax, ay, t)
        : drawAvatar(ctx, m.look, ax, ay, stepFrame, a.up)),
    });
    // The flame sorts in front of the character, so it is a second sprite on the next row down.
    if (caffeinated(m)) sprites.push({ y: a.y + 1.02, draw: () => drawFlames(ctx, ax, ay - 4, t) });
    // Both the bubble and the name tag clear the head, wherever a bigger or smaller character's head ends up.
    labels.push({ x: a.x, y: a.y, m, seated, lift: Math.round((seated ? 30 : act?.act === 'pullup' ? 28 : act ? 12 : 7) * avatarScale(m.look)) });
    // Studying after dark: a desk lamp clicks on, on the table in front of the chair. A wide, soft pool of light
    // rather than a hot spot right on the desk, which used to glare at the person studying.
    if (seated && dark) {
      sprites.push({ y: a.y + 1.6, draw: () => drawDeskLamp(ctx, ax + 10, ay + T + 4) });
      lights.push({ x: ax + 15, y: ay + T - 4, rad: 28, alpha: 0.3 });
    }
  }
  sprites.sort((p, q) => p.y - q.y).forEach((s) => s.draw());

  if (tint) {
    ctx.fillStyle = tint;
    for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) if (grid.at(x, y)) ctx.fillRect(x * T, y * T, T, T);
    slots.forEach(({ room }, i) => {
      const o = grid.origins[i];
      for (const f of room.furniture) {
        const glow = GLOWS[f.item];
        if (glow && !f.off) lights.push({ x: (o.x + f.x) * T + glow.dx, y: (o.y + f.y) * T + glow.dy, rad: glow.rad, alpha: glow.alpha });
      }
    });
    const flicker = 0.03 * Math.sin(t / 700);
    ctx.save(); // light stays inside the house, not on the paper around it
    ctx.beginPath();
    for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w;) { // one rect per run of house tiles in each row
      if (!grid.at(x, y)) { x++; continue; }
      const x0 = x;
      while (x < grid.w && grid.at(x, y)) x++;
      ctx.rect(x0 * T, y * T, (x - x0) * T, T);
    }
    ctx.clip();
    for (const l of lights) if (onScreen(l.x / T - 16, l.y / T - 16, 32, 32)) drawGlow(ctx, l.x, l.y, l.rad, (sky === 'night' ? l.alpha : l.alpha * 0.5) + flicker);
    ctx.restore();
  }
  drawWindowLight(sky, weather, onScreen);

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
  for (const { x, y, name } of petLabels) { // a named pet: small, quiet tag over its head
    const fs = Math.max(10, 2.4 * scale);
    ctx.font = `600 ${fs}px 'Fredoka', system-ui, sans-serif`;
    ctx.lineWidth = Math.max(2, fs / 4);
    ctx.strokeStyle = 'rgba(43,37,48,0.75)';
    ctx.fillStyle = '#fff';
    const sx = (view.ox + x * T + 8) * scale, sy = (view.oy + y * T - 2) * scale;
    ctx.strokeText(name, sx, sy);
    ctx.fillText(name, sx, sy);
  }
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
      ctx.font = `600 ${fs * 1.5}px 'Fredoka', system-ui, sans-serif`;
      ctx.globalAlpha = 1 - (now - ch.at) / 2500;
      ctx.fillStyle = '#2b2530';
      ctx.fillText(ch.text, sx, sy - fs * 1.6 - (now - ch.at) / 40);
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

// Things that light up the room at night: offset of the light from the item's top-left, size and strength.
// The pools are small and amber rather than wide and yellow: a lamp lights the thing under it, not the whole room.
const GLOWS: Record<string, { dx: number; dy: number; rad: number; alpha: number }> = {
  lamp: { dx: 8, dy: -4, rad: 30, alpha: 0.5 },
  fireplace: { dx: 16, dy: 6, rad: 38, alpha: 0.58 },
  pumpkin: { dx: 8, dy: 8, rad: 18, alpha: 0.45 },
  christmasTree: { dx: 8, dy: -6, rad: 22, alpha: 0.38 },
  tv: { dx: 16, dy: -6, rad: 24, alpha: 0.32 },
  arcade: { dx: 8, dy: -8, rad: 20, alpha: 0.34 },
  aquarium: { dx: 16, dy: -4, rad: 20, alpha: 0.28 },
  gamingDesk: { dx: 16, dy: -2, rad: 20, alpha: 0.32 },
  arcLamp: { dx: 8, dy: -8, rad: 28, alpha: 0.47 },
  bedsideLamp: { dx: 8, dy: 4, rad: 18, alpha: 0.38 },
  candles: { dx: 8, dy: 6, rad: 18, alpha: 0.38 },
  neonHeart: { dx: 8, dy: -4, rad: 20, alpha: 0.38 },
  fairyJar: { dx: 8, dy: 8, rad: 14, alpha: 0.34 },
  floorCandle: { dx: 8, dy: 0, rad: 18, alpha: 0.38 },
  snowflakeLamp: { dx: 8, dy: -6, rad: 20, alpha: 0.34 },
  lanternString: { dx: 8, dy: -8, rad: 20, alpha: 0.38 },
  diya: { dx: 8, dy: 8, rad: 14, alpha: 0.38 },
  ghost: { dx: 8, dy: -2, rad: 16, alpha: 0.24 },
  menorah: { dx: 8, dy: 4, rad: 20, alpha: 0.42 },
  heater: { dx: 8, dy: 0, rad: 24, alpha: 0.42 },
  discoBall: { dx: 8, dy: -6, rad: 26, alpha: 0.34 },
  skyLantern: { dx: 8, dy: -6, rad: 26, alpha: 0.5 },
  sparklers: { dx: 8, dy: 0, rad: 20, alpha: 0.42 },
  garbaLamp: { dx: 8, dy: 6, rad: 24, alpha: 0.5 },
  bonfire: { dx: 8, dy: 4, rad: 34, alpha: 0.6 },
  eidLantern: { dx: 8, dy: 4, rad: 26, alpha: 0.5 },
  crescentLamp: { dx: 8, dy: -4, rad: 24, alpha: 0.42 },
  lotusLamp: { dx: 8, dy: 6, rad: 18, alpha: 0.42 },
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
  guide: { title: 'Guide', icon: 'guide', color: '#dce7ea' },
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
ui.querySelectorAll<HTMLImageElement>('img[data-icon]').forEach((img) => (img.src = uiIconURL(img.dataset.icon!)));

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
  chromeDirty(); // the deck and break chip can appear or go, which changes how much room the house gets
  $('#breakChip').hidden = !breakTimer;
  if (breakTimer) $('#breakTime').textContent = `☕ Break ${fmt(breakEnds - Date.now())}`;
  const caf = caffeinated(myMember());
  $('#cafChip').hidden = !caf;
  if (caf) $('#cafTime').textContent = `Caffeinated ${fmt((myMember()!.caffeineUntil ?? 0) - Date.now())}`;
  const f = myMember()?.focus;
  // Here, not in the frame loop: frames stop in a background tab, this interval keeps running.
  // Keep asking until the server ends the session: a single try is lost if the connection blinks
  // or this device's clock runs ahead of the server's (it refuses "done" before its own end time).
  if (f && Date.now() >= focusEnd(f) && Date.now() - lastDoneTry > 3000) {
    lastDoneTry = Date.now();
    send({ t: 'focus_done' });
  }
  // A panel takes over from the deck: the timer moves to the HUD chip and the dock comes back, so
  // another panel can be picked. Closing the panel brings the deck back.
  const showDeck = !!f && !deckHidden && !openPanel;
  $('#focusChip').hidden = !f || showDeck;
  $('#deck').hidden = !showDeck;
  $('#dock').hidden = showDeck;
  ui.querySelector('#dock [data-panel="chat"]')?.classList.toggle('unread', unread);
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
  const cafMin = caffeineMinutes(f, myMember()?.caffeineSince, myMember()?.caffeineUntil, Date.now()); // what the coffee is worth, live
  const cafNote = cafMin ? ` · 🔥 ${cafMin} ${coin()}` : '';
  $('#deckNote').innerHTML = buddies
    ? `Earning ${Math.ceil(f.minutes * buddyMultiplier(buddies))} ${coin()}${cafNote} · ✨ ×${buddyMultiplier(buddies)} with ${buddies} studying`
    : `Earning ${f.minutes} ${coin()}${cafNote}`;
  const pt = panel.querySelector('#ptimer'), pb = panel.querySelector<HTMLElement>('#pbar');
  if (pt) pt.textContent = left;
  if (pb) pb.style.width = `${progress(f)}%`;
  // Clean up old pet cheers (older than 3 seconds) and pet play (older than 5 seconds)
  const now = Date.now();
  for (const [key, cheer] of petCheers) if (now - cheer.at > 3000) petCheers.delete(key);
  for (const [key, until] of petPlay) if (now > until) petPlay.delete(key);
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
// opts.onClick makes the whole toast a button (an invite: tap to join); opts.ms keeps it up longer.
function toast(html: string, kind = '', opts: { ms?: number; onClick?: () => void } = {}) {
  const el = $('#toast');
  el.innerHTML = `<span>${html}</span>`; // one inline run so bold words don't become separate flex items
  el.className = kind;
  $('#announce').textContent = el.textContent ?? ''; // read out by screen readers, since the toast just animates
  el.hidden = true;
  void el.offsetWidth; // restart the drop-in animation
  el.hidden = false;
  el.onclick = opts.onClick ? () => { el.hidden = true; opts.onClick!(); } : null;
  el.style.cursor = opts.onClick ? 'pointer' : '';
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), opts.ms ?? 3200);
}

// The tour replaces the old per-item toasts: one toast per thing was two or three lines and then silence. A tour
// lists every step at once, so the player can see how much there is and pick where to start. Each step is a thing
// they actually own, and opening the tour is what marks those things as seen — so it never asks twice.
type TourRow = { item?: string; title?: string; text: string; html?: boolean };
let tourRows: TourRow[] = [];
let tourAt = 0;

// Unseen object types with special features/actions in the current house, shown once per item (remembered per user across houses).
function maybeShowHouseItemsTour() {
  const MUSIC_USES = new Set(['music', 'dance', 'dj', 'drum', 'strum']);
  const SING_USE = 'sing';
  const WATCH_ITEMS = new Set(['tv', 'retroTV', 'mediaConsole']);
  const rows: TourRow[] = [];
  const forceOnce = !localStorage.getItem('auralis.houseItemsTour.once.v3');
  const seen = new Set(forceOnce ? [] : seenTips());
  for (const m of members) {
    const who = m.id === myId ? 'Your' : `${m.name}'s`;
    for (let ri = 0; ri < m.rooms.length; ri++) {
      const where = m.rooms.length > 1 ? `${who} room ${ri + 1}` : `${who} room`;
      for (const f of m.rooms[ri].furniture) {
        const it = ITEMS[f.item as ItemKey];
        if (!it || seen.has(f.item)) continue;
        const use = (it as { use?: string }).use;
        const isMusic = !!use && MUSIC_USES.has(use);
        const isSing = use === SING_USE;
        const isWatch = WATCH_ITEMS.has(f.item);
        if (!(f.item in GUIDE_TIPS) && !isMusic && !isSing && !isWatch) continue;
        seen.add(f.item);
        let text = where;
        if (f.item in GUIDE_TIPS) text = `${where}. ${(GUIDE_TIPS as Record<string, string>)[f.item]}`;
        else if (isSing) text = `${where}. Click to sing: a pose, floating notes and a spotlight, just for show.`;
        else if (isMusic) text = `${where}. Click to play music (shared with the house).`;
        else if (isWatch) text = `${where}. Watch videos together with housemates here.`;
        rows.push({ item: f.item, title: it.name, text });
      }
    }
  }
  if (!rows.length) return;
  // Remember each item (per user) so it never shows again, then present in tour format.
  for (const r of rows) if (r.item) markTipSeen(r.item);
  if (forceOnce) localStorage.setItem('auralis.houseItemsTour.once.v3', '1');
  openTour(rows, { title: 'Items in this house', lede: 'Special things in this house you can use. Each one is shown once.' });
}

// What I have been shown this session. A state message can land after the tour has marked its steps but before
// the server has stored them, and it would carry the old `tipsSeen` — so the session's own set is merged in.
const shownHere = new Set<string>();
const seenTips = () => [...new Set([...(me.tipsSeen ?? []), ...shownHere])];

const markTipSeen = (id: string) => {
  shownHere.add(id);
  const seen = (me.tipsSeen ??= []);
  if (seen.includes(id)) return;
  seen.push(id); // mark it here too: a broadcast can land before the server's answer does
  send({ t: 'tip_seen', id });
};

// What I have: in storage, or already out in one of my rooms. Placing a piece takes it out of the inventory, so
// counting storage alone would miss the very things the tour exists to explain.
function myThings(): Record<string, number> {
  const owned: Record<string, number> = { ...(me.inventory ?? {}) };
  for (const r of myMember()?.rooms ?? []) for (const f of r.furniture) owned[f.item] = (owned[f.item] ?? 0) + 1;
  return owned;
}

function openTour(rows: TourRow[], opts?: { title?: string; lede?: string }) {
  if (!rows.length) return;
  const d = $<HTMLDialogElement>('#tour');
  if (d?.open) return; // one at a time: finishTour picks up anything that turned up meanwhile
  tourRows = rows;
  tourAt = 0;
  if (!opts) for (const r of rows) if (r.item) markTipSeen(r.item);
  $('#tourTitle').innerHTML = `<img data-icon="guide" alt="" /> ${esc(opts?.title ?? 'A quick look around')}`;
  $<HTMLImageElement>('#tourTitle [data-icon="guide"]').src = uiIconURL('guide');
  const lede = $('#tourLede');
  lede.textContent = opts?.lede ?? 'These are the things the catalog cannot explain. Every one is already yours, and every step is listed below.';
  lede.hidden = !lede.textContent;
  renderTour();
  if (d && !d.open) d.showModal();
}

function closeTour() {
  const d = $<HTMLDialogElement>('#tour');
  if (d?.open) d.close(); // the dialog's own close event picks up the pieces
}

// After a tour ends, anything that turned up while it was open gets its own short tour.
function finishTour() {
  tourRows = [];
  const fresh = unseenTips(myThings(), seenTips());
  if (fresh.length) setTimeout(() => openTour(fresh.map((s) => ({ item: s.item, text: s.text }))), 0);
}

// A row with no item needs a title of its own: the first words of its sentence, cut at a word.
function shortTitle(text: string, i: number) {
  const plain = text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  if (!plain) return `Step ${i + 1}`;
  return plain.length > 46 ? `${plain.slice(0, 46).replace(/\s+\S*$/, '')}…` : plain;
}

function renderTour() {
  const body = $<HTMLDivElement>('#tourBody');
  if (!body || !tourRows.length) return;
  const name = (r: TourRow, i: number) => r.title ?? (r.item ? ITEMS[r.item as ItemKey]?.name ?? r.item : shortTitle(r.text, i));
  body.innerHTML = `<ol class="tour-list">${tourRows.map((r, i) => `<li>
      <div class="tour-row">
        ${r.item ? icon(r.item) : '<b class="tour-n">i</b>'}
        <span class="tour-line"><b>${esc(name(r, i))}</b><em>${r.html ? r.text : esc(r.text)}</em></span>
      </div></li>`).join('')}</ol>
    <div class="tour-foot">
      <button type="button" data-tour="done">Got it</button>
    </div>`;
}

$('#tourBody').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-tour]');
  if (!b) return;
  if (b.dataset.tour === 'done') closeTour();
});
$('#tourClose').addEventListener('click', closeTour);
$('#tour').addEventListener('close', finishTour); // Esc, or the browser closing it for us

function copyCode(code = houseCode) {
  const shown = () => toast(`The house code is <b>${code}</b>`);
  if (navigator.clipboard) navigator.clipboard.writeText(code).then(() => toast(`Copied house code <b>${code}</b>!`), shown);
  else shown();
}
$('#code').addEventListener('click', () => copyCode());

const icons = new Map<string, string>();
function icon(item: string, cls = 'icon', style = 0, col?: string) {
  const key = `${item}|${style}|${col ?? ''}`;
  if (!icons.has(key)) {
    const it = ITEMS[item as ItemKey];
    const c = document.createElement('canvas');
    const top = OVERHANG[item] ?? 0;
    c.width = it.w * T * AV; c.height = (it.h * T + top) * AV;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.scale(AV, AV);
    drawFurniture(g, item, 0, top, 0, col, false, it.w, style, 0, 0, it.h);
    icons.set(key, c.toDataURL());
  }
  return `<img class="${cls}" src="${icons.get(key)}" alt="">`;
}
const petIcon = (kind: string, cls = 'icon', coat = 0, acc?: string) => `<img class="${cls}" src="${petIconURL(kind, coat, acc)}" alt="">`;

// A character picture where every art pixel lands on whole screen pixels, at any display scaling: drawn at a
// whole-number number of device pixels per art pixel, then shown at exactly that many device pixels.
// frame = the img's padding + border on both sides (boxes are border-box), so the picture itself isn't squeezed.
function crispAvatar(look: Look, scale: number, head: boolean, frame: number) {
  // The canvas grows with a tall (or small) character, so the picture is never cropped or stretched.
  const dpr = devicePixelRatio || 1, k = Math.max(1, Math.round(scale * dpr)), sz = avatarScale(look);
  const w = Math.ceil(16 * sz), h = Math.ceil((head ? 16 : 22) * sz);
  const c = document.createElement('canvas');
  c.width = w * k; c.height = h * k;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.scale(k, k);
  // A head crop starts at the top of the sprite; a whole body has its feet on the bottom edge.
  drawAvatar(g, look, (w - 16) / 2, head ? AVATAR_H * sz - 17 : h - 17, 0, false);
  return { url: c.toDataURL(), style: `width:${(w * k) / dpr + frame}px;height:${(h * k) / dpr + frame}px` };
}
function avatarPreview(look: Look) {
  const { url, style } = crispAvatar(look, 4, false, 18);
  return `<img class="preview" src="${url}" style="${style}" alt="Your character">`;
}

const CUSTOM_SWATCH = 'conic-gradient(red,yellow,green,cyan,blue,magenta,red)';
// Swatch rows. A custom colour gets its own selected swatch, and the rainbow that opens the picker stays rainbow and in
// place, so there is always a way back to the picker after one has been chosen.
// acc names the accessory a row belongs to: several can be worn at once, so each colour row has to say which one it paints.
const swatches = (act: string, list: string[], current: string | number | undefined, byIndex = false, pickable = true, acc?: string) => {
  const custom = !byIndex && typeof current === 'string' && !list.includes(current) ? current : undefined;
  const tag = acc ? ` data-acc="${acc}"` : '';
  return `<div class="swatches">${list.map((c, i) => `<button class="swatch${(byIndex ? i : c) === current ? ' on' : ''}" style="background:${c}" data-act="${act}" data-v="${byIndex ? i : c}"${tag} aria-label="${c}"></button>`).join('')}${custom ? `<button class="swatch on" style="background:${custom}" data-act="noop" title="Your custom colour" aria-label="Your custom colour"></button>` : ''}${pickable ? `<button class="swatch custom" data-act="${acc ? 'accpick' : 'pickcolor'}" data-v="${acc ?? act}"${tag} title="Custom colour" aria-label="Custom colour" style="background:${CUSTOM_SWATCH}"></button>` : ''}</div>`;
};
// One colour dialog at a time. The panel is rebuilt from scratch on every update, and a picker whose input lives in the
// swatch row is thrown away by that rebuild, which closes the OS dialog after the first colour. Its handle lives on the
// page instead, so the dialog survives for as long as the pick lasts.
let colorPick: HTMLInputElement | null = null;
function pickColor(start: string, onPick: (hex: string) => void) {
  colorPick?.remove(); // a second pick replaces the first rather than stacking dialogs
  const input = ui.createElement('input') as HTMLInputElement;
  input.type = 'color'; input.value = start; input.className = 'colorpick';
  const done = () => { input.remove(); if (colorPick === input) colorPick = null; };
  const picked = () => { if (input.value) onPick(input.value); };
  input.addEventListener('input', picked);
  input.addEventListener('change', () => { picked(); done(); });
  input.addEventListener('cancel', done); // dismissed without choosing
  ui.body.appendChild(input);
  colorPick = input;
  input.click();
}

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
  return isFocusLength(len) ? `<div class="center"><button data-act="focus" data-v="${len}">▶ Again: ${len} min${lastTag ? ` of ${esc(lastTag)}` : ''}</button></div>` : '';
}
// Character options as pictures: my character wearing each choice, the whole body or just the head.
const LOOK_LABEL: Record<string, string> = { twintails: 'twin tails', manbun: 'man bun', sidelong: 'side long', catears: 'cat ears', round: 'round glasses', chubby: 'plus', scar: 'eye scar', stitch: 'cheek stitches' };
const lookPics = new Map<string, { url: string; style: string }>();
// One colour row per worn accessory. A scar only ever takes black, dark red or the wearer's own skin tone, so its row
// offers those three and no picker; every other accessory gets the full palette plus a custom colour.
function accColourRow(a: string, look: Look) {
  const scar = SCAR_ACCS.includes(a);
  const list = scar ? [...new Set([...SCAR_COLOURS, look.skin])] : ACC_COLORS;
  const stored = look.color?.[`acc:${a}`];
  const current = stored && list.includes(stored) ? stored : ACC_COL[a] ?? list[0];
  return `<h3>${LOOK_LABEL[a] ?? a} colour</h3>${swatches('acccol', list, current, false, !scar, a)}`;
}
// Accessories stack: every tile toggles one on or off, and 'none' clears the lot.
function accTiles(list: string[], look: Look) {
  const worn = look.accs ?? [];
  return `<div class="row tile-picks">${list.map((v) => {
    const on = v === 'none' ? worn.length === 0 : worn.includes(v);
    const preview = { ...look, accs: v === 'none' ? [] : on ? worn : [...worn, v] };
    const key = `acc|${devicePixelRatio}|${lookKey(preview)}`;
    let pic = lookPics.get(key);
    if (!pic) { pic = crispAvatar(preview, 3, true, 4); lookPics.set(key, pic); }
    return `<button class="tile-pick ${on ? 'on' : 'off'}" data-act="acc" data-v="${v}" aria-label="${LOOK_LABEL[v] ?? v}" aria-pressed="${on}">
      <img class="head" src="${pic.url}" style="${pic.style}" alt=""><small>${LOOK_LABEL[v] ?? v}</small></button>`;
  }).join('')}</div>`;
}
function lookTiles(act: keyof Look, list: string[], look: Look, head = false) {
  const current = look[act] ?? list[0];
  return `<div class="row tile-picks">${list.map((v) => {
    const key = `${head}|${devicePixelRatio}|${lookKey({ ...look, [act]: v })}`;
    let pic = lookPics.get(key);
    if (!pic) { pic = crispAvatar({ ...look, [act]: v }, head ? 3 : 2, head, 4); lookPics.set(key, pic); }
    return `<button class="tile-pick ${v === current ? 'on' : 'off'}" data-act="${act}" data-v="${v}" aria-label="${LOOK_LABEL[v] ?? v}" aria-pressed="${v === current}">
      <img class="${head ? 'head' : 'full'}" src="${pic.url}" style="${pic.style}" alt=""><small>${LOOK_LABEL[v] ?? v}</small></button>`;
  }).join('')}</div>`;
}
const randomLook = (): Look => ({
  skin: pickOne(SKINS), hair: pickOne(HAIRS), shirt: pickOne(SHIRTS), style: pickOne(STYLES), face: pickOne(FACES), outfit: pickOne(OUTFITS),
  body: pickOne(BODIES), accs: Math.random() < 0.6 ? [] : [pickOne(ACCESSORIES.filter((a) => a !== 'none'))],
});

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
// Only http(s) links, so a message can't smuggle in a javascript: URL; trailing punctuation stays outside the link.
const linkify = (s: string) => s.split(/(https?:\/\/\S*[^\s.,!?:;)'"])/).map((p, i) => i % 2 ? `<a href="${esc(p)}" target="_blank" rel="noopener noreferrer">${esc(p)}</a>` : esc(p)).join('');

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
    const sold = mine.rooms[editRoom];
    const drop = editRoom > 0 && sold ? `<div class="card room-card"><b>Sell Room ${editRoom + 1}</b>
        <div class="room-mini" style="--w:${roomSize(sold).w};--h:${roomSize(sold).h}"></div>
        <small>Full price back, and everything in it returns to your Storage.</small>
        <button class="danger" data-act="sellroom">${coin()} ${ROOM_COST[editRoom]} back</button></div>` : '';
    shelf = roomPicker(mine) + shelf + drop;
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
  const canRot = sel ? canRotate(sel.item) : false;
  const selBar = sel ? `<div class="selected">${icon(sel.item)}<b>${ITEMS[sel.item as ItemKey].name}</b>
      ${canRot ? '<button class="off" data-act="rotate" title="Turn it: side, back, other side, front">⟳ Rotate</button>' : ''}
      <button class="off" data-act="flip" title="Mirror it to face the other way">↔ Flip</button>
      <button class="off" data-act="putaway">Put away</button><button data-act="deselect">Done</button></div>
      ${looks.length ? `<h3>Style</h3><div class="row styles">${looks.map((name, k) =>
        `<button class="${(sel.s ?? 0) === k ? 'on' : 'off'}" data-act="shape" data-v="${k}">${icon(sel.item, 'chip-icon', k)}${name}</button>`).join('')}</div>` : ''}
      ${palette.length ? `<h3>Colour</h3><div class="swatches">${palette.map((c: string, k: number) =>
        `<button class="swatch${!sel.col && (sel.v ?? -1) === k ? ' on' : ''}" style="background:${c}" data-act="recolor" data-v="${k}" aria-label="${c}"></button>`).join('')}${sel.col
        ? `<button class="swatch on" style="background:${sel.col}" data-act="noop" title="Your custom colour" aria-label="Your custom colour"></button>` : ''}<button class="swatch custom" data-act="paintfurn" title="Custom colour" aria-label="Custom colour" style="background:${CUSTOM_SWATCH}"></button></div>` : ''}` : '';
  const craftedReadyAt = sel && moving !== null ? myReady(sel, editRoom, moving) : 0;
  const craftBar = sel && CRAFT[sel.item as keyof typeof CRAFT] ? `<p class="hint">${craftedReadyAt ? `Ready ${fmt(craftedReadyAt - Date.now())} from now.` : 'Tap the piece in your room to make something: free, and it only makes what that piece is for.'}</p>` : '';
  const hint = placing ? `Tap a spot in your room to place the <b>${ITEMS[placing].name}</b>.`
    : sel ? (canRot ? 'Drag it, or tap a new spot to move it there. Keys: arrows move · R rotate · F flip · Delete put away · Esc done.' : 'Drag it, or tap a new spot to move it there. Keys: arrows move · F flip · Delete put away · Esc done.')
    : 'Drag any furniture to move it, or tap it for more options. Tap a stack again to reach what is underneath.';
  const shelves = SHELVES.filter((sh) => inv.some(([k]) => (ITEMS[k as ItemKey] as { shelf?: string }).shelf === sh.id));
  if (!shelves.some((sh) => sh.id === storeShelf)) storeShelf = 'all';
  const shown = storeShelf === 'all' ? inv : inv.filter(([k]) => (ITEMS[k as ItemKey] as { shelf?: string }).shelf === storeShelf);
  const filter = shelves.length > 1 ? `<div class="row chips">${[{ id: 'all', label: `All (${inv.length})` }, ...shelves].map((sh) =>
    `<button class="small-chip ${storeShelf === sh.id ? 'on' : 'off'}" data-act="storeShelf" data-v="${sh.id}">${sh.label}</button>`).join('')}</div>` : '';
  const crafted = (me.crafted ?? []).map((e, i) => ({ ...e, i }));
  const craftedCards = crafted.map((e) => `<div class="card crafted">
      ${icon(e.item, 'icon', 0, e.col)}
      <b>${esc(ITEMS[e.item as ItemKey]?.name ?? e.item)}</b>
      <button data-act="placeCrafted" data-v="${e.i}">Place</button>
      ${craftedPrice(e.item) ? `<button class="off small" data-act="sellCrafted" data-v="${e.i}">Sell ${coin()} ${craftedPrice(e.item)}</button>` : ''}
      <button class="off small" data-act="giftCrafted" data-v="${e.i}">Gift</button>
    </div>`).join('');
  return `${roomPicker(mine)}${selBar}${craftBar}<p class="hint">${hint}</p>
    ${crafted.length ? `<h3>Handmade</h3><div class="grid">${craftedCards}</div>` : ''}
    ${inv.length ? `<h3>Storage</h3>${filter}<div class="grid">${shown.map(([k, n]) => `<div class="card${placing === k ? ' on' : ''}"><b>${ITEMS[k as ItemKey].name} ×${n}</b>${icon(k)}<button data-act="place" data-v="${k}">Place</button>${sellPrice(k) ? `<button class="off small" data-act="sell" data-v="${k}">Sell ${coin()} ${sellPrice(k)}</button>` : ''}${members.some((m) => m.id !== myId) ? `<button class="off small" data-act="giftItem" data-v="${k}">Gift</button>` : ''}</div>`).join('')}</div>` : '<p class="hint">Storage is empty. Visit the Shop!</p>'}
    <h3>Wallpaper</h3>${swatches('wallpaper', WALLPAPERS, myRoom()!.wallColor ?? myRoom()!.wallpaper, false, false)}<button class="swatch custom" data-act="paintroom" data-v="wall" title="Custom wall colour" aria-label="Custom wall colour" style="background:${CUSTOM_SWATCH}"></button>
    <h3>Pattern</h3>${tilePicker('pattern', WALL_PATTERNS, myRoom()!.pattern ?? 'plain', 'wall', myRoom()!.wallColor ?? myRoom()!.wallpaper)}
    <h3>Floor</h3>${swatches('floor', FLOORS, myRoom()!.floorColor ?? myRoom()!.floor, false, false)}<button class="swatch custom" data-act="paintroom" data-v="floor" title="Custom floor colour" aria-label="Custom floor colour" style="background:${CUSTOM_SWATCH}"></button>
    <h3>Floor style</h3>${tilePicker('floorStyle', FLOOR_STYLES, myRoom()!.floorStyle ?? 'planks', 'floor', myRoom()!.floorColor ?? myRoom()!.floor)}
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
    return `${tabs}<div class="row">${seg('scope', boardScope, [['house', 'My house'], ['friends', 'Friends'], ['all', 'Everyone']])}
        ${seg('period', boardPeriod, [['week', 'This week'], ['all', 'All time']])}</div>
      ${!rows ? '<p class="hint">Loading…</p>' : `<ol class="board">${rows.map((r, i) =>
        `<li class="${r.me ? 'me' : ''}"><span class="rank">${medal(i)}</span><b>${esc(r.name)}${r.me ? ' (you)' : ''}</b>${r.members ? ` <small>(${r.members} members)</small>` : ''}<span>${hm(r.minutes)}</span></li>`).join('')}</ol>`}
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

// Housemates whose session I can still join: running, not paused, at least a minute left (the server checks the same).
const joinable = () => members.filter((o) => o.id !== myId && o.focus && !o.focus.pausedAt && o.focus.endsAt - Date.now() >= 60_000);

// The Guide: one card per system, expanded in place. A card shows its blurb, then its item rows or,
// for `start`, its numbered steps. Items the catalog no longer knows are skipped rather than thrown.
function guideBody() {
  return `<div class="guide">${GUIDE_SECTIONS.filter((s) => (s.items ?? []).every((r) => ITEMS[r.item as ItemKey])).map((s) => {
    const open = guideOpen === s.id;
    const rows = (s.items ?? []).filter((r) => ITEMS[r.item as ItemKey]);
    return `<div class="guide-card${open ? ' open' : ''}">
      <button class="guide-head" data-act="guide" data-v="${s.id}" aria-expanded="${open}"><b>${esc(s.title)}</b><span class="chev">${open ? '▾' : '▸'}</span></button>
      ${open ? `<div class="guide-body"><p>${esc(s.blurb)}</p>
        ${s.steps ? `<ol class="guide-steps">${s.steps.map((t) => `<li>${t}</li>`).join('')}</ol>` : ''}
        ${rows.length ? `<ul class="guide-items">${rows.map((r) => `<li>${icon(r.item)}<div><b>${esc(ITEMS[r.item as ItemKey].name)}</b><p>${esc(r.text)}</p></div></li>`).join('')}</ul>` : ''}
      </div>` : ''}
    </div>`;
  }).join('')}</div>
    <div class="guide-foot"><button type="button" data-act="tour">Take the tour again</button></div>`;
}

function panelBody(mine: Member) {
  if (openPanel === 'guide') return guideBody();
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
      : `${tomatoes()}${streakLine()}${againButton()}${joinable().map((o) => `<div class="invite"><span>📚 <b>${esc(o.name)}</b> is studying <b>${esc(o.focus!.tag ?? 'Study')}</b>, ${fmt(o.focus!.endsAt - Date.now())} left.</span>
           <button data-act="joingroup" data-v="${o.id}">Join them</button></div>`).join('')}
         ${toggleSec('What are you studying?', `<div class="row"><input id="tag" maxlength="24" placeholder="Study" value="${esc(lastTag)}" aria-label="Subject">
           <button class="off" data-act="tagsave" title="Save as a quick pick">★ Save</button></div>
         ${subjectChips()}`, true)}
<h3>How long?</h3>
          <div class="tiles lengths">${FOCUS_LENGTHS.map((n) => `<button class="tile" data-act="focus" data-v="${n}"><b>${n}</b><small>min</small><span class="reward">+${n} ${coin()}</span></button>`).join('')}</div>
          <div class="row custom-len"><input id="customLen" type="number" min="10" max="180" step="5" inputmode="numeric" placeholder="Custom" aria-label="Custom length in minutes" aria-describedby="customHint">
            <span id="customHint" class="hint">min · multiple of 5, 10 to 180</span><button data-act="focuscustom">Start</button></div>
          <p class="hint center">You'll walk to your desk and study until the timer ends. Study at the same time as housemates for +25% coins each, up to ×2.</p>
          <h3>Session templates</h3>
          <div class="tiles templates small">${SESSION_TEMPLATES.map((t) => `<button class="tile" data-act="focustemplate" data-v="${t.id}"><b>${t.name}</b><small>${t.work}min work / ${t.break}min break</small><span class="reward">${t.sessions} sessions</span></button>`).join('')}</div>`) + examsHTML(mine);
  }
  if (openPanel === 'shop') return shopBody(mine);
  if (openPanel === 'decorate') return decorateBody(mine);
  if (openPanel === 'avatar') {
    return `<div class="me">${avatarPreview(mine.look)}<div class="me-info">
        <label>Name <input id="name" maxlength="20" pattern="[A-Za-z0-9_.-]{3,20}" title="Also your username: 3–20 letters, numbers, _ . or -" value="${esc(mine.name)}"></label>
        <p class="hint">Total focus: <b>${mine.totalMinutes}</b> min</p>
        <div class="me-actions"><button class="off small-chip" data-act="logout">Log out</button>
        <button class="danger small-chip" data-act="deleteaccount" title="Erase this account and everything in it">Delete account</button>
        <button class="off small-chip" data-act="chimes">${chimes ? '🔔 Sounds on' : '🔕 Sounds off'}</button>
        ${installPrompt ? '<button class="off small-chip" data-act="install">📲 Install app</button>' : ''}
        <a class="hint" href="/privacy.html" target="_blank" rel="noopener">Privacy policy</a></div></div></div>
      ${mine.pets.length ? toggleSec('Pets', `${mine.pets.map((p, slot) => {
        const coats = PETS[p.kind as PetKey]?.coats ?? [];
        const accs = me.petAccs ?? [];
        return `<div class="pet-row"><span class="pet-chip">${petIcon(p.kind, 'chip-icon', p.coat, p.acc)}<input class="pet-name" data-slot="${slot}" maxlength="16" value="${esc(p.name ?? '')}" placeholder="${PETS[p.kind as PetKey]?.name ?? p.kind}" aria-label="Pet name"></span>
          <button class="${p.away ? 'off' : 'on'} small-chip" data-act="petshow" data-slot="${slot}" data-v="${p.away ? 'in' : 'out'}" aria-pressed="${!p.away}" title="Show this pet in your room">${p.away ? 'Hidden' : 'In room'}</button>
          <small class="hint" title="Grows with every focus minute this pet spends in your room">♥ Bond ${bondLevel(p.bond)}/5</small>
          <button class="danger small-chip" data-act="petrelease" data-slot="${slot}" title="Let this pet go for good">Release</button>
          ${coats.length ? `<div class="swatches">${coats.map((c, k) => `<button class="swatch${(p.coat ?? 0) === k ? ' on' : ''}" style="background:${c}" data-act="petcoat" data-slot="${slot}" data-v="${k}" aria-label="Coat ${k + 1}"></button>`).join('')}</div>` : ''}
          ${accs.length ? `<div class="row">${['', ...accs].map((a) => `<button class="${(p.acc ?? '') === a ? 'on' : 'off'}" data-act="petacc" data-slot="${slot}" data-v="${a}">${a ? PET_ACCS[a as keyof typeof PET_ACCS].name : 'None'}</button>`).join('')}</div>` : ''}</div>`;
      }).join('')}${(me.petAccs ?? []).length ? '' : '<p class="hint">Get bows, hats and more for your pets in Shop → Pet style.</p>'}<p class="hint">Tap your pet in the room to have it follow you. Study with it out to grow your bond: bonded pets do tricks and sometimes find coins.</p>`, true) : ''}
      <div class="center"><button class="off" data-act="randomlook">🎲 Randomize look</button></div>
      ${toggleSec('Body type', lookTiles('body', BODIES, mine.look))}
      ${toggleSec('Height', lookTiles('size', SIZES, mine.look))}
      ${toggleSec('Skin tone', swatches('skin', SKINS, mine.look.skin, false, false))}
      ${toggleSec('Hair', `<h4>Hair style</h4>${lookTiles('style', STYLES, mine.look, true)}<h4>Hair colour</h4>${swatches('hair', HAIRS, mine.look.color?.hair ?? mine.look.hair)}`, true)}
      ${toggleSec('Face', lookTiles('face', FACES, mine.look, true))}
      ${toggleSec('Accessories', `${accTiles(ACCESSORIES, mine.look)}${(mine.look.accs ?? []).filter((a) => ACC_TINT.includes(a)).map((a) => accColourRow(a, mine.look)).join('')}`)}
      ${toggleSec('Outfit', `<h4>Outfit</h4>${lookTiles('outfit', OUTFITS, mine.look)}<h4>Outfit colour</h4>${swatches('shirt', SHIRTS, mine.look.color?.shirt ?? mine.look.shirt)}`, true)}`;
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
    <ul class="members">${members.map((m) => `<li><span class="dot${m.online ? ' on' : ''}"></span>${esc(m.name)}${m.id === myId ? ' (you)' : ''}${m.focus ? '<span class="tag">📖 studying</span>' : ''}${m.id !== myId ? `${gifting ? `<button data-act="gift" data-v="${m.id}" title="Send ${esc(m.name)} the ${esc(gifting.kind === 'crafted' ? (ITEMS[me.crafted?.[gifting.index]?.item as ItemKey]?.name ?? 'piece') : ITEMS[gifting.item as ItemKey].name)}">🎁</button>` : `<button class="off small" data-act="gift" data-v="${m.id}" title="Send ${esc(m.name)} ${GIFT_COINS} coins">🎁 ${GIFT_COINS}</button>`}<button class="off small" data-act="noteto" data-v="${m.id}" aria-label="Leave ${esc(m.name)} a note">✉️</button>` : ''}${!away && m.id !== myId ? `<button class="off small" data-act="kick" data-v="${m.id}">Remove</button>` : ''}</li>`).join('')}</ul>
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
  chromeDirty();
  const mine = myMember();
  if (!openPanel || isSide(openPanel) || !mine) { panel.hidden = true; return; }
  const th = THEMES[openPanel];
  const scroll = panel.querySelector('.pb')?.scrollTop ?? 0;
  const railX = panel.querySelector('.rail')?.scrollLeft ?? 0; // keep the swiped category strip where it was
  // A house update (any housemate's action) rebuilds the panel: keep the box being typed in, its text and cursor.
  const typing = ui.activeElement instanceof HTMLInputElement && panel.contains(ui.activeElement) ? ui.activeElement : null;
  const typingAt = typing?.id ? `#${typing.id}` : typing?.dataset.slot ? `.${typing.className}[data-slot="${typing.dataset.slot}"]` : null;
  const typed = typing && { value: typing.value, start: typing.selectionStart, end: typing.selectionEnd };
  panel.hidden = false;
  panel.style.setProperty('--theme', th.color);
  panel.innerHTML = `<header class="ph"><img src="${uiIconURL(th.icon)}" alt=""><h2>${th.title}</h2>
    <button class="close" data-act="close" aria-label="Close">✕</button></header><div class="pb">${panelBody(mine)}</div>`;
  panel.querySelector('.pb')!.scrollTop = scroll;
  const rail = panel.querySelector<HTMLElement>('.rail');
  if (rail) rail.scrollLeft = railX;
  const again = typingAt && typed ? panel.querySelector<HTMLInputElement>(typingAt) : null;
  if (again && typed) {
    again.value = typed.value;
    again.focus();
    try { again.setSelectionRange(typed.start, typed.end); } catch { /* date and number boxes have no cursor */ }
  }
  // A typed length shows what it pays as you type, and Enter starts it.
  const custom = panel.querySelector<HTMLInputElement>('#customLen'), hint = panel.querySelector('#customHint');
  const showPay = () => {
    const n = Number(custom!.value);
    hint!.innerHTML = custom!.value === '' ? 'min · multiple of 5, 10 to 180' : isFocusLength(n) ? `min · earns <b>+${n}</b> ${coin()}` : 'min · needs a multiple of 5, 10 to 180';
  };
  custom?.addEventListener('input', showPay);
  custom?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); panel.querySelector<HTMLButtonElement>('[data-act="focuscustom"]')?.click(); } });
  if (custom?.value) showPay(); // kept through a rebuild
  const tagInput = panel.querySelector<HTMLInputElement>('#tag');
  tagInput?.addEventListener('input', () => { lastTag = tagInput.value; });
  tagInput?.addEventListener('keydown', (e) => { // Enter saves the subject, like ★ Save
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); panel.querySelector<HTMLButtonElement>('[data-act="tagsave"]')?.click(); }
  });
  const nameInput = panel.querySelector<HTMLInputElement>('#name');
  nameInput?.addEventListener('change', () => send({ t: 'look', name: nameInput.value, look: mine.look }));
  panel.querySelectorAll<HTMLInputElement>('.pet-name').forEach((i) => i.addEventListener('change', () => send({ t: 'pet_style', slot: Number(i.dataset.slot), name: i.value })));
}

panel.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
  const mine = myMember();
  if (!b || !mine) return;
  const v = b.dataset.v!;
  const room = myRoom()!;
  switch (b.dataset.act) {
    case 'close': setPanel(null); break;
    case 'focuscustom': {
      const n = Number(panel.querySelector<HTMLInputElement>('#customLen')?.value);
      if (!isFocusLength(n)) { toast('Pick a multiple of 5 minutes, from 10 to 180.', 'error'); break; }
      b.dataset.v = String(n); // then start it like any other length
    }
    // falls through
    case 'focustemplate': {
      const template = SESSION_TEMPLATES.find((t) => t.id === v);
      if (!template) break;
      lastTag = panel.querySelector<HTMLInputElement>('#tag')?.value.trim() ?? '';
      localStorage.setItem('auralis.tag', lastTag);
      endBreak();
      if (window.Notification?.permission === 'default') Notification.requestPermission();
      // Start the first session
      send({ t: 'focus_start', minutes: template.work, tag: lastTag || template.name, tz: new Date().getTimezoneOffset() });
      // Store template for auto-continue
      localStorage.setItem('auralis.template', v);
      localStorage.setItem('auralis.templateSession', '1');
      setPanel(null);
      break;
    }
    case 'focus': {
      const v = b.dataset.v!;
      lastTag = panel.querySelector<HTMLInputElement>('#tag')?.value.trim() ?? '';
      localStorage.setItem('auralis.tag', lastTag);
      localStorage.setItem('auralis.length', v);
      endBreak();
      if (window.Notification?.permission === 'default') Notification.requestPermission(); // to say when the session ends in a background tab
      send({ t: 'focus_start', minutes: Number(v), tag: lastTag || 'Study', tz: new Date().getTimezoneOffset() });
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
    case 'petshow': send({ t: 'pet_style', slot: Number(b.dataset.slot), away: v === 'out' }); break;
    case 'adopt': send({ t: 'adopt', kind: v }); toast(`${petIcon(v)} Welcome home, <b>${PETS[v as PetKey].name}</b>!`, 'reward'); break;
    case 'addroom': send({ t: 'add_room' }); editRoom = mine.rooms.length; toast('A new room! Find it next to your others.', 'reward'); break;
    case 'editroom': editRoom = Number(v); moving = null; placing = null; renderPanel(); break;
    case 'expand': send({ t: 'expand', r: editRoom }); toast('Your room just got bigger!', 'reward'); break;
    case 'sellroom': { // two taps: the room and its decor go, and the pieces land in Decorate
      const back = `${coin()} ${ROOM_COST[editRoom]} back`;
      if (!b.classList.contains('armed')) {
        b.classList.add('armed');
        b.textContent = 'Tap again to sell';
        setTimeout(() => { b.classList.remove('armed'); b.innerHTML = back; }, 3000);
      } else {
        send({ t: 'sell_room', r: editRoom });
        editRoom = 0; moving = null; placing = null;
        toast('Room sold — everything in it is back in your Storage.', 'reward');
      }
      break;
    }
    case 'place': placing = v as ItemKey; placingCrafted = -1; moving = null; renderPanel(); break;
    case 'placeCrafted': {
      const piece = me.crafted?.[Number(v)];
      if (!piece) return;
      placing = piece.item as ItemKey; placingCrafted = Number(v); moving = null; renderPanel();
      return;
    }
    case 'giftCrafted': {
      const piece = me.crafted?.[Number(v)];
      if (!piece || !members.some((m) => m.id !== myId)) return;
      setPanel('house');
      toast(`Pick a housemate to send the ${esc(ITEMS[piece.item as ItemKey]?.name ?? 'piece')} to.`);
      gifting = { kind: 'crafted', index: Number(v) };
      renderPanel();
      return;
    }
    case 'giftItem': {
      const item = ITEMS[v as ItemKey];
      if (!item) return;
      setPanel('house');
      toast(`Pick a housemate to send the ${esc(item.name)} to.`);
      gifting = { kind: 'item', item: v };
      renderPanel();
      return;
    }
    case 'craft': {
      if (moving === null) return;
      const f = myRoom()?.furniture[moving];
      if (!f || !CRAFT[f.item as keyof typeof CRAFT]) return;
      if (myReady(f, editRoom, moving)) { toast(`⏳ Ready ${fmt(myReady(f, editRoom, moving) - Date.now())} from now.`); return; }
      send({ t: 'craft', owner: myId, r: editRoom, index: moving, keep: true });
      return;
    }
    case 'putaway': if (moving !== null) send({ t: 'pickup', r: editRoom, index: moving }); moving = null; renderPanel(); break;
    case 'deselect': moving = null; renderPanel(); break;
    case 'flip': if (moving !== null) send({ t: 'flip', r: editRoom, index: moving }); break;
    case 'rotate': if (moving !== null && canRotate(myRoom()?.furniture[moving]?.item ?? '')) send({ t: 'turn', r: editRoom, index: moving }); break;
    case 'storeShelf': storeShelf = v; renderPanel(); break;
    case 'sell': { // two taps, so nothing gets sold by a stray click
      const gain = sellPrice(v);
      if (!b.classList.contains('armed')) {
        b.classList.add('armed');
        b.textContent = `Tap to sell for ${gain}`;
        setTimeout(() => { if (b.isConnected) renderPanel(); }, 3000);
      } else {
        send({ t: 'sell', item: v });
        toast(`Sold the <b>${ITEMS[v as ItemKey].name}</b> for ${gain} ${coin()}.`);
      }
      break;
    }
    case 'sellCrafted': { // handmade or gifted pieces: one instance, a quarter of catalog price
      const piece = me.crafted?.[Number(v)];
      const gain = craftedPrice(piece?.item ?? '');
      if (!piece || gain < 1) return;
      // Read the name before sending: the state that comes back has already dropped the piece.
      const name = ITEMS[piece.item as ItemKey]?.name ?? 'piece';
      if (!b.classList.contains('armed')) {
        b.classList.add('armed');
        b.textContent = `Tap to sell for ${gain}`;
        setTimeout(() => { if (b.isConnected) renderPanel(); }, 3000);
      } else {
        send({ t: 'sell_crafted', index: Number(v) });
        toast(`Sold the handmade <b>${name}</b> for ${gain} ${coin()}.`);
      }
      break;
    }
    case 'recolor': if (moving !== null) send({ t: 'restyle', r: editRoom, index: moving, v: Number(v) }); break;
    case 'paintfurn': {
      const index = moving;
      const cur = (index !== null ? myRoom()!.furniture[index] : null)?.col ?? '#ffffff';
      pickColor(cur, (hex) => { if (index !== null) send({ t: 'paint', r: editRoom, index, col: hex }); });
      break;
    }
    case 'paintroom': {
      const wall = b.dataset.v === 'wall';
      const cur = wall ? (myRoom()!.wallColor ?? '#ffffff') : (myRoom()!.floorColor ?? '#ffffff');
      pickColor(cur, (hex) => {
        const r = myRoom()!; // read fresh: the panel may have been rebuilt while the picker was open
        send({ t: 'room', r: editRoom, wallpaper: r.wallpaper, floor: r.floor, pattern: r.pattern, floorStyle: r.floorStyle, [wall ? 'wallColor' : 'floorColor']: hex });
      });
      break;
    }
    case 'shape': if (moving !== null) send({ t: 'shape', r: editRoom, index: moving, s: Number(v) }); break;
    case 'wallpaper': case 'floor': case 'pattern': case 'floorStyle':
      // A preset replaces any custom paint of that surface; a pattern or floor-style change keeps it. Empty string
      // tells the server to drop the custom colour, which must happen even when the preset is the one already stored.
      send({ t: 'room', r: editRoom, wallpaper: room.wallpaper, floor: room.floor, pattern: room.pattern, floorStyle: room.floorStyle, [b.dataset.act]: v,
        ...(b.dataset.act === 'wallpaper' ? { wallColor: '' } : b.dataset.act === 'floor' ? { floorColor: '' } : {}) }); break;
    case 'skin': case 'hair': case 'shirt': {
      // A swatch replaces any custom tint on that one part; hair and outfit keep theirs.
      const color = { ...mine.look.color };
      delete color[b.dataset.act as string];
      send({ t: 'look', name: mine.name, look: { ...mine.look, [b.dataset.act]: v, color } });
      break;
    }
    case 'style': case 'face': case 'outfit': case 'body': case 'size':
      send({ t: 'look', name: mine.name, look: { ...mine.look, [b.dataset.act]: v, color: mine.look.color } }); break;
    case 'acc': { // several can be worn at once; 'none' clears them
      const worn = mine.look.accs ?? [];
      const accs = v === 'none' ? [] : worn.includes(v) ? worn.filter((a) => a !== v) : [...worn, v];
      send({ t: 'look', name: mine.name, look: { ...mine.look, accs, color: mine.look.color } }); break;
    }
    case 'acccol': // a shade for this one accessory
      send({ t: 'look', name: mine.name, look: { ...mine.look, color: { ...mine.look.color, [`acc:${b.dataset.acc}`]: v } } }); break;
    case 'accpick': {
      const a = b.dataset.v!;
      pickColor(mine.look.color?.[`acc:${a}`] ?? ACC_COL[a] ?? '#5a5070', (hex) => {
        const m = myMember()!;
        send({ t: 'look', name: m.name, look: { ...m.look, color: { ...m.look.color, [`acc:${a}`]: hex } } });
      });
      break;
    }
    case 'pickcolor': {
      const key = b.dataset.v!;
      const cur = mine.look.color?.[key] ?? (key === 'skin' ? SKINS[0] : key === 'hair' ? HAIRS[0] : SHIRTS[0]);
      pickColor(cur, (hex) => {
        const m = myMember()!; // read fresh: another shade may have been sent while the picker was open
        send({ t: 'look', name: m.name, look: { ...m.look, color: { ...m.look.color, [key]: hex } } });
      });
      break;
    }
    case 'randomlook': send({ t: 'look', name: mine.name, look: randomLook() }); break;
    case 'copy': copyCode(); break;
    case 'join': send({ t: 'join', code: panel.querySelector<HTMLInputElement>('#join')!.value.trim() }); break;
    case 'home': send({ t: 'leave' }); break;
    case 'copyhome': copyCode(me.home); break;
    case 'rejoin': send({ t: 'join', code: v }); break;
    case 'forget': send({ t: 'forget', code: v }); break;
    case 'unban': send({ t: 'unban', id: v }); break;
    case 'guide':
      guideOpen = guideOpen === v ? null : v;
      renderPanel();
      break;
    case 'tour': { // the tour is the same words at the moment they matter, and this is where to ask for them again
      const mine = tourSteps(myThings());
      openTour(mine.length ? mine.map((s) => ({ item: s.item, text: s.text })) : GUIDE_START.map((text) => ({ text, html: true })));
      break;
    }
    case 'petrelease': // two taps: a pet can't be brought back
      if (!b.classList.contains('armed')) {
        b.classList.add('armed');
        b.textContent = 'Tap again to release';
        setTimeout(() => { b.classList.remove('armed'); b.textContent = 'Release'; }, 3000);
      } else send({ t: 'pet_release', slot: Number(b.dataset.slot) });
      break;
    case 'kick': // two taps, so nobody gets removed by a stray click
      if (!b.classList.contains('armed')) {
        b.classList.add('armed');
        b.textContent = 'Tap again';
        setTimeout(() => { b.classList.remove('armed'); b.textContent = 'Remove'; }, 3000);
      } else send({ t: 'kick', id: v });
      break;
    case 'logout': signOut(true); break;
    case 'deleteaccount': void deleteAccount(); break;
    case 'chimes':
      chimes = !chimes;
      localStorage.setItem('auralis.chimes', chimes ? 'on' : 'off');
      if (chimes) chime();
      renderPanel();
      break;
    case 'gift':
      if (gifting?.kind === 'crafted') { send({ t: 'gift_crafted', index: gifting.index, to: v }); gifting = null; break; }
      if (gifting?.kind === 'item') { send({ t: 'gift_item', item: gifting.item, to: v }); gifting = null; break; }
      send({ t: 'gift', to: v });
      break;
    case 'install': installPrompt?.prompt(); installPrompt = null; renderPanel(); break;
    case 'noteto': writeNote(v); break;
    case 'sendnote': {
      const text = panel.querySelector<HTMLInputElement>('#noteText')!.value.trim();
      if (text && noteTo) send({ t: 'note', to: noteTo, text });
      noteTo = null;
      renderPanel();
      break;
    }
    case 'joingroup': send({ t: 'focus_join', id: v, tz: new Date().getTimezoneOffset() }); setPanel(null); break;
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
// Coffee and wine ride on the tea animation but do something else, so they say what they do.
const DRINK_LABELS: Record<string, string> = {
  coffeeMachine: 'Brew a coffee',
  coffee: 'Drink the coffee',
  energyCan: 'Drink the energy can',
  wine: 'Pour a glass of wine',
};
// The five making pieces all ride on use: 'paint', so they say what they actually make.
const CRAFT_LABELS: Record<string, string> = {
  potteryWheel: 'Make pottery',
  easel: 'Paint something',
  loom: 'Weave a rug',
  craftTable: 'Make a craft',
  sewingTable: 'Sew a plush',
};
const ACT_LABELS: Record<string, string> = { sit: 'Sit', sleep: 'Nap (5-min break)', bounce: 'Bounce', lift: 'Work out', pullup: 'Pull-ups', run: 'Run', punch: 'Box', bike: 'Ride', stretch: 'Stretch' };
const USE_LABELS: Record<string, string> = {
  water: 'Water', read: 'Study here', snack: 'Snack (2-min break)', tea: 'Tea (2-min break)', primp: 'Change your look', dress: 'Change your look',
  stargaze: 'Stargaze', feed: 'Feed the pets', sing: 'Sing', music: 'Play music', strum: 'Play guitar', drum: 'Drum', dj: 'DJ', warm: 'Warm up', wind: 'Wind it up',
};
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

// A housemate studying at the tile (or just under their timer bubble), if any.
// A housemate (online, not me) standing on this tile, or with their head on it.
function friendAt(tx: number, ty: number) {
  return members.find((m) => {
    const a = avatars.get(m.id);
    return m.id !== myId && m.online && a && Math.round(a.tx) === tx && (Math.round(a.ty) === ty || Math.round(a.ty) - 1 === ty);
  });
}

// What clicking this tile would do, in a few words (null: just walk there). Mirrors the click handler.
function clickLabel(tx: number, ty: number): string | null {
  if (tx < 0 || ty < 0 || tx >= grid.w || ty >= grid.h) return null;
  const friend = friendAt(tx, ty), mine = myMember()?.focus;
  if (friend) return friend.focus ? `Cheer ${friend.name} on 👏` : mine ? `Invite ${friend.name} to study with you 📚` : `High five ${friend.name} ✋`;
  const wi = windowAt(tx, ty);
  if (wi >= 0) return `${curtainsOf(slots[wi].m, slots[wi].ri, slots[wi].room) ? 'Open' : 'Close'} curtains${slots[wi].m.id === myId ? '' : ' (just for you)'}`;
  const si = grid.owner[ty * grid.w + tx] ?? -1, hit = slots[si];
  const fi = hit ? furnitureAt(hit.room, tx - grid.origins[si].x, ty - grid.origins[si].y) : -1;
  if (fi < 0) return null;
  const f = hit.room.furniture[fi], it = ITEMS[f.item as ItemKey] as { table?: boolean; act?: string; use?: string };
  const sound = soundName(f.item) ? ` · 🔊 ${soundName(f.item)}` : '';
  if (f.item === 'deskCalendar') return examLabel(hit.m);
  if (hit.m.id !== myId && it.table) return `Leave ${hit.m.name} a note`;
  if (LIGHTS.has(f.item) && members.some((m) => m.id === hit.m.id)) return f.off ? 'Lights on' : 'Lights off';
  if (f.item === 'giftBox') return 'Send a gift';
  if (PET_SLEEP_FURNITURE.has(f.item)) return 'Put a pet to sleep';
  if (f.item === 'whiteboard') return 'House to-dos';
  if (f.item === 'clawMachine') return myReady(f, hit.ri, fi) ? `Claw (ready ${fmt(myReady(f, hit.ri, fi) - Date.now())})` : `Play the claw · ${CLAW_COST} coins`;
  const craft = CRAFT[f.item as keyof typeof CRAFT];
  if (craft) {
    // A tip is plain text, so no coin() markup here: just whether it is ready. Each piece makes one of its own
    // things at random, so there is nothing to choose.
    const what = CRAFT_LABELS[f.item] ?? 'Make something';
    const ready = myReady(f, hit.ri, fi);
    return ready ? `${what} (ready ${fmt(ready - Date.now())})` : `${what} · free`;
  }
  const drink = DRINKS[f.item as keyof typeof DRINKS] as { caffeine?: number; rest?: number } | undefined;
  if (drink) {
    // Already caffeinated: say how long is left, so the top-up is not a surprise.
    const left = drink.caffeine && caffeinated(myMember()) ? ` · ${fmt((myMember()!.caffeineUntil ?? 0) - Date.now())} left` : '';
    const does = drink.caffeine ? `${drink.caffeine}-min caffeine` : `${drink.rest ?? 2}-min rest`;
    return `${DRINK_LABELS[f.item] ?? 'Drink'} · ${does}${left}`;
  }
  if (TVS.has(f.item)) return 'Watch together';
  if (it.act) return ACT_LABELS[it.act] ?? cap(it.act);
  if (it.use) return (USE_LABELS[it.use] ?? cap(it.use)) + sound;
  return sound ? sound.slice(3) : null;
}

const tip = document.createElement('div');
tip.id = 'tip';
tip.hidden = true;
ui.body.append(tip);
let tipTimer = 0;
function showTip(text: string | null, x = 0, y = 0, ms = 0) {
  clearTimeout(tipTimer);
  tip.hidden = !text;
  if (!text) return;
  tip.textContent = text;
  tip.style.left = `${Math.min(x, win.innerWidth - tip.offsetWidth - 8)}px`;
  tip.style.top = `${y}px`;
  if (ms) tipTimer = window.setTimeout(() => { tip.hidden = true; }, ms);
}
canvas.addEventListener('pointerleave', () => { showTip(null); hoverPet = null; });

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
const toggleSec = (title: string, body: string, open = false) =>
  `<details class="me-sec"${open ? ' open' : ''}><summary>${esc(title)}</summary><div class="me-sec-body">${body}</div></details>`;

function examsHTML(mine: Member) {
  const list = mine.exams ?? [];
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const body = `${list.length ? `<ul class="members">${list.map((x, i) => `<li><span class="who"><b>${esc(x.subject)}</b> ${daysTo(x.date)}</span>
      <button class="off small" data-act="examdel" data-v="${i}" aria-label="Remove ${esc(x.subject)}">✕</button></li>`).join('')}</ul>` : ''}
    <div class="row"><input id="examSubject" maxlength="24" placeholder="Subject" aria-label="Exam subject"><input id="examDate" type="date" min="${today}" aria-label="Exam date"><button data-act="examadd">Add</button></div>
    <p class="hint">A desk calendar (Shop → Decor) shows your next exam to housemates.</p>`;
  return toggleSec('Exam countdown', body, !!list.length);
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

// ---------- first visit: the tour, with the Guide's first card waiting behind it ----------
function welcome() {
  if (localStorage.getItem('auralis.tour')) return;
  localStorage.setItem('auralis.tour', 'done');
  guideOpen = 'start';
  setPanel('guide');
  // The item tour may have opened during the same second: it has already spoken, so the five welcome steps
  // wait for the button instead of talking over it.
  if (shownHere.size || tourRows.length) return;
  // A new player owns nothing worth a tip yet, so they get the five welcome steps instead.
  openTour(GUIDE_START.map((text) => ({ text, html: true })));
}

const requestBoard = () => send({ t: 'leaderboard', scope: boardScope, period: boardPeriod });

// To-dos and chat open from the dock as a card above it, one at a time.
const isSide = (name: string | null): name is SideCard => name === 'todos' || name === 'chat';
function setPanel(name: string | null) {
  chromeDirty();
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
  ui.querySelectorAll<HTMLButtonElement>('#dock button').forEach((x) => x.classList.toggle('on', x.dataset.panel === name));
  $<HTMLButtonElement>('#help').classList.toggle('on', name === 'guide');
  ui.body.classList.toggle('side-open', isSide(name));
  ui.body.dataset.side = isSide(name) ? name : '';
  if (isSide(name) && folds[name]) toggleFold(name);
  if (name === 'chat') { chatOpen = false; renderSide(); } // opens on the list of conversations
  renderPanel();
  ui.body.classList.toggle('panel-open', !panel.hidden);
  tickTimers(); // opening a panel swaps the focus deck for the HUD timer, and closing it brings it back
}
ui.querySelectorAll<HTMLButtonElement>('#dock button').forEach((b) =>
  b.addEventListener('click', () => {
    if (b.dataset.panel === 'focus' && myMember()?.focus) { deckHidden = false; tickTimers(); return; }
    const card = b.dataset.panel!;
    setPanel(openPanel === card ? null : card);
  }));
$<HTMLButtonElement>('#help').addEventListener('click', () => setPanel(openPanel === 'guide' ? null : 'guide'));

// ---------- shared to-dos, private to-dos and chat ----------
// "Everyone" to-dos show my own tick, and are crossed off only once the whole house has ticked them.
const fmtDue = (at: number) => new Date(at).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
// Finished to-dos fold away under one header, so the card reads as what is left to do and still says how much
// is behind the fold. The fold is remembered for the session: a rebuild of the list leaves it as it was.
let doneOpen = false;
function todoHTML(list: Todo[]) {
  if (!list.length) return '<li class="empty">Nothing to do yet ✨</li>';
  const row = (t: Todo) => {
    const shared = !t.mine && !t.all && !t.to; // older house to-dos: one tick for everyone
    const who = t.all ? members : members.filter((m) => t.to?.includes(m.id));
    const ticked = t.mine || shared ? t.done : !!t.ticks?.includes(myId);
    const canTick = t.mine || shared || who.some((m) => m.id === myId);
    const late = t.at && !t.done && t.at < Date.now();
    const priorityIcon = t.priority === 'high' ? '🔴' : t.priority === 'low' ? '🔵' : '';
    const pills = [
      t.at ? `<span class="due${late ? ' late' : ''}">⏰ ${fmtDue(t.at)}</span>` : '',
      t.priority ? `<span class="pill priority-${t.priority}">${priorityIcon} ${t.priority}</span>` : '',
      t.mine ? '<span class="pill">🔒 just you</span>' : t.all ? '<span class="pill all">👥 everyone</span>' : '',
      t.repeat ? `<span class="pill repeat">🔁 ${t.repeat}${t.repeatUntil ? ` until ${new Date(t.repeatUntil).toLocaleDateString()}` : ''}</span>` : '',
      ...who.map((m) => { const done = t.ticks?.includes(m.id); return `<span class="pill${done ? ' ticked' : ''}">${done ? '✓ ' : ''}${esc(m.name)}</span>`; }),
    ].join('');
    const from = t.byId && t.byId !== myId ? `<small>from ${esc(t.by)}</small>` : shared && t.by ? `<small>${esc(t.by)}</small>` : '';
    const mine = t.mine ? ' data-mine="1"' : '';
    return `<li class="${t.done ? 'done todo-done-item' : ''}"${t.done && !doneOpen ? ' hidden' : ''}>
      <button class="check${ticked && !t.done ? ' mine' : ''}" data-todo="toggle" data-id="${t.id}"${mine} aria-label="${ticked ? 'Untick' : 'Tick'}"${canTick ? '' : ' disabled title="Only the people it\'s for can tick it"'}>${ticked ? '✓' : ''}</button>
      <span class="todo-text">${esc(t.text)}${from}${pills ? `<span class="todo-meta">${pills}</span>` : ''}</span>
      ${t.byId === myId ? `<button class="del" data-todo="edit" data-id="${t.id}" aria-label="Edit" title="Edit">✎</button>` : ''}
      ${t.mine || !t.byId || t.byId === myId ? `<button class="del" data-todo="del" data-id="${t.id}"${mine} aria-label="Delete">✕</button>` : ''}</li>`;
  };
  const open = list.filter((t) => !t.done), done = list.filter((t) => t.done);
  const fold = !done.length ? '' : `<li class="todo-done-head"><button type="button" class="todo-fold" data-todo-group="done" aria-expanded="${doneOpen}" aria-label="${doneOpen ? 'Hide' : 'Show'} completed tasks"><span class="chev">${doneOpen ? '▾' : '▸'}</span>Completed tasks <b>${done.length}</b></button></li>`;
  return (open.length ? open.map(row).join('') : done.length ? '<li class="empty">Nothing left to do ✨</li>' : '')
    + fold + done.map(row).join('');
}

// Private threads: unread counts per housemate, and the highest message id seen.
const dmUnread: Record<string, number> = {};
const dmSeen: Record<string, number> = {};
let dmReady = false;

// Mute threads: thread -> until (0 = forever, timestamp = temporary)
const mutedThreads = new Map<string, number>();
// Threads I muted or unmuted myself this session: my choice outranks older state messages still on the wire.
const muteChosen = new Set<string>();

// Chat colors/themes per thread
const CHAT_PALETTE = ['#f48a8a', '#ffd27a', '#8fd0a8', '#7fb2e8', '#b89af0', '#f4a6b8', '#f2b48a', '#9db4ee', '#d9a06a', '#cfe1f7', '#fff4e6', '#e8e3dc'];
const threadThemes = new Map<string, string>();

// Typing indicator state
const typingTimers = new Map<string, number>();
let typingThread: { thread: string; users: Map<string, { name: string; at: number }> } | null = null;

// Image gallery state
let galleryOpen = false, galleryIndex = -1, galleryImages: { key: string; at: number; by: string }[] = [];

// Presence/status state
const userPresence = new Map<string, { status: string; custom: string; until: number; at: number }>();
const PRESENCE_TTL = 5 * 60 * 1000;
let myPresenceTimer: number | null = null;

// How far each thread has been read, sent once per new line while the thread is on screen. The server
// stores it on `threads.seen` and passes it back in `me.threadSeen`.
const lastReadSent: Record<string, number> = {};
function markRead(peer: string | null, id: number) {
  const key = threadKey(peer);
  if (!Number.isFinite(id) || (lastReadSent[key] ?? 0) >= id) return;
  lastReadSent[key] = id;
  send({ t: 'read', thread: key, id });
}

function noteNewDms() {
  const threads: [string, Chat[]][] = [...Object.entries(me.dm ?? {}), ...Object.entries(me.groups ?? {}).map(([id, g]) => [`g:${id}`, g.msgs] as [string, Chat[]])];
  for (const [peer, list] of threads) {
    const last = list[list.length - 1];
    if (!last) continue;
    // A brand new thread after the first load is genuinely new, so count it.
    const seen = dmSeen[peer] ?? (dmReady ? 0 : last.id);
    // Remember where every thread stands, even when there is nothing new in it: otherwise the next
    // state would read a thread we already know as unseen and ping once more for old messages.
    dmSeen[peer] = last.id;
    // On screen means read: tell the server, which keeps it on the conversation list and relays it.
    if (viewing(peer)) markRead(peer, last.id);
    if (last.id <= seen) continue;
    const fresh = list.filter((c) => c.id > seen && c.from !== myId).length;
    // Unread unless that thread is open on screen right now.
    const onScreen = viewing(peer);
    if (dmReady) {
      const muted = isMuted(threadKey(peer));
      if (!muted) countUnseen(fresh);
      if (fresh && !onScreen) {
        if (!muted) { pingOrHold(); const g = groupOf(peer), name = g?.name ?? person(peer)?.name ?? 'New message'; sysNotify('dm', name, `${g ? `${last.by}: ` : ''}${last.img ? attachLabel(last.img) : last.text}`); }
        dmUnread[peer] = (dmUnread[peer] ?? 0) + fresh;
        unread = true;
        noteUnreadChat();
      }
    }
  }
  dmReady = true;
}

// ===== NEW CHAT FEATURES =====

// Check if thread is muted: 0 is forever, any other value is the time it runs out.
function isMuted(thread: string): boolean {
  const until = mutedThreads.get(thread);
  return until === 0 || (until !== undefined && Date.now() < until);
}

// Mute a thread: -1 turns notifications back on, 0 mutes for good, a timestamp mutes until then.
function muteThread(thread: string, until: number) {
  muteChosen.add(thread);
  if (until === -1) mutedThreads.delete(thread);
  else mutedThreads.set(thread, until);
  send({ t: 'mute', thread, until });
  syncChatList();
}

// Apply chat theme color
function applyThreadTheme(thread: string) {
  const color = threadThemes.get(thread);
  const log = document.getElementById('chatLog') as HTMLElement | null;
  const input = document.getElementById('chatInput') as HTMLElement | null;
  const form = document.getElementById('chatForm') as HTMLElement | null;
  const accent = color || '';
  for (const el of [log, input, form]) {
    if (!el) continue;
    if (accent) el.style.setProperty('--thread-accent', accent);
    else el.style.removeProperty('--thread-accent');
  }
}

// Get thread theme color
function getThreadTheme(thread: string): string | undefined {
  return threadThemes.get(thread);
}

// Set thread theme
function setThreadTheme(thread: string, color: string) {
  threadThemes.set(thread, color);
  send({ t: 'theme', thread, color });
  applyThreadTheme(thread);
}

// Presence status helpers
const PRESENCE_STATUSES = ['idle', 'focus', 'break', 'afk', 'chat'] as const;
type PresenceStatus = typeof PRESENCE_STATUSES[number];

function setMyPresence(status: PresenceStatus, custom = '', until = 0) {
  const presence = { status, custom, until, at: Date.now() };
  userPresence.set(myId, presence);
  send({ t: 'presence', status, custom, until });
  if (myPresenceTimer) clearInterval(myPresenceTimer);
  if (status && status !== 'idle') {
    myPresenceTimer = window.setInterval(() => send({ t: 'presence', status, custom, until }), 60_000);
  }
}

function getPresence(userId: string) {
  const p = userPresence.get(userId);
  if (!p) return null;
  if (Date.now() - p.at > PRESENCE_TTL) { userPresence.delete(userId); return null; }
  return p;
}

function presenceIcon(status: string, custom: string) {
  switch (status) {
    case 'focus': return `📚 ${custom || 'Focusing'}`;
    case 'break': return `☕ ${custom || 'Break'}`;
    case 'afk': return '🌙 AFK';
    case 'chat': return '💬 Chatting';
    case 'idle': return '🟢 Available';
    default: return custom || '🟢 Available';
  }
}

// Typing indicator
function sendTyping(thread: string, typing: boolean) {
  send({ t: 'typing', thread, typing });
}

function onTypingUpdate(thread: string, user: string, name: string, typing: boolean) {
  if (!typingThread) return;
  if (typingThread.thread !== thread) return;
  if (typing) {
    typingThread.users.set(user, { name, at: Date.now() });
  } else {
    typingThread.users.delete(user);
  }
  renderSide();
}

function typingIndicatorHTML(thread: string): string {
  if (!typingThread || typingThread.thread !== thread) return '';
  const names = [...typingThread.users.values()].filter(u => Date.now() - u.at < 4000).map(u => u.name);
  if (!names.length) return '';
  return names.length === 1 ? `${names[0]} is typing…` : `${names.join(', ')} are typing…`;
}

function activeTypingHTML(thread: string): string {
  const t = typingIndicatorHTML(thread);
  return t ? `<div class="typing-indicator">${t}</div>` : '';
}


// Image Gallery
function collectThreadImages(): { key: string; at: number; by: string }[] {
  return threadMsgs(dmPeer).filter(m => m.img).map(m => ({ key: m.img!, at: m.at, by: m.by }));
}

let galleryKeyHandler: ((e: KeyboardEvent) => void) | null = null;

function openGallery(index: number) {
  galleryImages = collectThreadImages();
  if (!galleryImages.length) return;
  galleryIndex = Math.max(0, Math.min(index, galleryImages.length - 1));
  galleryOpen = true;
  renderGallery();
  document.body.classList.add('gallery-open');
  if (!galleryKeyHandler) {
    galleryKeyHandler = (e: KeyboardEvent) => {
      if (!galleryOpen) return;
      if (e.key === 'Escape') { e.preventDefault(); closeGallery(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); showGalleryImage(galleryIndex - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); showGalleryImage(galleryIndex + 1); }
    };
    document.addEventListener('keydown', galleryKeyHandler);
  }
}

function closeGallery() {
  galleryOpen = false;
  galleryIndex = -1;
  galleryImages = [];
  document.body.classList.remove('gallery-open');
  $('#galleryOverlay')?.remove();
  if (galleryKeyHandler) { document.removeEventListener('keydown', galleryKeyHandler); galleryKeyHandler = null; }
}

function preloadImage(key: string) {
  if (imgLinks.has(key)) return;
  fetch(`${apiBase}/api/chatimg?key=${encodeURIComponent(key)}`, { headers: { authorization: `Bearer ${token}` } })
    .then(r => r.ok ? r.json() : null).then(data => data?.url && imgLinks.set(key, { url: data.url, at: Date.now() })).catch(() => {});
}

function showGalleryImage(index: number) {
  if (!galleryImages.length) return;
  galleryIndex = (index + galleryImages.length) % galleryImages.length;
  renderGallery();
}

function renderGallery() {
  const img = galleryImages[galleryIndex];
  if (!img) return;
  let overlay = document.getElementById('galleryOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'galleryOverlay';
    overlay.innerHTML = `
      <div class="gallery-content">
        <div class="gallery-header">
          <span class="gallery-count"></span>
          <span class="gallery-meta"></span>
          <div><button class="gallery-zoom" title="Zoom">🔍</button><button class="gallery-download" title="Download">⬇</button><button class="gallery-close" title="Close">✕</button></div>
        </div>
        <img class="gallery-img" alt="">
        <div class="gallery-nav"><button class="gallery-prev" aria-label="Previous">←</button><button class="gallery-next" aria-label="Next">→</button></div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.gallery-prev')!.addEventListener('click', (e) => { e.stopPropagation(); showGalleryImage(galleryIndex - 1); });
    overlay.querySelector('.gallery-next')!.addEventListener('click', (e) => { e.stopPropagation(); showGalleryImage(galleryIndex + 1); });
    overlay.querySelector('.gallery-close')!.addEventListener('click', (e) => { e.stopPropagation(); closeGallery(); });
    overlay.querySelector('.gallery-download')!.addEventListener('click', (e) => { e.stopPropagation(); const cur = galleryImages[galleryIndex]; if (cur) downloadAttachment(cur.key); });
    overlay.querySelector('.gallery-zoom')!.addEventListener('click', (e) => { e.stopPropagation(); overlay!.querySelector('.gallery-img')!.classList.toggle('zoomed'); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeGallery(); });
    const galleryImg = overlay.querySelector('.gallery-img') as HTMLImageElement;
    let touchX = 0, touchY = 0;
    galleryImg.addEventListener('touchstart', (e) => { if (e.touches.length === 1) { touchX = e.touches[0].clientX; touchY = e.touches[0].clientY; } }, { passive: true });
    galleryImg.addEventListener('touchend', (e) => {
      const t = e.changedTouches[0]; if (!t) return;
      const dx = t.clientX - touchX, dy = t.clientY - touchY;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) showGalleryImage(galleryIndex + (dx < 0 ? 1 : -1));
    }, { passive: true });
  }
  (overlay.querySelector('.gallery-count') as HTMLElement).textContent = `${galleryIndex + 1} / ${galleryImages.length}`;
  (overlay.querySelector('.gallery-meta') as HTMLElement).textContent = `${img.by} • ${ago(img.at)}`;
  const galleryImg = overlay.querySelector('.gallery-img') as HTMLImageElement;
  galleryImg.classList.remove('zoomed');
  galleryImg.alt = `Picture from ${img.by}`;
  galleryImg.dataset.key = img.key;
  const link = imgLinks.get(img.key);
  if (link?.url) galleryImg.src = link.url;
  else {
    galleryImg.removeAttribute('src');
    fetch(`${apiBase}/api/chatimg?key=${encodeURIComponent(img.key)}`, { headers: { authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null).then(data => {
        if (data?.url) { imgLinks.set(img.key, { url: data.url, at: Date.now() }); if (galleryImages[galleryIndex]?.key === img.key) galleryImg.src = data.url; }
      }).catch(() => {});
  }
  [galleryIndex - 1, galleryIndex + 1].forEach(i => { if (galleryImages[i]) preloadImage(galleryImages[i].key); });
}


function setMyStatusPrompt() {
  const cur = getPresence(myId);
  const pick = prompt('Set activity status: idle, focus, break, afk, or chat', cur?.status ?? 'idle');
  if (!pick) return;
  const status = pick.trim().toLowerCase() as PresenceStatus;
  if (!['idle', 'focus', 'break', 'afk', 'chat'].includes(status)) return toast('Use: idle, focus, break, afk, or chat', 'error');
  const custom = prompt('Optional status text (leave blank for default)', cur?.custom ?? '') ?? '';
  setMyPresence(status, custom.trim());
  renderSide();
  toast('Activity status updated.');
}

// ===== END NEW CHAT FEATURES =====

// The chat card: a list of conversations (the house, and one per housemate), WhatsApp style, or one open thread.
let chatOpen = false, houseUnread = 0;
const groupOf = (peer: string | null) => (peer?.startsWith('g:') ? me.groups?.[peer.slice(2)] : undefined);
const recentMsgs = (peer: string | null): Chat[] => (!peer ? chat : groupOf(peer)?.msgs ?? (peer.startsWith('g:') ? [] : me.dm?.[peer] ?? []));
// Older messages fetched by scrolling up (with what was showing then, so nothing falls in a gap), by thread.
const olderMsgs: Record<string, Chat[]> = {}, historyDone = new Set<string>();
let historyBusy = false;
const threadKey = (peer: string | null) => peer ?? `h:${houseCode}`;
function threadMsgs(peer: string | null): Chat[] {
  const recent = recentMsgs(peer), old = olderMsgs[threadKey(peer)];
  if (!old?.length) return recent;
  const last = old[old.length - 1].id;
  return [...old, ...recent.filter((c) => c.id > last)];
}
// Someone I can message: a housemate or a friend.
const friendsOnly = () => (me.friends ?? []).filter((f) => f.status === 'friend');
const person = (id: string | null) => members.find((m) => m.id === id) ?? friendsOnly().find((f) => f.id === id);
const houseMembers = () => members;
$('#chatUnreply').addEventListener('click', () => { replyTo = null; renderSide(); $('#chatInput').focus(); });
// The message to send in the open thread: the house, a group, or one person.
  const chatMsg = (x: { text: string; img?: string; replyTo?: number }) => (groupOf(dmPeer) ? { t: 'gmsg', g: dmPeer!.slice(2), ...x } : dmPeer ? { t: 'dm', to: dmPeer, ...x } : { t: 'chat', ...x });
  let staged: File | null = null, stagedUrl = '', sending = false; // the chat attachment waiting for Send (see stage())
  let replyTo: { id: number; by: string; text: string } | null = null; // the message being quoted in my next send

// Quote a message for my next reply: show the strip above the box.
function setReply(c: Chat) {
  replyTo = { id: c.id, by: c.by, text: c.text };
  renderSide();
  $<HTMLTextAreaElement>('#chatInput').focus();
}
const syncUnread = () => { unread = houseUnread > 0 || Object.values(dmUnread).some(Boolean); tickTimers(); };
// Is this thread (null = the house) on screen right now?
const viewing = (peer: string | null) => chatOpen && dmPeer === peer && ui.body.dataset.side === 'chat' && !ui.hidden;
function openThread(peer: string | null) {
  stage(null); // an attachment waiting in one conversation must never go out in another
  replyTo = null; // a reply belongs to one thread
  dmPeer = peer;
  chatOpen = true;
  if (peer) dmUnread[peer] = 0; else houseUnread = 0;
  syncUnread();
  renderSide();
  scrollChat();
}
const faces = new Map<string, string>(); // a housemate's pixel face, by look
const faceURL = (look: Look) => { const k = JSON.stringify(look); if (!faces.has(k)) faces.set(k, crispAvatar(look, 3, true, 0).url); return faces.get(k)!; };
const ago = (at: number) => { const s = (Date.now() - at) / 1000; return s < 60 ? 'now' : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86_400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86_400)}d`; };
let chatListHTML = '';
const visitToasted = new Set<string>(); // friends whose visit ask I've been told about
// The thread's buttons are rewritten on every render tick (the chat card re-renders twice a second). Touching the
// DOM only when what they say changes keeps the same node under the pointer: replacing it between mousedown and
// mouseup makes the browser drop the click, which is why Unfriend and Leave group used to do nothing.
let chatActionsHTML = '';
function setChatActions(html: string) {
  const el = document.getElementById('chatThreadActions');
  if (!el || chatActionsHTML === html) return;
  chatActionsHTML = html;
  el.innerHTML = html;
  el.hidden = !html;
}
// The bell in the thread header: a small gold bell (crossed out while the thread is muted) that opens the three
// choices. Muting only silences the thread — its unread badge still counts, as the list shows.
function muteMenuHTML(thread: string): string {
  const muted = isMuted(thread);
  return `<span class="mute-wrap"><button type="button" class="off small chat-mute-btn" data-mute-menu aria-haspopup="true" aria-expanded="false" aria-label="${muted ? 'Muted' : 'Mute notifications'}" title="${muted ? 'Notifications muted' : 'Mute notifications'}"><img src="${uiIconURL(muted ? 'bellOff' : 'bell')}" alt=""></button>`
    + '<div class="mute-menu" hidden><button type="button" data-mute="120">For 2 hours</button><button type="button" data-mute="480">For 8 hours</button><button type="button" data-mute="always">Always</button>'
    + `${muted ? '<button type="button" data-mute="off">Unmute</button>' : ''}</div></span>`;
}

function renderChatHeader() {
  const title = $('#chatTitle');
  const icon = document.getElementById('chatHeadIcon') as HTMLImageElement | null;
  const faceWrap = document.getElementById('chatHeadFaceWrap');
  const face = document.getElementById('chatHeadFace') as HTMLImageElement | null;
  const status = document.getElementById('chatHeadStatus');
  const typing = document.getElementById('chatTypingHead');
  if (!chatOpen) {
    title.textContent = 'Chats';
    if (icon) { icon.hidden = false; icon.src = icon.dataset.src || uiIconURL('chat'); }
    faceWrap?.setAttribute('hidden', '');
    status?.setAttribute('hidden', '');
    if (status) status.textContent = '';
    typing?.setAttribute('hidden', '');
    if (typing) typing.textContent = '';
    setChatActions('');
    return;
  }
  const thread = threadKey(dmPeer);
  if (!dmPeer) {
    title.textContent = 'House chat';
    if (icon) { icon.hidden = false; icon.src = uiIconURL('house'); }
    faceWrap?.setAttribute('hidden', '');
    if (status) { status.hidden = false; status.textContent = `${members.filter(m => m.online).length} online`; status.classList.toggle('on', members.some(m => m.online)); }
    setChatActions(muteMenuHTML(thread));
  } else {
    const g = groupOf(dmPeer);
    if (g) {
      title.textContent = g.name;
      if (icon) { icon.hidden = false; icon.src = uiIconURL('chat'); }
      faceWrap?.setAttribute('hidden', '');
      if (status) { const online = g.members.filter(id => members.some(m => m.id === id && m.online)).length; status.hidden = false; status.textContent = `${g.members.length} members${online ? ` · ${online} online` : ''}`; status.classList.toggle('on', online > 0); }
      const groupId = dmPeer!.startsWith('g:') ? dmPeer!.slice(2) : '';
      setChatActions(`<button class="off small" data-group-leave="${groupId}">Leave group</button>` + muteMenuHTML(thread));
    } else {
      const p = person(dmPeer);
      title.textContent = p?.name ?? 'Chat';
      if (icon) icon.hidden = true;
      if (face && p) { face.src = faceURL(p.look); face.alt = ''; }
      faceWrap?.removeAttribute('hidden');
      faceWrap?.classList.toggle('on', !!p?.online);
      const pr = getPresence(dmPeer);
      const bits = [p?.online ? 'Online' : 'Offline'];
      if (pr) bits.push(presenceIcon(pr.status, pr.custom));
      if (status) { status.hidden = false; status.textContent = bits.join(' · '); status.classList.toggle('on', !!p?.online); }
      const friendThread = !!dmPeer && friendsOnly().some((f) => f.id === dmPeer);
      const pending = (me.friends ?? []).find((f) => f.id === dmPeer);
      setChatActions((friendThread ? `<button class="off small" data-unfriend="${dmPeer}">Unfriend</button>`
        : pending?.status === 'outgoing' ? `<button class="off small" data-cancel-request="${dmPeer}">Cancel request</button>`
          : pending?.status === 'incoming' ? `<button class="off small" data-unfriend="${dmPeer}">Decline</button>`
            : '') + muteMenuHTML(thread));
    }
  }
  const t = typingIndicatorHTML(thread);
  if (typing) { typing.hidden = !t; typing.textContent = t; }
}

function syncChatList() {
  const others = members.filter((m) => m.id !== myId);
  const pals = friendsOnly().filter((f) => !others.some((m) => m.id === f.id)); // friends who aren't housemates
  const live = (peer: string) => (peer.startsWith('g:') ? !!groupOf(peer) : !!person(peer));
  if (dmPeer && !live(dmPeer)) { dmPeer = null; chatOpen = false; } // they moved out, we unfriended, or I left the group
  // Pending unread counts for threads that are gone would be unreachable otherwise.
  for (const peer of Object.keys(dmUnread)) if (!live(peer)) delete dmUnread[peer];
  $('#chatBack').hidden = !chatOpen;
  $('#chatList').hidden = chatOpen;
  $('#chatLog').hidden = !chatOpen;
  $('#chatForm').hidden = !chatOpen;
  renderChatHeader();
  if (chatOpen) {
    // Apply theme when opening thread
    const thread = threadKey(dmPeer);
    applyThreadTheme(thread);
    // Start typing indicator tracking for this thread
    typingThread = { thread, users: new Map() };
    sendTyping(thread, false); // signal we're viewing
    // Mark thread as read
    const msgs = threadMsgs(dmPeer);
    if (msgs.length) markRead(dmPeer, msgs[msgs.length - 1].id);
    return;
  }
  const lastAt = (l: Chat[]) => l[l.length - 1]?.at ?? 0;
  const rows: { id: string; name: string; pic: string; list: Chat[]; n: number; dm: boolean; on?: boolean; pal?: boolean; muted?: boolean; theme?: string }[] = [{ id: '', name: 'House chat', pic: uiIconURL('house'), list: chat, n: houseUnread, dm: false, muted: isMuted(threadKey(null)), theme: getThreadTheme(threadKey(null)) },
    ...Object.entries(me.groups ?? {}).map(([gid, g]) => ({ id: `g:${gid}`, name: g.name, pic: uiIconURL('chat'), list: g.msgs, n: dmUnread[`g:${gid}`] ?? 0, dm: false, muted: isMuted(threadKey(`g:${gid}`)), theme: getThreadTheme(threadKey(`g:${gid}`)) })),
    ...[...others, ...pals].map((m) => ({ id: m.id, name: m.name, pic: faceURL(m.look), list: me.dm?.[m.id] ?? [], n: dmUnread[m.id] ?? 0, dm: true, on: m.online, pal: pals.includes(m as Friend), muted: isMuted(threadKey(m.id)), theme: getThreadTheme(threadKey(m.id)) }))]
    .sort((x, y) => lastAt(y.list) - lastAt(x.list)); // newest first; nobody-said-anything-yet at the bottom
  const rowsHTML = rows.map((r) => {
    const c = r.list[r.list.length - 1];
    const who = !c ? '' : c.from === myId ? 'You: ' : r.dm || !c.by ? '' : `${esc(c.by)}: `; // group notes ("made the group") have no speaker
    const preview = c ? `${who}${c.img ? esc(attachLabel(c.img)) : esc(c.text)}` : r.dm ? (r.pal ? 'Say hi 👋' : 'Say hi 👋') : 'Talk to the whole house';
    const themeStyle = r.theme ? `style="--thread-accent:${r.theme};"` : '';
    const presence = r.dm && r.id ? getPresence(r.id) : null;
    const presenceHTML = presence ? `<span class="chat-status" title="${presenceIcon(presence.status, presence.custom)}">${presenceIcon(presence.status, presence.custom).split(' ')[0]}</span>` : '';
    return `<li><button class="chat-row${r.n ? ' unread' : ''}${r.muted ? ' muted' : ''}" data-peer="${r.id}" ${themeStyle}><span class="chat-face-wrap${'on' in r && r.on ? ' on' : ''}"><img class="chat-face${r.dm ? '' : ' house'}" src="${r.pic}" alt=""></span>
      <span class="chat-mid"><b>${esc(r.name)}${r.muted ? `<img class="chat-mute" src="${uiIconURL('bellOff')}" alt="" title="Notifications muted">` : ''}</b>${presenceHTML}${r.dm ? `<span class="chat-online${r.on ? ' on' : ''}">${r.on ? 'Online' : 'Offline'}</span>` : ''}<small>${preview}</small></span>
      <span class="chat-end">${c ? `<small>${ago(c.at)}</small>` : ''}${r.n ? `<i>${r.n > 99 ? '99+' : r.n}</i>` : ''}</span></button></li>`;
  }).join('');
  // Friend requests on top: theirs to answer, mine waiting.
  const fr = me.friends ?? [];
  for (const f of fr) if (f.visit && !visitToasted.has(f.id)) { visitToasted.add(f.id); toast(`🏠 <b>${esc(f.name)}</b> wants to visit. Open <b>Chats</b> to let them in.`, 'reward'); }
  for (const id of visitToasted) if (!fr.some((f) => f.id === id && f.visit)) visitToasted.delete(id);
  const act = (f: Friend) => f.status === 'incoming' ? `<button data-accept="${f.id}">Accept</button><button class="off" data-unfriend="${f.id}">Decline</button>`
    : f.status === 'outgoing' ? `<button class="off" data-unfriend="${f.id}">Cancel</button>`
      : f.visit ? `<button data-letin="${f.id}">Let in</button><button class="off" data-nope="${f.id}">No</button>`
        : `<button class="off" data-peer="${f.id}" title="Message">💬</button>${f.here ? '' : `<button data-visit="${f.id}"${f.asked || !f.online ? ' disabled' : ''}>${f.asked ? 'Asked' : 'Visit'}</button>`}`;
  const what = (f: Friend) => f.status === 'incoming' ? 'wants to be friends' : f.status === 'outgoing' ? 'Friend request sent'
    : f.visit ? 'wants to visit you' : f.here ? 'In your house' : f.focus ? '📚 Studying' : f.online ? 'Online' : 'Offline';
  const reqs = !fr.length ? '' : '<li class="chat-sec">Friends</li>' + [...fr].filter((f) => f.status !== 'friend' || f.visit).sort((a, b) => Number(b.status !== 'friend' || !!b.visit) - Number(a.status !== 'friend' || !!a.visit) || Number(b.online) - Number(a.online))
    .map((f) => `<li><div class="chat-row req"><span class="chat-face-wrap${f.online && f.status === 'friend' ? ' on' : ''}"><img class="chat-face" src="${faceURL(f.look)}" alt=""></span>
      <span class="chat-mid"><b>${esc(f.name)}</b><small>${what(f)}</small></span><span class="chat-end">${act(f)}</span></div></li>`).join('') + '<li class="chat-sec">Chats</li>';
  const html = reqs + rowsHTML
    + (others.length ? `<li><button class="chat-row new" data-new="1"><img class="chat-face" src="${uiIconURL('chat')}" alt=""><span class="chat-mid"><b>＋ New group</b><small>Chat with a few housemates</small></span></button></li>` : '')
    + `<li><button class="chat-row new" data-friend="1"><img class="chat-face" src="${uiIconURL('chat')}" alt=""><span class="chat-mid"><b>＋ Add friend</b><small>Message friends from any house</small></span></button></li>`;
  if (html !== chatListHTML) { chatListHTML = html; $('#chatList').innerHTML = html; }
}

// The to-dos and the chat log are only rebuilt when what they show really changed: a house state arrives on
// every action in the house, and rewriting fifty chat lines each time is wasted work (and loses the scroll).
let todoSig = '', chatSig = '';
function renderSide() {
  chromeDirty();
  const list: Todo[] = [...todos, ...(me.todos ?? []).map((t) => ({ ...t, mine: true }))];
  const tSig = `${myId}|${Math.floor(Date.now() / 60_000)}|${members.map((m) => `${m.id}${m.name}`).join()}|` // the minute: so "overdue" turns on
    + list.map((t) => `${t.mine ? 'p' : ''}${t.id}:${t.done ? 1 : 0}:${t.all ? 1 : 0}:${t.at ?? ''}:${(t.to ?? []).join('.')}:${(t.ticks ?? []).join('.')}:${t.text}`).join('|');
  if (tSig !== todoSig) {
    todoSig = tSig;
    $('#todoList').innerHTML = todoHTML(list);
  }
  syncChatList();
  const log = $('#chatLog');
  const msgs = threadMsgs(dmPeer), group = groupOf(dmPeer);
  const peerName = group?.name ?? person(dmPeer)?.name ?? 'them';
  const thread = threadKey(dmPeer);
  // Include theme in signature
  const cSig = `${dmPeer}|${peerName}|${msgs.length}|${msgs[0]?.id ?? 0}|${msgs[msgs.length - 1]?.id ?? 0}|${getThreadTheme(thread) ?? ''}`;
  if (cSig !== chatSig) {
    chatSig = cSig;
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40, fromBottom = log.scrollHeight - log.scrollTop;
    const more = msgs.length >= 50 && !historyDone.has(thread) ? '<p class="more">Scroll up for older messages</p>' : '';
    const byId = new Map<number, Chat>(msgs.map((c) => [c.id, c]));
    const quoteOf = (c: Chat) => { const q = c.replyTo ? byId.get(c.replyTo) : null; return q ? `<span class="quote" data-reply-to="${q.id}"><b>${esc(q.by)}</b> <span class="qt">${esc(q.text) || 'Picture'}</span></span>` : ''; };
    log.innerHTML = msgs.length
      ? more + msgs.map((c, i) => {
        if (!c.from) return `<p class="note">${esc(c.text)}</p>`;
        const imgIdx = c.img ? msgs.slice(0, i).filter((m) => m.img).length : -1;
        return `<p class="${c.from === myId ? 'mine' : ''}" data-quote="${c.id}"><b>${esc(c.by)}</b>${quoteOf(c)}${linkify(c.text)}${c.img ? `<span class="chat-att">${docName(c.img) ? `<button type="button" class="chat-doc" data-key="${esc(c.img)}">📎 <span>${esc(docName(c.img)!)}</span></button>` : `<img class="chat-img" data-key="${esc(c.img)}" alt="Picture from ${esc(c.by)}" data-index="${imgIdx}">`}`
          + `<button type="button" class="chat-dl" data-dl="${esc(c.img)}" title="Download" aria-label="Download ${esc(docName(c.img) ?? 'picture')}">⬇</button></span>` : ''}<button type="button" class="chat-reply" title="Reply" aria-label="Reply to ${esc(c.by)}">↩</button></p>`;
      }).join('')
      : dmPeer
        ? `<p class="empty">${group ? `Just the people in ${esc(peerName)}.` : `Just you and ${esc(peerName)} — nobody else can see this.`}</p>`
        : '<p class="empty">Say hi to your housemates 👋</p>';
    if (atBottom) scrollChat();
    else log.scrollTop = log.scrollHeight - fromBottom; // older messages added above: stay on what I was reading
    loadChatImages(log, atBottom);
  }
  // Typing indicator (keep below log only as fallback)
  const typingDiv = $('#typingIndicator');
  const typingHTML = activeTypingHTML(thread);
  if (typingDiv) typingDiv.innerHTML = typingHTML;
  else if (typingHTML) {
    const div = document.createElement('div');
    div.id = 'typingIndicator';
    div.className = 'typing-indicator';
    div.innerHTML = typingHTML;
    log.parentElement?.insertBefore(div, log.nextSibling);
  }
  renderChatHeader();
  const box = $<HTMLTextAreaElement>('#chatInput'), ph = dmPeer ? `Message ${peerName}…` : 'Say something…';
  if (box.placeholder !== ph) box.placeholder = ph;
  // The message I'm replying to: show it above the box, or clear it when the thread changes.
  const rep = $('#chatReply'), q = rep.querySelector('.quote')!;
  if (replyTo) {
    rep.hidden = false;
    q.innerHTML = `Replying to <b>${esc(replyTo.by)}</b> <span class="qt">${esc(replyTo.text) || 'Picture'}</span>`;
  } else {
    rep.hidden = true;
    q.innerHTML = '';
  }
  if (viewing(dmPeer)) { if (dmPeer) dmUnread[dmPeer] = 0; else houseUnread = 0; }
}
const scrollChat = () => { const log = $('#chatLog'); log.scrollTop = log.scrollHeight; };
// Picture links are short-lived, so each is asked for when shown and reused for 50 minutes.
const imgLinks = new Map<string, { url: string; at: number }>();
function loadChatImages(root: HTMLElement, stickToBottom: boolean) {
  root.querySelectorAll<HTMLImageElement>('img.chat-img').forEach(async (img) => {
    const key = img.dataset.key!;
    let link = imgLinks.get(key);
    if (!link || Date.now() - link.at > 50 * 60_000) {
      const res = await fetch(`${apiBase}/api/chatimg?key=${encodeURIComponent(key)}`, { headers: { authorization: `Bearer ${token}` } }).catch(() => null);
      const data = res?.ok ? await res.json() : null;
      if (!data?.url) { img.alt = 'Picture no longer available'; return; }
      imgLinks.set(key, (link = { url: data.url, at: Date.now() }));
    }
    if (stickToBottom) img.onload = scrollChat; // its height arrives after the log was scrolled
    img.src = link.url;
  });
}
// Scrolled to the top of a long thread: fetch the 50 before the oldest shown.
$('#chatLog').addEventListener('scroll', () => {
  const log = $('#chatLog'), key = threadKey(dmPeer), msgs = threadMsgs(dmPeer);
  if (log.scrollTop > 40 || historyBusy || historyDone.has(key) || msgs.length < 50) return;
  historyBusy = true;
  setTimeout(() => { historyBusy = false; }, 5000); // in case the answer never comes
  const g = groupOf(dmPeer);
  send({ t: 'history', k: g ? 'g' : dmPeer ? 'd' : 'h', id: g ? dmPeer!.slice(2) : dmPeer ?? undefined, before: msgs[0].id });
});
$('#chatLog').addEventListener('click', (e) => {
  const link = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
  if (link && !confirm(`Open this external link?\n\n${link.href}\n\nOnly open links from people you trust.`)) return e.preventDefault();
  const dl = (e.target as HTMLElement).closest<HTMLButtonElement>('.chat-dl');
  if (dl) return downloadAttachment(dl.dataset.dl!);
  const doc = (e.target as HTMLElement).closest<HTMLButtonElement>('.chat-doc');
  if (doc) return openDoc(doc.dataset.key!);
  // Image gallery
  const img = (e.target as HTMLElement).closest<HTMLImageElement>('img.chat-img');
  if (img?.src) {
    const idx = Number(img.dataset.index ?? -1);
    if (idx >= 0) { openGallery(idx); return; }
    open(img.src, '_blank', 'noopener');
  }
  // One click on the reply button quotes the message and pulls its text into the composer.
  const replyBtn = (e.target as HTMLElement).closest<HTMLButtonElement>('.chat-reply');
  if (replyBtn) {
    const quote = replyBtn.closest<HTMLElement>('[data-quote]');
    const c = quote ? threadMsgs(dmPeer).find((x) => x.id === Number(quote.dataset.quote)) : null;
    if (c) setReply(c);
    e.stopPropagation();
    return;
  }
  // Click on quoted message to jump to it
  const quoteLink = (e.target as HTMLElement).closest<HTMLSpanElement>('.quote');
  if (quoteLink) {
    const replyToId = quoteLink.dataset.replyTo;
    if (replyToId) {
      const log = $('#chatLog');
      const targetEl = log.querySelector(`[data-quote="${replyToId}"]`);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetEl.classList.add('highlight');
        setTimeout(() => targetEl.classList.remove('highlight'), 2000);
      }
    }
    e.stopPropagation();
    return;
  }
});
// A picked or pasted picture or file waits above the box (with a preview and a ✕) until Send, and whatever is typed
// goes along as its caption. One attachment per message: picking another replaces it.
const isPic = (f: File) => f.type.startsWith('image/');
function stage(file: File | null) {
  if (file && !isPic(file)) {
    if (!((file.name.split('.').pop()?.toLowerCase() ?? '') in DOC_TYPES)) return toast('You can send pictures, PDFs, Word, PowerPoint, Excel, CSV and text files.', 'error');
    if (file.size > 10_000_000) return toast('That file is too big (10 MB max).', 'error');
  }
  URL.revokeObjectURL(stagedUrl);
  staged = file;
  stagedUrl = file && isPic(file) ? URL.createObjectURL(file) : '';
  const box = $('#chatStaged');
  box.hidden = !file;
  box.innerHTML = !file ? '' : `${stagedUrl ? `<img src="${stagedUrl}" alt="Picture to send">` : `<span>📎 ${esc(file.name)}</span>`}`
    + '<button type="button" class="off small" id="chatUnstage" aria-label="Remove attachment" title="Remove">✕</button>';
  if (file) $('#chatInput').focus();
}
$('#chatStaged').addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('#chatUnstage')) stage(null); });
$('#chatPic').addEventListener('click', () => $<HTMLInputElement>('#chatFile').click());
$('#chatFile').addEventListener('change', () => {
  const picker = $<HTMLInputElement>('#chatFile'), file = picker.files?.[0];
  picker.value = '';
  if (file) stage(file);
});
// Pasting a picture into the chat box attaches it too (text pastes as usual).
$('#chatInput').addEventListener('paste', (e) => {
  const file = Array.from(e.clipboardData?.files ?? []).find(isPic);
  if (!file) return;
  e.preventDefault();
  stage(file);
});
// Saves a chat picture or file: the server signs a link that says "download as <name>", loaded in a hidden frame so
// the game page never navigates away.
async function downloadAttachment(key: string) {
  const res = await fetch(`${apiBase}/api/chatimg?download=1&key=${encodeURIComponent(key)}`, { headers: { authorization: `Bearer ${token}` } }).catch(() => null);
  const data = res?.ok ? await res.json() : null;
  if (!data?.url) return toast('That file is no longer available.', 'error');
  const frame = document.createElement('iframe');
  frame.hidden = true;
  frame.src = data.url;
  document.body.append(frame);
  setTimeout(() => frame.remove(), 60_000);
}
// Documents open from a fresh short-lived link (a tab is opened first so pop-up blockers allow it).
async function openDoc(key: string) {
  const tab = open('', '_blank');
  const res = await fetch(`${apiBase}/api/chatimg?key=${encodeURIComponent(key)}`, { headers: { authorization: `Bearer ${token}` } }).catch(() => null);
  const data = res?.ok ? await res.json() : null;
  if (data?.url && tab) { tab.opener = null; tab.location.href = data.url; return; }
  tab?.close();
  toast(data?.url ? 'Allow pop-ups to open files.' : 'That file is no longer available.', 'error');
}
// Uploads an attachment and returns its key. A picture is shrunk to 1024px and re-encoded as JPEG here: much smaller,
// and it drops camera metadata like location. PDFs, Office files, CSV and text go up as they are, with their name.
async function upload(file: File): Promise<string> {
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  let body: Blob = file;
  if (isPic(file)) {
    const bmp = await createImageBitmap(file).catch(() => { throw new Error("That file isn't a picture we can read."); });
    const k = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height);
    const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, 'image/jpeg', 0.85));
    if (!blob) throw new Error("Couldn't prepare that picture.");
    body = blob;
  } else headers['x-file-name'] = encodeURIComponent(file.name);
  const res = await fetch(`${apiBase}/api/chatimg`, { method: 'POST', headers, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Couldn't send that ${isPic(file) ? 'picture' : 'file'}.`);
  return data.key;
}

// To-dos: one list of what I can see (assigned to me, made by me, or for everyone) plus my older private ones.
$('#todoList').addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const group = target.closest<HTMLButtonElement>('button[data-todo-group]');
  if (group) { doneOpen = !doneOpen; todoSig = ''; renderSide(); return; } // open or close the finished ones
  const b = target.closest<HTMLButtonElement>('button[data-todo]');
  if (b?.dataset.todo === 'edit') return openTodoModal(todos.find((t) => t.id === Number(b.dataset.id)));
  if (b) send({ t: `${b.dataset.mine ? 'ptodo' : 'todo'}_${b.dataset.todo}`, id: Number(b.dataset.id) });
});
// The new to-do modal: what, when (for a reminder), and who it's for.
const todoModal = $<HTMLDialogElement>('#todoModal');
let editing: Todo | undefined; // the to-do the modal is changing, or none for a new one
function openTodoModal(t?: Todo) {
  editing = t;
  $<HTMLFormElement>('#todoNew').reset();
  $('#todoModalTitle').textContent = t ? 'Edit to-do' : 'New to-do';
  $('#todoSave').textContent = t ? 'Save' : 'Add to-do';
  const picked = t ? new Set(t.all ? [] : t.to ?? []) : new Set([myId]);
  const people = [...members].sort((a, b) => Number(b.id === myId) - Number(a.id === myId)); // me first
  $('#todoWho').innerHTML = `<label class="who-chip all"><input type="checkbox" id="todoEveryone"${t?.all ? ' checked' : ''}><span>👥 Everyone</span></label>`
    + people.map((m) => `<label class="who-chip person"><input type="checkbox" value="${m.id}"${picked.has(m.id) ? ' checked' : ''}><span>${m.id === myId ? 'You' : esc(m.name)}</span></label>`).join('');
  $('#todoWho').classList.toggle('everyone', !!t?.all);
  if (t) {
    $<HTMLTextAreaElement>('#todoText').value = t.text;
    if (t.at) {
      const d = new Date(t.at), pad = (n: number) => String(n).padStart(2, '0');
      $<HTMLInputElement>('#todoDate').value = d.toLocaleDateString('en-CA');
      $<HTMLInputElement>('#todoTime').value = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    if (t.repeat) {
      $<HTMLSelectElement>('#todoRepeat').value = t.repeat;
    }
    if (t.repeatUntil) {
      $<HTMLInputElement>('#todoRepeatUntil').value = new Date(t.repeatUntil).toLocaleDateString('en-CA');
    }
    if (t.priority) {
      $<HTMLSelectElement>('#todoPriority').value = t.priority;
    }
  }
  syncBell();
  todoModal.showModal();
}
// Whether reminders can reach me, and a button to allow them (browsers only ask from a tap like this, and only once).
function syncBell() {
  const perm = window.Notification?.permission;
  $('#todoBell').innerHTML = perm === 'granted' ? '🔔 Reminders are on.'
    : perm === 'default' ? '<button type="button" class="small" id="todoAllow">🔔 Allow reminders</button> so they reach you outside the app too.'
    : perm === 'denied' ? "🔕 Notifications are blocked, and browsers won't ask twice. To turn them on: click the icon left of the address bar → <b>Notifications</b> → <b>Allow</b>. Reminders switch on by themselves."
    : "🔕 This browser can't show notifications, so reminders only pop up while Auralis is open.";
}
// Flipping notifications on in the browser's site settings takes effect at once: no reload, no reopening.
navigator.permissions?.query({ name: 'notifications' }).then((st) => { st.onchange = () => { syncBell(); renderNotifyPrefs(); subscribePush(); }; }).catch(() => {});
$('#todoBell').addEventListener('click', (e) => {
  if (!(e.target as HTMLElement).closest('#todoAllow')) return;
  Notification.requestPermission().then(() => { subscribePush(); syncBell(); });
});
$('#todoNewBtn').addEventListener('click', () => openTodoModal());
$('#todoCancel').addEventListener('click', () => todoModal.close());
$('#todoWho').addEventListener('change', (e) => { // "Everyone" greys out the individual picks
  const box = e.target as HTMLInputElement;
  if (box.id === 'todoEveryone') $('#todoWho').classList.toggle('everyone', box.checked);
});
$('#todoNew').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $<HTMLTextAreaElement>('#todoText').value.trim(), date = $<HTMLInputElement>('#todoDate').value, time = $<HTMLInputElement>('#todoTime').value;
  if (!text) return;
  // A time alone means today; a date alone means 9 in the morning.
  const at = date || time ? new Date(`${date || new Date().toLocaleDateString('en-CA')}T${time || '09:00'}`).getTime() : undefined;
  const sameTime = !!editing?.at && at !== undefined && Math.abs(at - editing.at) < 60_000; // unchanged (inputs drop the seconds)
  if (at && at < Date.now() && !sameTime) return toast('That time has already passed. Pick a later one.', 'error');
  const all = $<HTMLInputElement>('#todoEveryone').checked;
  const to = Array.from($('#todoWho').querySelectorAll<HTMLInputElement>('.person input:checked')).map((i) => i.value);
  const repeat = $<HTMLSelectElement>('#todoRepeat').value || undefined;
  const repeatUntil = $<HTMLInputElement>('#todoRepeatUntil').value ? new Date($<HTMLInputElement>('#todoRepeatUntil').value).getTime() : undefined;
  const priority = $<HTMLSelectElement>('#todoPriority').value || undefined;
  send(editing ? { t: 'todo_edit', id: editing.id, text, at: sameTime ? editing.at : at, all, to, repeat, repeatUntil, priority } : { t: 'todo_add', text, at, all, to, repeat, repeatUntil, priority });
  if (at && window.Notification?.permission === 'default') Notification.requestPermission().then(subscribePush); // so reminders reach me anywhere
  todoModal.close();
});

$('#chatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $<HTMLTextAreaElement>('#chatInput');
  const watch = /^\/watch\b\s*(.*)$/i.exec(input.value.trim());
  if (watch) { // /watch <link> starts a watch party (house chat: whole house; DM: just us two), /watch stop ends it
    const url = watch[1];
    if (!url) toast('Type <b>/watch</b> and a YouTube, Vimeo, Twitch, Dailymotion or .mp4 link.');
    else if (url.toLowerCase() !== 'stop' && !parseVideo(url)) toast("Can't play that link. Try YouTube, Vimeo, Twitch, Dailymotion or a direct .mp4/.webm link.", 'error');
    else {
      const g = groupOf(dmPeer) ? dmPeer!.slice(2) : undefined;
      const to = dmPeer && !dmPeer.startsWith('g:') ? dmPeer : undefined;
      if (send({ t: 'watch', url, ...(to ? { to } : {}), ...(g ? { g } : {}) })) input.value = '';
    }
    return;
  }
  if (staged) return sendStaged(input);
  if (input.value.trim() && send(chatMsg({ text: input.value, ...(replyTo ? { replyTo: replyTo.id } : {}) }))) {
    input.value = '';
    replyTo = null;
  }
});
// The message goes to the thread that was open when Send was pressed, even if the upload takes a while.
// If the upload fails, the attachment and caption stay in the box to try again.
async function sendStaged(input: HTMLTextAreaElement) {
  if (sending || !token || !staged) return;
  sending = true;
  const file = staged, msg = chatMsg({ text: input.value, ...(replyTo ? { replyTo: replyTo.id } : {}) });
  $('#chatStaged').classList.add('busy');
  if (!isPic(file)) toast(`Sending <b>${esc(file.name)}</b>…`);
  try {
    const img = await upload(file);
    send({ ...msg, img });
    if (staged === file) { stage(null); input.value = ''; input.dispatchEvent(new Event('input')); }
    replyTo = null;
  } catch (err) {
    toast(esc((err as Error).message), 'error');
  } finally {
    sending = false;
    $('#chatStaged').classList.remove('busy');
  }
}
// The to-do and chat boxes grow with what's typed (CSS caps them at a few lines). Enter still sends: messages are one line.
for (const box of [$<HTMLTextAreaElement>('#chatInput')]) {
  const fit = () => { box.style.height = 'auto'; box.style.height = `${box.scrollHeight + 6}px`; }; // + its borders
  box.addEventListener('input', fit);
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); box.form!.requestSubmit(); }
  });
  box.form!.addEventListener('submit', () => requestAnimationFrame(fit)); // shrink back once it's been cleared
}
// @mention autocomplete
const mentionPicker = $<HTMLDivElement>('#chatMentions');
let mentionQuery = '';
let mentionStart = -1;
let mentionIndex = -1;
function showMentions(query: string, start: number) {
  const members = houseMembers(); // helper to get current house members
  const matches = members.filter((m) => m.id !== myId && m.name.toLowerCase().includes(query.toLowerCase()));
  if (!matches.length) { mentionPicker.hidden = true; return; }
  mentionPicker.innerHTML = matches.map((m, i) => `<button type="button" data-mention="${esc(m.name)}" data-index="${i}">@${esc(m.name)}</button>`).join('');
  mentionPicker.hidden = false;
  mentionIndex = -1;
  updateMentionHighlight();
}
function hideMentions() { mentionPicker.hidden = true; mentionQuery = ''; mentionStart = -1; }
function updateMentionHighlight() {
  mentionPicker.querySelectorAll('button').forEach((b, i) => b.classList.toggle('sel', i === mentionIndex));
}
function selectMention(name: string) {
  const input = $<HTMLTextAreaElement>('#chatInput');
  const text = input.value;
  const before = text.slice(0, mentionStart);
  const after = text.slice(input.selectionStart);
  input.value = before + '@' + name + ' ' + after;
  // Move cursor after the mention
  setTimeout(() => { input.selectionStart = input.selectionEnd = before.length + name.length + 2; input.dispatchEvent(new Event('input')); }, 0);
  hideMentions();
}
$<HTMLTextAreaElement>('#chatInput').addEventListener('input', (e) => {
  const input = e.target as HTMLTextAreaElement;
  const pos = input.selectionStart;
  const text = input.value;
  // Check if we're in a mention
  const atPos = text.lastIndexOf('@', pos - 1);
  if (atPos >= 0 && text.slice(atPos + 1, pos).match(/^[\w\-]*$/)) {
    const query = text.slice(atPos + 1, pos);
    if (query !== mentionQuery || atPos !== mentionStart) {
      mentionQuery = query;
      mentionStart = atPos;
      showMentions(query, atPos);
    }
  } else {
    hideMentions();
  }
  // Auto-grow
  input.style.height = 'auto';
  input.style.height = `${input.scrollHeight + 6}px`;
  // Typing indicator debounce
  if (chatOpen && dmPeer) {
    clearTimeout(typingTimers.get('chat') as number);
    sendTyping(threadKey(dmPeer), true);
    typingTimers.set('chat', setTimeout(() => sendTyping(threadKey(dmPeer), false), 2000));
  }
});
$<HTMLTextAreaElement>('#chatInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); (e.currentTarget as HTMLTextAreaElement).form!.requestSubmit(); }
  if (!mentionPicker.hidden) {
    const buttons = mentionPicker.querySelectorAll('button');
    if (e.key === 'ArrowDown') { e.preventDefault(); mentionIndex = Math.min(mentionIndex + 1, buttons.length - 1); updateMentionHighlight(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); mentionIndex = Math.max(mentionIndex - 1, 0); updateMentionHighlight(); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); if (mentionIndex >= 0) selectMention(buttons[mentionIndex].dataset.mention!); }
    else if (e.key === 'Escape') { hideMentions(); }
  }
});
// Click on mention picker
mentionPicker.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-mention]');
  if (btn) selectMention(btn.dataset.mention!);
});
// Hide mentions when clicking outside
document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  if (!t.closest('#chatInput') && !t.closest('#chatMentions')) hideMentions();
  if (!t.closest('.mute-wrap')) ui.querySelectorAll<HTMLElement>('#chatThreadActions .mute-menu').forEach((m) => { m.hidden = true; });
});
$('#chatList').addEventListener('click', (e) => {
  const t = e.target as HTMLElement, acc = t.closest<HTMLButtonElement>('[data-accept]'), rm = t.closest<HTMLButtonElement>('[data-unfriend]');
  if (acc) return send({ t: 'friend_accept', id: acc.dataset.accept });
  if (rm) return send({ t: 'friend_remove', id: rm.dataset.unfriend });
  const fb = t.closest<HTMLButtonElement>('[data-visit], [data-letin], [data-nope], .chat-end [data-peer]');
  if (fb?.dataset.visit) { send({ t: 'visit_ask', id: fb.dataset.visit }); return toast("Asked! You'll go over once they let you in."); }
  if (fb?.dataset.letin || fb?.dataset.nope) return send({ t: 'visit_answer', id: fb.dataset.letin ?? fb.dataset.nope, yes: !!fb.dataset.letin });
  if (fb) { openThread(fb.dataset.peer!); return $('#chatInput').focus(); }
  const b = t.closest<HTMLButtonElement>('button.chat-row');
  if (!b) return;
  if (b.dataset.new) return openGroupModal();
  if (b.dataset.friend) { $<HTMLFormElement>('#friendNew').reset(); return friendModal.showModal(); }
  openThread(b.dataset.peer || null);
  $('#chatInput').focus();
});
$('#chatBack').addEventListener('click', () => { chatOpen = false; renderSide(); });
// Chat thread action buttons (unfriend, leave group, cancel request)
$('#chatThreadActions').addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const bell = t.closest<HTMLButtonElement>('[data-mute-menu]');
  if (bell) {
    const menu = bell.parentElement?.querySelector<HTMLElement>('.mute-menu');
    if (menu) { menu.hidden = !menu.hidden; bell.setAttribute('aria-expanded', String(!menu.hidden)); }
    return;
  }
  const pick = t.closest<HTMLButtonElement>('[data-mute]');
  if (pick) {
    const v = pick.dataset.mute!, until = v === 'off' ? -1 : v === 'always' ? 0 : Date.now() + Number(v) * 60_000;
    muteThread(threadKey(dmPeer), until);
    toast(v === 'off' ? 'Notifications for this chat are back on.' : v === 'always' ? 'This chat stays quiet from now on.' : `Muted for ${v === '120' ? '2 hours' : '8 hours'}.`);
    return;
  }
  const unfriendBtn = t.closest<HTMLButtonElement>('[data-unfriend]');
  if (unfriendBtn) {
    const id = unfriendBtn.dataset.unfriend!;
    const f = friendsOnly().find((x) => x.id === id);
    if (f && confirm(`Unfriend ${f.name}? ${members.some((m) => m.id === f.id) ? '' : "You won't be able to message each other any more."}`)) {
      send({ t: 'friend_remove', id: f.id });
      chatOpen = false;
      renderSide();
    }
    return;
  }
  const cancelBtn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-cancel-request]');
  if (cancelBtn) {
    const id = cancelBtn.dataset.cancelRequest!;
    send({ t: 'friend_remove', id });
    chatOpen = false;
    renderSide();
    return;
  }
  const leaveBtn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-group-leave]');
  if (leaveBtn) {
    const g = groupOf(dmPeer);
    if (g && confirm(`Leave "${g.name}"? You won't see its messages any more.`)) {
      send({ t: 'group_leave', g: dmPeer!.slice(2) });
      chatOpen = false;
      renderSide();
    }
    return;
  }
});
// (chatLeave button removed; actions live in chat menu)
// Add a friend by username.
const friendModal = $<HTMLDialogElement>('#friendModal');
$('#friendCancel').addEventListener('click', () => friendModal.close());
// Usernames that start with what's typed show up as suggestions (asked for after a short pause in typing).
let friendTyping = 0;
$('#friendName').addEventListener('input', () => {
  clearTimeout(friendTyping);
  friendTyping = window.setTimeout(() => send({ t: 'friend_search', q: $<HTMLInputElement>('#friendName').value.trim() }), 200);
});
$('#friendNew').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $<HTMLInputElement>('#friendName').value.trim();
  if (!name) return;
  send({ t: 'friend_request', name });
  friendModal.close();
});
// New group: a name and some housemates.
const groupModal = $<HTMLDialogElement>('#groupModal');
function openGroupModal() {
  $<HTMLFormElement>('#groupNew').reset();
  $('#groupWho').innerHTML = members.filter((m) => m.id !== myId)
    .map((m) => `<label class="who-chip person"><input type="checkbox" value="${m.id}"><span>${esc(m.name)}</span></label>`).join('');
  groupModal.showModal();
}
$('#groupCancel').addEventListener('click', () => groupModal.close());
$('#groupNew').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $<HTMLInputElement>('#groupName').value.trim();
  const ids = Array.from($('#groupWho').querySelectorAll<HTMLInputElement>('input:checked')).map((i) => i.value);
  if (!name || !ids.length) return toast('Give the group a name and pick at least one person.', 'error');
  send({ t: 'group_new', name, members: ids });
  groupModal.close();
});
// Announcement modal
const announcementModal = $<HTMLDialogElement>('#announcementModal');
function postAnnouncement() { // open the composer on a clean slate
  $<HTMLFormElement>('#announcementNew').reset();
  $('#announcementModalTitle').textContent = 'New announcement';
  announcementModal.showModal();
}
$('#announcementCancel').addEventListener('click', () => announcementModal.close());
$('#announcementNew').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $<HTMLTextAreaElement>('#announcementText').value.trim();
  if (!text) return;
  send({ t: 'announcement_add', text });
  announcementModal.close();
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
  todos: ui.querySelector('.side-card.todos')!,

  chat: ui.querySelector('.side-card.chat')!,
};
const sideLabel: Record<SideCard, string> = { todos: 'to-dos', chat: 'chat' };

function applyFold(card: SideCard) {
  chromeDirty();
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
  if (card === 'chat') openThread(null); // straight into the house chat, to type
  const el = $<HTMLInputElement>(input);
  if (text) el.value = text;
  el.focus();
}
// Group chat you can't see right now: worth a ping.
const chatHidden = () => !viewing(null);
for (const card of ['todos', 'chat'] as SideCard[]) {
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
type AuthMode = 'signup' | 'login' | 'forgot' | 'reset';
let authMode: AuthMode = 'signup';
// The token from a reset link in the URL fragment. It is never sent as part of a page request, so it
// stays out of access logs and Referer headers; it goes to /api/reset once and is then dropped.
let resetToken: string | null = null;
let pendingLook: Look | null = null; // buddy picked on the landing page, applied once the game state arrives
// The landing and login page can be zoomed like any web page (for reading); the game itself can't, so pinches
// zoom the room instead of the whole page.
const viewport = ui.querySelector('meta[name=viewport]')!;
function showLanding(on: boolean) {
  viewport.setAttribute('content', on ? 'width=device-width, initial-scale=1, viewport-fit=cover'
    : 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, user-scalable=no');
  ui.body.classList.toggle('signed-out', on);
  ui.documentElement.classList.toggle('signed-out', on);
  $('#landing').hidden = !on;
  if (on) requestAnimationFrame(heroFrame);
}

// Erase the account across every table. The password is the proof, and it is asked for here rather than
// kept anywhere: a stolen token can log out, but only the person can delete the account.
async function deleteAccount() {
  const password = prompt('Type your password to delete your account and everything in it. This cannot be undone.');
  if (!password) return;
  if (!confirm('Delete your Auralis account for good? Your rooms, chats and study history go with it.')) return;
  const username = myMember()?.name ?? '';
  const res = await fetch(`${apiBase}/api/delete`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }),
  }).catch(() => null);
  if (!res?.ok) { toast(res ? 'That password was not right.' : 'Could not reach the server. Try again.', 'error'); return; }
  signOut(false); // the token went with the account: back to the landing page
}

function signOut(tellServer: boolean) {
  stopAllSounds();
  if (tellServer && token) fetch(`${apiBase}/api/logout`, { method: 'POST', body: JSON.stringify({ token }) }).catch(() => {});
  token = null;
  localStorage.removeItem('auralis.token');
  // The server rejected our token: remember it, so the landing page says why instead of just appearing.
  if (!tellServer) sessionStorage.setItem('auralis.sessionEnded', '1');
  // This device stops getting my reminders, then reload: the simplest way to drop all in-memory game state.
  navigator.serviceWorker?.getRegistration().then((r) => r?.pushManager.getSubscription()).then((s) => s?.unsubscribe())
    .catch(() => {}).finally(() => location.reload());
}
// ---------- the bell: what happened to me (studying, notes, pets, gifts, reminders...), with a quick action each ----------
const bellBtn = $<HTMLButtonElement>('#bell'), bellMenu = $<HTMLElement>('#bellMenu');
const BELL_ICONS: Record<string, string> = { study: '📚', invite: '📚', note: '📝', pet: '💕', gift: '🎁', highfive: '✋', remind: '⏰', friend: '👋', visit: '🏠' };
let bellOpenSeen = 0; // what was already seen when the menu opened, so new ones stay highlighted while it's open
// The one thing worth doing about an entry, if it still makes sense now.
function bellAction(n: Inbox) {
  const mate = members.find((o) => o.id === n.from && o.id !== myId), fr = me.friends?.find((f) => f.id === n.from);
  if ((n.kind === 'study' || n.kind === 'invite') && mate?.focus && !mate.focus.pausedAt && !myMember()?.focus) return `<button class="small" data-bell="join" data-v="${mate.id}">Join</button>`;
  if (n.kind === 'remind') return '<button class="small" data-bell="todos">Open to-dos</button>';
  if (n.kind === 'visit' && fr?.visit) return `<button class="small" data-bell="letin" data-v="${fr.id}">Let in</button><button class="small off" data-bell="nope" data-v="${fr.id}">No</button>`;
  if (n.kind === 'friend' && fr?.status === 'incoming') return `<button class="small" data-bell="accept" data-v="${fr.id}">Accept</button>`;
  if (!mate) return '';
  if (n.kind === 'gift') return `<button class="small" data-bell="gift" data-v="${mate.id}">🎁 Gift back</button>`;
  if (n.kind === 'note') return `<button class="small" data-bell="note" data-v="${mate.id}">Reply</button>`;
  return `<button class="small" data-bell="dm" data-v="${mate.id}">Message</button>`;
}
function renderBell() {
  const list = me.inbox ?? [], seen = me.inboxSeen ?? 0;
  const fresh = houseAnnouncements.filter((a) => a.at > seen).length;
  const count = list.filter((n) => n.at > seen).length + fresh;
  $('#bellCount').textContent = count > 9 ? '9+' : String(count);
  $('#bellCount').hidden = !count;
  bellBtn.ariaLabel = bellBtn.title = count ? `Notifications (${count} new)` : 'Notifications';
  if (bellMenu.hidden) return;
  const owner = !!houseOwnerName && houseOwnerName === members.find((m) => m.id === myId)?.name;
  // The block stays for an owner with nothing posted yet, or they could never post the first one.
  const notes = (houseAnnouncements.length || owner) ? `<div class="bell-head"><h3>📢 Announcements</h3>${owner ? '<button class="small off" data-bell="announce">＋ Post</button>' : ''}</div>
    ${houseAnnouncements.length ? `<div class="announcements">${houseAnnouncements.map((a) => `<div class="announcement"><p>${linkify(a.text)}</p><small>— ${esc(a.by)} · ${new Date(a.at).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</small>${owner ? `<button class="off small" data-bell="announce-del" data-v="${a.id}">Delete</button>` : ''}</div>`).join('')}</div>` : ''}`
    : '';
  $('#bellList').innerHTML = notes
    + `<div class="bell-head"><h3>Notifications</h3>${list.length ? '<button class="small off" data-bell="clear">Clear all</button>' : ''}</div>`
    + (list.length ? `<ul>${list.slice().reverse().map((n) => `<li${n.at > bellOpenSeen ? ' class="new"' : ''}>
      <span class="bell-icon" aria-hidden="true">${BELL_ICONS[n.kind] ?? '🔔'}</span>
      <div class="bell-body"><p>${n.kind === 'remind' ? 'Reminder: ' : ''}${n.by ? `<b>${esc(n.by)}</b> ` : ''}${esc(n.text)}</p>
      <small>${ago(n.at) === 'now' ? 'just now' : `${ago(n.at)} ago`}${(n.n ?? 1) > 1 ? ` · ×${n.n}` : ''}</small></div>
      <span class="bell-act">${bellAction(n)}</span></li>`).join('')}</ul>`
      : '<p class="hint">Nothing yet. Notes, gifts, pets and study sessions show up here.</p>');
}
function toggleBell(open = bellMenu.hidden) {
  bellMenu.hidden = !open;
  bellBtn.ariaExpanded = String(open);
  if (!open) return;
  bellOpenSeen = me.inboxSeen ?? 0;
  if ((me.inbox ?? []).some((n) => n.at > bellOpenSeen) || houseAnnouncements.some((a) => a.at > bellOpenSeen)) { me.inboxSeen = Date.now(); send({ t: 'inbox_read' }); }
  renderBell();
}
bellBtn.addEventListener('click', () => toggleBell());
addEventListener('pointerdown', (e) => { if (!bellMenu.hidden && !(e.target as HTMLElement).closest('.bell-wrap')) toggleBell(false); });
onKey((e) => { if (e.key === 'Escape' && !bellMenu.hidden) toggleBell(false); });
bellMenu.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-bell]');
  if (!b) return;
  const v = b.dataset.v!;
  switch (b.dataset.bell) {
    case 'clear': send({ t: 'inbox_clear' }); return;
    case 'announce': toggleBell(false); postAnnouncement(); return;
    case 'announce-del': if (confirm('Delete this announcement?')) send({ t: 'announcement_del', id: Number(v) }); return;
    case 'join': send({ t: 'focus_join', id: v, tz: new Date().getTimezoneOffset() }); break;
    case 'todos': setPanel('todos'); break;
    case 'letin': case 'nope': send({ t: 'visit_answer', id: v, yes: b.dataset.bell === 'letin' }); break;
    case 'accept': send({ t: 'friend_accept', id: v }); break;
    case 'gift': send({ t: 'gift', to: v }); break;
    case 'note': writeNote(v); break;
    case 'dm': openSide('chat', '#chatInput'); openThread(v); break;
  }
  toggleBell(false);
});

// A system notification while Auralis is in a background tab, if I want that kind (chosen in the sound menu).
function sysNotify(kind: keyof typeof NOTIFY, title: string, body: string) {
  if (document.hidden && window.Notification?.permission === 'granted' && wantsNotify(me.notify, kind)) new Notification(title, { body, icon: '/icon-192.png', tag: kind });
}
// The "Notify me about" switches, and whether this browser can show notifications at all.
function renderNotifyPrefs() {
  const box = $('#notifyPrefs');
  const sig = JSON.stringify(me.notify ?? {});
  if (box.dataset.sig !== sig) {
    box.dataset.sig = sig;
    box.innerHTML = Object.entries(NOTIFY).map(([k, n]) => `<label>${n.label} <input type="checkbox" data-notify="${k}"${wantsNotify(me.notify, k) ? ' checked' : ''}></label>`).join('');
  }
  const perm = window.Notification?.permission;
  $('#notifyPerm').innerHTML = perm === 'granted' ? '' : perm === 'default'
    ? '<button type="button" id="notifyAllow">🔔 Allow notifications</button>'
    : perm === 'denied' ? '🔕 Blocked in this browser: icon left of the address bar → Notifications → Allow.' : "🔕 This browser can't show notifications.";
}
$('#notifyPrefs').addEventListener('change', (e) => {
  const box = (e.target as HTMLInputElement).closest<HTMLInputElement>('input[data-notify]');
  if (box) send({ t: 'notify_prefs', prefs: { ...me.notify, [box.dataset.notify!]: box.checked } });
});
$('#notifyPerm').addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('#notifyAllow')) Notification.requestPermission().then(() => { subscribePush(); renderNotifyPrefs(); syncBell(); });
});

// Web Push: lets reminders arrive with Auralis closed. Needs notification permission and the service worker (production builds).
let pushAsked = false;
async function subscribePush() {
  if (pushAsked || !me?.pushKey || window.Notification?.permission !== 'granted' || !('PushManager' in window) || !navigator.serviceWorker) return;
  pushAsked = true;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: me.pushKey }));
    send({ t: 'push_sub', sub: sub.toJSON() });
  } catch { pushAsked = false; }
}

// Sign-up asks for a username and an email; log-in takes either one in the first box. Forgot and reset
// are reached from the log-in hint and from the link in the mail, not from the sign-up/log-in switch.
const AUTH_MODES: Record<AuthMode, { title: string; submit: string; user: string; hint: string }> = {
  signup: { title: 'Move into the house 🏠', submit: 'Create my room', user: 'Username',
    hint: 'Already studying with us? <button type="button" class="linkish" data-mode="login">Switch to Log in</button>.' },
  login: { title: 'Welcome back! 👋', submit: 'Log in', user: 'Username or email',
    hint: 'New here? <button type="button" class="linkish" data-mode="signup">Switch to Sign up</button>. <button type="button" class="linkish" data-mode="forgot">Forgot password?</button>' },
  forgot: { title: 'Forgot your password? 🔑', submit: 'Email me a link', user: 'Email',
    hint: 'The address on your account. The link works once, for an hour.' },
  reset: { title: 'Choose a new password 🔒', submit: 'Save and log in', user: 'Username',
    hint: 'Pick something new, at least 8 characters.' },
};
function setAuthMode(mode: AuthMode) {
  authMode = mode;
  const m = AUTH_MODES[mode];
  const fromLink = mode === 'forgot' || mode === 'reset'; // reached from elsewhere, not from the switch
  $('#authSeg').hidden = fromLink;
  ui.querySelectorAll<HTMLButtonElement>('#authSeg [data-mode]').forEach((x) => x.className = x.dataset.mode === mode ? 'on' : 'off');
  $('#authSubmit').textContent = m.submit;
  $('#authTitle').textContent = m.title;
  $('#authUserLabel').hidden = fromLink;
  $('#authUserText').textContent = m.user;
  $('#authEmailLabel').hidden = mode !== 'signup' && mode !== 'forgot';
  $('#authPassLabel').hidden = mode === 'forgot';
  $('#authConfirmLabel').hidden = mode !== 'signup' && mode !== 'reset';
  $<HTMLInputElement>('#authPass').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  $('#authHint').innerHTML = m.hint;
  $('#authError').hidden = true;
  $('#authNote').hidden = true; // a notice belongs to the attempt that made it, not to this screen
  // The way back out of forgot/reset is a button of its own: the helper text underneath is where the
  // "we have emailed you" notice used to live, and a way out must not disappear with it.
  $('#authCancel').hidden = !fromLink;
}
// One listener on the form: the switch and the hints are replaced as the mode changes, so a listener
// bound to each button would keep pointing at markup that is no longer on the page.
$('#authForm').addEventListener('click', (e) => {
  const mode = (e.target as HTMLElement).closest<HTMLElement>('[data-mode]')?.dataset.mode as AuthMode | undefined;
  if (!mode) return;
  e.preventDefault();
  setAuthMode(mode);
});

$('#authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#authError');
  const btn = $<HTMLButtonElement>('#authSubmit');
  // Forgot: ask for a link. Nothing here says whether that address has an account; the page repeats
  // the server's one answer either way.
  if (authMode === 'forgot') {
    const email = $<HTMLInputElement>('#authEmail').value.trim();
    const problem = emailProblem(email);
    if (problem) { err.textContent = problem; err.hidden = false; return; }
    btn.disabled = true;
    $('#authNote').hidden = true;
    try {
      await fetch(`${apiBase}/api/forgot`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) });
      $<HTMLInputElement>('#authEmail').value = '';
      $('#authNote').textContent = 'If that address has an account, a reset link is on its way. It works once, for an hour.';
      $('#authNote').hidden = false;
    } catch {
      err.textContent = "Can't reach the server. Check your connection.";
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
    return;
  }
  // Reset: the token from the link plus a new password, and the session that comes back with it.
  if (authMode === 'reset') {
    const pass = $<HTMLInputElement>('#authPass').value;
    const problem = passwordProblem(pass)
      ?? (pass !== $<HTMLInputElement>('#authConfirm').value ? "The two passwords don't match." : null)
      ?? (!resetToken ? 'That link is missing its token. Ask for a new one.' : null);
    if (problem) { err.textContent = problem; err.hidden = false; return; }
    btn.disabled = true;
    ui.body.classList.add('busy');
    try {
      const res = await fetch(`${apiBase}/api/reset`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: resetToken, password: pass }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { err.textContent = data.error ?? 'Something went wrong. Try again.'; err.hidden = false; return; }
      resetToken = null;
      token = data.token;
      localStorage.setItem('auralis.token', data.token);
      $<HTMLInputElement>('#authPass').value = '';
      $<HTMLInputElement>('#authConfirm').value = '';
      showLanding(false);
      connect();
    } catch {
      err.textContent = "Can't reach the server. Check your connection.";
      err.hidden = false;
    } finally {
      btn.disabled = false;
      ui.body.classList.remove('busy');
    }
    return;
  }
  // Say exactly what's wrong before asking the server (which checks the same things again).
  const user = $<HTMLInputElement>('#authUser').value.trim(), pass = $<HTMLInputElement>('#authPass').value;
  const problem = authMode === 'signup'
    ? usernameProblem(user) ?? emailProblem($<HTMLInputElement>('#authEmail').value) ?? passwordProblem(pass)
      ?? (pass !== $<HTMLInputElement>('#authConfirm').value ? "The two passwords don't match." : null)
    : !user ? 'Enter your username or email.' : !pass ? 'Enter your password.' : null;
  if (problem) {
    err.textContent = problem;
    err.hidden = false;
    return;
  }
  btn.disabled = true;
  ui.body.classList.add('busy');
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
    ui.body.classList.remove('busy');
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
ui.querySelectorAll<HTMLImageElement>('#landing .coin-d').forEach((img) => (img.src = coinSrc));

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
  const put = (item: ItemKey, x: number, y: number, col?: string) => drawFurniture(c, item, x, y, t, col, false, ITEMS[item].w, 0, 0, 0, ITEMS[item].h);
  drawWin(c, 1 * T, 0, 'day');
  drawWin(c, 16 * T, 0, 'day');
  put('roundRug', 8 * T, 5 * T, '#b89af0');
  put('rug', 2 * T, 5 * T, '#9db4ee');
  // Sorted back to front by their bottom edge, like the game does.
  put('bookshelf', 6 * T, 2 * T, '#d9a06a');
  put('lamp', 9 * T, 2 * T, '#ffd27a');
  put('aquarium', 10 * T, 2 * T);
  put('bonsai', 18 * T, 2 * T);
  drawSeated(c, heroLooks[0], 3 * T, 3 * T, t, '#f4a6b8');
  drawSeated(c, heroLooks[1], 14 * T, 3 * T, t, '#8fd0a8');
  put('desk', 2 * T, 4 * T, '#f0d2a8');
  put('desk', 13 * T, 4 * T, '#b07a4e');
  const pets = (['cat', 'bunny', 'dragon'] as const).map((kind, i) => ({ kind, ...petPos(400 + i * 97, now, [{ spots: heroSpots, toys: [] }]) }));
  const walk = Math.sin(now / 1400);
  const walker = { x: 8.5 + walk * 2.5, y: 5 };
  const sprites: { y: number; draw: () => void }[] = [
    ...pets.map((p) => ({ y: p.y + 0.9, draw: () => drawPet(c, p.kind, Math.round(p.x * T), Math.round(p.y * T), p.moving, p.left, now) })),
    { y: walker.y + 0.99, draw: () => drawAvatar(c, heroLooks[2], Math.round(walker.x * T), walker.y * T, Math.abs(Math.cos(now / 1400)) > 0.15 ? 1 + (Math.floor(now / 170) % 2) : 0, false) },
    { y: 7.5, draw: () => put('sofa', 15 * T, 7 * T, '#f4a6b8') },
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

// A reset link carries its token in the fragment (`#reset?token=…`). Taking it out of the address bar
// after reading it keeps it out of history too.
const resetLink = /^#reset\?token=([A-Za-z0-9_-]{20,})$/.exec(location.hash);
if (resetLink) {
  resetToken = resetLink[1];
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  token = null;
  localStorage.removeItem('auralis.token'); // the link proves the address; it ends in a fresh session
}
if (token) connect();
else showLanding(true);
if (resetToken) setAuthMode('reset');
// Sent back here because the server no longer accepts our session: start on Log in and say why.
if (sessionStorage.getItem('auralis.sessionEnded')) {
  sessionStorage.removeItem('auralis.sessionEnded');
  ui.querySelector<HTMLButtonElement>('#authForm [data-mode="login"]')?.click();
  const notice = $('#authHint');
  notice.className = 'auth-note'; // a callout, not the usual grey helper line: it explains why you're here
  notice.textContent = 'Your session ended. Log back in to pick up where you left off.';
}
startLoop();

// Picture in picture: the whole app (room, timer, chat, buttons) moves into a small window and back.
// Chrome and Edge (116+) float it always-on-top (Document Picture-in-Picture). Every other browser (Opera, Firefox,
// Safari...) has no such API, so there it's a small pop-up window instead: same live app, just not pinned on top.
{
  const pipBtn = $<HTMLButtonElement>('#pip');
  const dpip = (window as unknown as { documentPictureInPicture?: { requestWindow(o: object): Promise<Window> } }).documentPictureInPicture;
  const moveTo = (to: Window) => {
    const from = ui;
    to.document.documentElement.className = from.documentElement.className;
    Object.assign(to.document.documentElement.dataset, from.documentElement.dataset);
    to.document.body.className = from.body.className;
    Object.assign(to.document.body.dataset, from.body.dataset);
    to.document.body.append(...Array.from(from.body.childNodes));
    ui = to.document; win = to;
    pipBtn.classList.toggle('on', to !== window);
    pipBtn.setAttribute('aria-pressed', String(to !== window));
    chromeDirty();
    startLoop();
  };
  pipBtn.hidden = false;
  pipBtn.addEventListener('click', async () => {
    if (win !== window) return win.close();
    try {
      const pw = dpip ? await dpip.requestWindow({ width: 420, height: 560 }) : window.open('', 'auralis-pip', 'popup,width=420,height=560');
      if (!pw) return toast('Your browser blocked the pop-up. Allow pop-ups for Auralis, then try again.', 'error');
      pw.document.title = 'Auralis';
      const base = pw.document.createElement('base'); // so relative links, images and cursors resolve like in the tab
      base.href = location.href;
      pw.document.head.append(base);
      for (const n of Array.from(document.head.querySelectorAll('link[rel=stylesheet], style'))) pw.document.head.append(n.cloneNode(true));
      for (const fn of keyFns) pw.addEventListener('keydown', fn);
      const back = () => { clearInterval(watch); if (win === pw) moveTo(window); };
      pw.addEventListener('pagehide', back, { once: true });
      const watch = setInterval(() => pw.closed && back(), 500); // pop-ups don't always say goodbye when closed
      moveTo(pw);
      if (!dpip) toast('Opened Auralis in a small window. Drag it beside your work. (Only Chrome and Edge can pin it on top.)');
    } catch { toast("Couldn't open picture in picture.", 'error'); }
  });
}
