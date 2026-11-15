// Shared TypeScript types for server-client communication
// These types represent the WebSocket message shapes

// Base message type
export interface BaseMessage {
  t: string; // message type
}

// Authentication & connection
export interface HelloMessage extends BaseMessage {
  t: 'hello';
  token: string;
  version: number;
}

export interface ErrorMessage extends BaseMessage {
  t: 'error';
  text: string;
}

export interface StateMessage extends BaseMessage {
  t: 'state';
  house: HouseState;
  me: MeState;
}

export interface HouseState {
  code: string;
  owner: string | null;
  ownerName: string | null;
  members: Member[];
  todos: Todo[];
  chat: Chat[];
  events: CalEvent[];
  announcements: Announcement[];
  watch: WatchState | null;
}

export interface MeState {
  id: string;
  home?: string;
  visited?: VisitedHouse[];
  banned?: BannedUser[];
  coins: number;
  discount?: boolean;
  notes: Note[];
  inbox: InboxItem[];
  inboxSeen: number;
  events: CalEvent[];
  inventory: Record<string, number>;
  crafted?: { item: string; col: string }[]; // made by hand: one real piece each, private to its owner
  petAccs: string[];
  sessions: Session[];
  subjects: string[];
  hiddenSubjects: string[];
  todos: Todo[];
  dm: Record<string, Chat[]>;
  groups: Record<string, Group>;
  friends: Friend[];
  notify: Record<string, boolean>;
  pushKey?: string;
}

// Member & player types
export interface Member {
  id: string;
  name: string;
  look: Look;
  rooms: Room[];
  focus: Focus | null;
  totalMinutes: number;
  online: boolean;
  pos: { x: number; y: number } | null;
  pets: Pet[];
  fedAt?: number;
  exams?: Exam[];
  caffeineSince?: number;
  caffeineUntil?: number;
  tipsyUntil?: number;
}

export interface Look {
  body: string;
  size: string;
  skin: string;
  style: string;
  hair: string;
  face: string;
  outfit: string;
  shirt: string;
  color?: { hair?: string; shirt?: string };
  accs?: string[];
}

export interface Room {
  wallpaper: string;
  floor: string;
  pattern?: string;
  floorStyle?: string;
  level?: number;
  curtains?: boolean;
  wallColor?: string;
  floorColor?: string;
  furniture: Furniture[];
}

export interface Furniture {
  item: string;
  x: number;
  y: number;
  v?: number;
  s?: number;
  flip?: boolean;
  rot?: number;
  wateredAt?: number;
  off?: boolean;
  col?: string;
  state?: { readyAt?: number }; // a piece's own cooldown, checked against the clock on both sides
}

export interface Pet {
  kind: string;
  name?: string;
  coat?: number;
  acc?: string;
  away?: boolean;
  follow?: boolean;
  bond?: number;
}

export interface Focus {
  minutes: number;
  endsAt: number;
  tag?: string;
  pausedAt?: number | null;
}

export interface Exam {
  subject: string;
  date: string;
}

// Todo types
export interface Todo {
  id: number;
  text: string;
  done: boolean;
  by: string;
  byId?: string;
  all?: boolean;
  to?: string[];
  ticks?: string[];
  at?: number;
  mine?: boolean;
  repeat?: 'daily' | 'weekly' | 'monthly';
  repeatUntil?: number;
  parentId?: number;
  priority?: 'low' | 'medium' | 'high';
}

// Chat types
export interface Chat {
  id: number;
  from: string;
  by: string;
  text: string;
  at: number;
  img?: string;
  replyTo?: number;
  replyBy?: string;
}

export interface Group {
  name: string;
  members: string[];
  msgs: Chat[];
}

// Calendar types
export interface CalEvent {
  id: number;
  date: string;
  time?: string;
  text: string;
  by?: string;
}

// Announcement types
export interface Announcement {
  id: number;
  text: string;
  by: string;
  byId: string;
  at: number;
}

// Watch party types
export interface WatchState {
  src: string;
  at: number;
  by: string;
  byId: string;
}

// Session types
export interface Session {
  at: number;
  minutes: number;
  tag: string;
  early?: boolean;
}

// Inbox types
export interface InboxItem {
  kind: string;
  from?: string;
  by?: string;
  text: string;
  at: number;
  n?: number;
}

// Note types
export interface Note {
  from: string;
  text: string;
  at: number;
}

// Friend types
export interface Friend {
  id: string;
  name: string;
  look: Look;
  online: boolean;
  focus: boolean;
  status: 'friend' | 'incoming' | 'outgoing';
  here?: boolean;
  visit?: boolean;
  asked?: boolean;
}

// Visited house
export interface VisitedHouse {
  code: string;
  ownerName: string | null;
  online: number;
}

// Banned user
export interface BannedUser {
  id: string;
  name: string;
}

// Board/leaderboard types
export interface Board {
  scope: string;
  period: string;
  rows: BoardRow[];
}

export interface BoardRow {
  name: string;
  me: boolean;
  minutes: number;
  members?: number;
}

// Client-to-server message types
export interface ClientMessages {
  // Auth
  hello: { t: 'hello'; token: string; version: number };
  // Focus
  focus_start: { t: 'focus_start'; minutes: number; tag?: string; tz: number };
  focus_pause: { t: 'focus_pause' };
  focus_resume: { t: 'focus_resume' };
  focus_end: { t: 'focus_end'; gaveUp?: boolean };
  focus_join: { t: 'focus_join'; id: string; tz: number };
  // Todo
  todo_add: { t: 'todo_add'; text: string; at?: number; all?: boolean; to?: string[]; repeat?: 'daily' | 'weekly' | 'monthly'; repeatUntil?: number; priority?: 'low' | 'medium' | 'high' };
  todo_edit: { t: 'todo_edit'; id: number; text: string; at?: number; all?: boolean; to?: string[]; repeat?: 'daily' | 'weekly' | 'monthly' | null; repeatUntil?: number | null; priority?: 'low' | 'medium' | 'high' | null };
  todo_toggle: { t: 'todo_toggle'; id: number };
  todo_del: { t: 'todo_del'; id: number };
  // Personal todo
  ptodo_add: { t: 'ptodo_add'; text: string };
  ptodo_toggle: { t: 'ptodo_toggle'; id: number };
  ptodo_del: { t: 'ptodo_del'; id: number };
  // Chat
  chat: { t: 'chat'; text: string; img?: string; replyTo?: number };
  dm: { t: 'dm'; to: string; text: string; img?: string; replyTo?: number };
  gmsg: { t: 'gmsg'; g: string; text: string; img?: string; replyTo?: number };
  // History
  history: { t: 'history'; k: 'h' | 'd' | 'g'; id?: string; before: number };
  // Friends
  friend_request: { t: 'friend_request'; name?: string; id?: string };
  friend_accept: { t: 'friend_accept'; id: string };
  friend_remove: { t: 'friend_remove'; id: string };
  friend_search: { t: 'friend_search'; q: string };
  // Groups
  group_new: { t: 'group_new'; name: string; members: string[] };
  group_leave: { t: 'group_leave'; g: string };
  // Calendar
  event_add: { t: 'event_add'; scope: 'house' | 'personal'; date: string; time?: string; text: string };
  event_del: { t: 'event_del'; scope: 'house' | 'personal'; id: number };
  // Announcements
  announcement_add: { t: 'announcement_add'; text: string };
  announcement_del: { t: 'announcement_del'; id: number };
  // Exams
  exam_add: { t: 'exam_add'; subject: string; date: string };
  exam_del: { t: 'exam_del'; index: number };
  // Notes
  note: { t: 'note'; to: string; text: string };
  // Look/pet
  look: { t: 'look'; name: string; look: Look };
  pet_style: { t: 'pet_style'; slot: number; name?: string; away?: boolean; follow?: boolean; coat?: number; acc?: string };
  pet_release: { t: 'pet_release'; slot: number };
  // Notifications
  notify_prefs: { t: 'notify_prefs'; prefs: Record<string, boolean> };
  push_sub: { t: 'push_sub'; sub: PushSubscriptionJSON };
  inbox_read: { t: 'inbox_read' };
  inbox_clear: { t: 'inbox_clear' };
  notes_read: { t: 'notes_read' };
  // Watch
  watch: { t: 'watch'; url: string };
  // Join/leave
  join: { t: 'join'; code: string };
  leave: { t: 'leave' };
  forget: { t: 'forget'; code: string };
  visit_ask: { t: 'visit_ask'; id: string };
  visit_answer: { t: 'visit_answer'; id: string; yes: boolean };
  kick: { t: 'kick'; id: string };
  unban: { t: 'unban'; id: string };
  // Gift
  gift: { t: 'gift'; to: string };
  // Snapshot
  snapshot: { t: 'snapshot' };
  // Room furniture
  place: { t: 'place'; item: string; room: number; x: number; y: number; rot?: number; flip?: boolean; v?: number; s?: number };
  move: { t: 'move'; item: string; room: number; x: number; y: number; rot?: number; flip?: boolean };
  remove: { t: 'remove'; item: string; room: number; x: number; y: number };
  // Lights/curtains
  lights: { t: 'lights'; room: number; x: number; y: number };
  curtains: { t: 'curtains'; room: number; x: number; y: number };
  // Chimes
  chimes: { t: 'chimes'; on: boolean };
  // Custom focus
  custom_focus: { t: 'custom_focus'; minutes: number; tag: string; tz: number };
  // Sound stop
  stopAll: { t: 'stopAll' };
  // Profile
  set_theme: { t: 'set_theme'; theme: string };
  set_lang: { t: 'set_lang'; lang: string };
  // PIP
  pip: { t: 'pip'; on: boolean };
  // Drinks
  brew: { t: 'brew'; owner: string; r: number; index: number };
  claw: { t: 'claw'; owner: string; r: number; index: number };
}

// Server-to-client message types
export interface ServerMessages {
  hello: { t: 'hello'; ok: boolean; version: number };
  state: StateMessage;
  error: ErrorMessage;
  // Focus
  focus_started: { t: 'focus_started'; by: string; minutes: number; tag: string; endsAt: number; multi: boolean };
  focus_paused: { t: 'focus_paused'; by: string };
  focus_resumed: { t: 'focus_resumed'; by: string };
  focus_ended: { t: 'focus_ended'; by: string; minutes: number; tag: string; early: boolean; coins: number; totalMinutes: number; streak: number };
  focus_update: { t: 'focus_update'; by: string; endsAt: number; pausedAt?: number | null };
  study_invite: { t: 'study_invite'; by: string; tag: string; minutes: number; endsAt: number };
  // Todo
  todo_assigned: { t: 'todo_assigned'; by: string; text: string; id: number };
  todo_completed: { t: 'todo_completed'; by: string; text: string; id: number };
  // Chat
  chat: Chat;
  dm: Chat;
  gmsg: Chat;
  history: { t: 'history'; k: 'h' | 'd' | 'g'; id: string | null; msgs: Chat[] };
  // Friends
  friend_request: { t: 'friend_request'; from: string; name: string; look: Look };
  friend_accept: { t: 'friend_accept'; id: string; name: string; look: Look };
  friend_remove: { t: 'friend_remove'; id: string };
  friend_search: { t: 'friend_search'; results: { id: string; name: string; look: Look }[] };
  // Groups
  group_new: { t: 'group_new'; g: string; name: string; members: string[] };
  group_leave: { t: 'group_leave'; g: string; members: string[] };
  // Calendar
  event_added: { t: 'event_added'; scope: 'house' | 'personal'; event: CalEvent };
  event_removed: { t: 'event_removed'; scope: 'house' | 'personal'; id: number };
  // Announcements
  announcement_added: { t: 'announcement_added'; announcement: Announcement };
  announcement_removed: { t: 'announcement_removed'; id: number };
  // Exams
  exam_added: { t: 'exam_added'; subject: string; date: string };
  exam_removed: { t: 'exam_removed'; index: number };
  // Notes
  note: { t: 'note'; from: string; text: string; at: number };
  // Inbox
  inbox: { t: 'inbox'; inbox: InboxItem[] };
  // Notifications
  notify: { t: 'notify'; kind: string; from?: string; text: string };
  // Watch
  watch: WatchState;
  watch_ended: { t: 'watch_ended' };
  // House
  house_update: { t: 'house_update'; house: Partial<HouseState> };
  // Coins
  coins: { t: 'coins'; coins: number; discount?: boolean };
  // Pet
  pet_found: { t: 'pet_found'; kind: string; coins: number };
  // Sound
  chime: { t: 'chime' };
  stopAll: { t: 'stopAll' };
  // PIP
  pip: { t: 'pip'; on: boolean };
  // Board
  board: Board;
  // Theme
  theme: { t: 'theme'; theme: string };
  // Lang
  lang: { t: 'lang'; lang: string };
}

// Utility types
export type MessageType = keyof ClientMessages | keyof ServerMessages;

export type ClientMessage = ClientMessages[keyof ClientMessages];
export type ServerMessage = ServerMessages[keyof ServerMessages];

// Push subscription
export interface PushSubscriptionJSON {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}