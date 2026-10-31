// Watch party: /watch <link> in chat opens the same video for everyone in the house, kept in sync.
// The server holds { playing, pos, at }; anyone's play, pause or seek becomes the new truth and everyone follows.
type Src = { kind: string; id?: string; url?: string; start: number };
export type Watch = { src: Src; by: string; byName: string; playing: boolean; pos: number; at: number; now: number } | null;
type Player = { state(): Promise<[number, boolean]>; play(): void; pause(): void; seek(s: number): void; destroy(): void };
type Send = (m: object) => void;

let key = '', lastAt = 0, closed = false;
let base = { playing: false, pos: 0, t0: 0 }; // the shared position, measured on our own clock
let panel: HTMLElement | null = null, player: Player | null = null, timer = 0, stuck = 0, lastSeek = 0;
// Commands we gave our own player, waiting for the event they cause (times in ms), so that event isn't shared as news.
type Kind = 'play' | 'pause' | 'seek';
let pending: Record<Kind, number[]> = { play: [], pause: [], seek: [] };
const expect = (k: Kind) => pending[k].push(Date.now());
// Forget commands whose event never came (3 s is plenty), so they can't swallow a real one later.
function prune() {
  for (const k of ['play', 'pause', 'seek'] as Kind[]) pending[k] = pending[k].filter((t) => Date.now() - t < 3000);
}
let send: Send = () => {};

const expected = () => base.pos + (base.playing ? (Date.now() - base.t0) / 1000 : 0);

export function syncWatch(w: Watch, myId: string, sendFn: Send) {
  send = sendFn;
  if (!w) { teardown(); key = ''; return; }
  base = { playing: w.playing, pos: w.pos + (w.playing ? (w.now - w.at) / 1000 : 0), t0: Date.now() };
  const k = JSON.stringify(w.src);
  if (k !== key) {
    teardown();
    key = k;
    lastAt = w.at;
    closed = false;
    open(w, w.by === myId);
  } else if (w.at !== lastAt) {
    lastAt = w.at;
    apply();
  }
}

function teardown() {
  clearInterval(timer);
  stuck = 0;
  pending = { play: [], pause: [], seek: [] };
  player?.destroy();
  player = null;
  panel?.remove();
  panel = null;
}

function open(w: NonNullable<Watch>, starter: boolean) {
  panel = document.createElement('div');
  panel.className = 'theater';
  const live = ['youtube', 'vimeo', 'file'].includes(w.src.kind);
  panel.innerHTML = `<div class="theater-bar"><b>🎬 Watch party</b><span></span><button class="off" aria-label="Hide the watch party">✕</button></div>
    <div class="theater-screen"><div></div><button class="theater-join">▶ Join the watch party</button></div>
    <p class="theater-hint">Everyone in the house sees this. ${live ? '' : "Pause and seek aren't shared for this site. "}Type <b>/watch stop</b> in chat to end it.</p>`;
  panel.querySelector('span')!.textContent = `started by ${w.byName}`;
  panel.querySelector('.theater-bar button')!.addEventListener('click', () => { closed = true; teardown(); });
  const join = panel.querySelector<HTMLButtonElement>('.theater-join')!;
  // Browsers only allow sound after a click, so everyone but the starter (who just pressed Enter) clicks to join.
  join.addEventListener('click', () => { join.remove(); start(w.src); });
  document.body.append(panel);
  if (starter) { join.remove(); start(w.src); }
}

function start(src: Src) {
  const el = panel!.querySelector<HTMLElement>('.theater-screen > div')!;
  const at = expected();
  if (src.kind === 'youtube') player = youtube(el, src.id!, at);
  else if (src.kind === 'vimeo') player = vimeo(el, src.id!, at);
  else if (src.kind === 'file') player = file(el, src.url!, at);
  else el.replaceWith(frame(src, at));
  if (player) timer = window.setInterval(apply, 2000);
}

// The browser blocked playing with sound (no click on this page yet): ask for one instead of retrying forever.
function needClick() {
  if (!panel || panel.querySelector('.theater-join')) return;
  const b = document.createElement('button');
  b.className = 'theater-join';
  b.textContent = '▶ Click to play';
  b.addEventListener('click', () => { b.remove(); stuck = 0; expect('play'); player?.play(); });
  panel.querySelector('.theater-screen')!.append(b);
}

// Bring our player in line with the shared state: seek if we've drifted, and match play/pause.
async function apply() {
  if (!player || panel?.querySelector('.theater-join')) return;
  const p = player, [t, playing] = await p.state().catch(() => [0, false] as [number, boolean]);
  prune();
  if (base.playing && !playing && ++stuck >= 3) { needClick(); return; }
  if (playing || !base.playing) stuck = 0;
  // On a slow connection a seek takes a while to land; seeking again every 2 s would never let it catch up.
  const off = Math.abs(t - expected());
  if (off > 2 && (Date.now() - lastSeek > 4000 || off > 10)) { lastSeek = Date.now(); expect('seek'); p.seek(expected()); }
  if (playing !== base.playing) { expect(base.playing ? 'play' : 'pause'); if (base.playing) p.play(); else p.pause(); }
}

// Our own viewer pressed play, pause or seeked (kind 'yt': YouTube, which reports seeks as play/pause): share it,
// unless it's the echo of a command we gave.
function user(kind: Kind | 'yt', playing: boolean, pos: number) {
  const now = Date.now();
  prune();
  const mine = kind !== 'yt' ? pending[kind] : pending.seek.length ? pending.seek : pending[playing ? 'play' : 'pause'];
  if (mine.length) { mine.shift(); return; }
  const jumped = Math.abs(pos - expected()) > 2.5;
  if (playing === base.playing && (kind === 'play' || kind === 'pause' || !jumped)) return; // nothing new, e.g. done buffering
  base = { playing, pos, t0: now };
  send({ t: 'watchCtl', playing, pos });
}

const scripts = new Map<string, Promise<void>>();
function load(src: string, ready: () => boolean) {
  if (!scripts.has(src)) {
    scripts.set(src, new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onerror = reject;
      document.head.append(s);
      const t = setInterval(() => { if (ready()) { clearInterval(t); resolve(); } }, 50);
    }));
  }
  return scripts.get(src)!;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function youtube(el: HTMLElement, id: string, at: number): Player {
  let yt: any = null;
  load('https://www.youtube.com/iframe_api', () => !!(window as any).YT?.Player).then(() => {
    if (!el.isConnected) return; // closed while the script loaded
    yt = new (window as any).YT.Player(el, {
      videoId: id,
      host: 'https://www.youtube-nocookie.com', // YouTube's privacy mode: no tracking cookies until you play
      playerVars: { start: Math.floor(at), autoplay: 1, playsinline: 1, rel: 0 },
      events: {
        onReady: () => apply(),
        onStateChange: (e: { data: number }) => { if (e.data === 1 || e.data === 2) user('yt', e.data === 1, yt.getCurrentTime()); },
      },
    });
  });
  return {
    state: async () => [yt?.getCurrentTime?.() ?? 0, [1, 3].includes(yt?.getPlayerState?.())], // 3 = buffering, counts as playing
    play: () => yt?.playVideo?.(),
    pause: () => yt?.pauseVideo?.(),
    seek: (s) => yt?.seekTo?.(s, true),
    destroy: () => yt?.destroy?.(),
  };
}

function vimeo(el: HTMLElement, id: string, at: number): Player {
  let v: any = null;
  load('https://player.vimeo.com/api/player.js', () => !!(window as any).Vimeo?.Player).then(() => {
    if (!el.isConnected) return;
    v = new (window as any).Vimeo.Player(el, { id: Number(id), autoplay: true, dnt: true }); // dnt: no tracking
    v.ready().then(() => { expect('seek'); return v.setCurrentTime(at); }).then(apply).catch(() => {});
    v.on('play', (d: { seconds: number }) => user('play', true, d.seconds));
    v.on('pause', (d: { seconds: number }) => user('pause', false, d.seconds));
    v.on('seeking', async (d: { seconds: number }) => user('seek', !(await v.getPaused()), d.seconds));
  });
  return {
    state: async () => (v ? [await v.getCurrentTime(), !(await v.getPaused())] : [0, false]),
    play: () => v?.play().catch(() => {}),
    pause: () => v?.pause().catch(() => {}),
    seek: (s) => v?.setCurrentTime(s).catch(() => {}),
    destroy: () => v?.destroy().catch(() => {}),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function file(el: HTMLElement, url: string, at: number): Player {
  const v = document.createElement('video');
  v.src = url;
  v.controls = v.playsInline = v.autoplay = true;
  v.addEventListener('loadedmetadata', () => { if (at > 2) { expect('seek'); v.currentTime = at; } apply(); }, { once: true });
  v.addEventListener('play', () => user('play', true, v.currentTime));
  v.addEventListener('pause', () => user('pause', false, v.currentTime));
  // 'seeking' fires the moment a seek starts; 'seeked' can come many seconds later on a slow connection.
  v.addEventListener('seeking', () => user('seek', !v.paused, v.currentTime));
  el.replaceWith(v);
  return {
    state: async () => [v.currentTime, !v.paused],
    play: () => { v.play().catch(() => {}); },
    pause: () => v.pause(),
    seek: (s) => { v.currentTime = s; },
    destroy: () => v.removeAttribute('src'),
  };
}

// Twitch and Dailymotion: a plain embed that opens at the shared spot.
function frame(src: Src, at: number) {
  const f = document.createElement('iframe');
  const s = Math.floor(at), hms = `${Math.floor(s / 3600)}h${Math.floor(s / 60) % 60}m${s % 60}s`;
  f.src = src.kind === 'dailymotion'
    ? `https://www.dailymotion.com/embed/video/${src.id}?autoplay=1&start=${s}`
    : `https://player.twitch.tv/?${src.kind === 'twitch' ? `channel=${src.id}` : `video=v${src.id}&time=${hms}`}&parent=${location.hostname}&autoplay=true`;
  f.allow = 'autoplay; fullscreen; picture-in-picture';
  f.allowFullscreen = true;
  return f;
}
