// Ambient sounds that furniture plays on click, made live with Web Audio (no files). Each one is just for you.
type Start = (ctx: AudioContext, out: GainNode) => () => void; // starts the sound, returns what stops its timers

const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

function noise(ctx: AudioContext, seconds: number) {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

// Record player: a slow lo-fi chord loop with vinyl crackle.
const PROG = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]]; // Fmaj7 Em7 Dm7 Cmaj7
const BAR = 3.2; // seconds per chord
const music: Start = (ctx, out) => {
  const warm = ctx.createBiquadFilter();
  warm.type = 'lowpass';
  warm.frequency.value = 1800;
  warm.connect(out);
  const note = (m: number, at: number, len: number, vol: number, type: OscillatorType = 'triangle') => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.value = hz(m);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    o.connect(g).connect(warm);
    o.start(at);
    o.stop(at + len);
  };
  const vinyl = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate), d = vinyl.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.015 + (Math.random() < 0.0003 ? (Math.random() * 2 - 1) * 0.4 : 0);
  const src = ctx.createBufferSource();
  src.buffer = vinyl;
  src.loop = true;
  src.connect(out);
  src.start();
  let next = ctx.currentTime + 0.1, bar = 0;
  // Queue chords a second ahead so a late timer never leaves a gap.
  const schedule = () => {
    while (next < ctx.currentTime + 1) {
      const ch = PROG[bar % PROG.length];
      ch.forEach((m, i) => note(m, next + i * 0.03, BAR, 0.05)); // slightly strummed
      note(ch[0] - 12, next, BAR * 0.9, 0.09, 'sine');
      for (let k = 0; k < 4; k++) if (Math.random() < 0.35) note(ch[Math.floor(Math.random() * 4)] + 12, next + (k + 0.5) * BAR / 4, 1.4, 0.035, 'sine');
      next += BAR;
      bar++;
    }
  };
  schedule();
  const timer = setInterval(schedule, 250);
  return () => clearInterval(timer);
};

// Fireplace: a low roar under random crackles and pops, never the same twice.
const fire: Start = (ctx, out) => {
  const roar = ctx.createBufferSource(), low = ctx.createBiquadFilter(), roarVol = ctx.createGain();
  roar.buffer = noise(ctx, 4);
  roar.loop = true;
  low.type = 'lowpass';
  low.frequency.value = 350;
  roarVol.gain.value = 0.35;
  roar.connect(low).connect(roarVol).connect(out);
  roar.start();
  const snap = noise(ctx, 0.08), crisp = ctx.createBiquadFilter();
  crisp.type = 'highpass';
  crisp.frequency.value = 900;
  crisp.connect(out);
  const crackle = (at: number, vol: number) => {
    const s = ctx.createBufferSource(), g = ctx.createGain(), len = 0.004 + Math.random() * 0.03;
    s.buffer = snap;
    s.playbackRate.value = 0.5 + Math.random() * 1.5;
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + len);
    s.connect(g).connect(crisp);
    s.start(at);
    s.stop(at + len + 0.01);
  };
  const timer = setInterval(() => {
    const now = ctx.currentTime;
    for (let k = 0; k < 4; k++) if (Math.random() < 0.35) crackle(now + Math.random() * 0.1, 0.1 + Math.random() * 0.3);
    if (Math.random() < 0.04) for (let k = 0; k < 3 + Math.random() * 5; k++) crackle(now + k * (0.02 + Math.random() * 0.05), 0.3 + Math.random() * 0.5); // a log popping
  }, 100);
  return () => clearInterval(timer);
};

// Clocks: a tick and a slightly lower tock, knocked out of a short burst of noise through a resonant filter.
const clock = (pitch: number, every: number): Start => (ctx, out) => {
  const knock = noise(ctx, 0.03);
  const tick = (at: number, f: number) => {
    const s = ctx.createBufferSource(), ring = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = knock;
    ring.type = 'bandpass';
    ring.frequency.value = f;
    ring.Q.value = 12;
    g.gain.setValueAtTime(1.6, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.06);
    s.connect(ring).connect(g).connect(out);
    s.start(at);
    s.stop(at + 0.07);
  };
  let next = ctx.currentTime + 0.1, n = 0;
  const schedule = () => {
    for (; next < ctx.currentTime + 1; next += every, n++) tick(next, n % 2 ? pitch * 0.75 : pitch);
  };
  schedule();
  const timer = setInterval(schedule, 250);
  return () => clearInterval(timer);
};

// Shared pieces for the bands below.
// Plays a step, which returns how long it lasts; steps are queued half a second ahead so a late timer never leaves a gap.
function sequence(ctx: AudioContext, step: (at: number) => number) {
  let next = ctx.currentTime + 0.1;
  const tick = () => { while (next < ctx.currentTime + 0.5) next += step(next); };
  tick();
  const timer = setInterval(tick, 100);
  return () => clearInterval(timer);
}
function tone(ctx: AudioContext, dest: AudioNode, m: number, at: number, len: number, vol: number, type: OscillatorType, attack = 0.01, detune = 0) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.value = hz(m);
  o.detune.value = detune;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  o.connect(g).connect(dest);
  o.start(at);
  o.stop(at + len + 0.02);
}
function hit(ctx: AudioContext, dest: AudioNode, buf: AudioBuffer, at: number, vol: number, len: number, type: BiquadFilterType, freq: number, q = 1) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = buf;
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + len);
  s.connect(f).connect(g).connect(dest);
  s.start(at);
  s.stop(at + len + 0.02);
}
function lowpass(ctx: AudioContext, dest: AudioNode, freq: number) {
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  f.connect(dest);
  return f;
}
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

// Jazz band: walking bass, ride cymbal, piano comping and a sax solo every other chorus, on swung eighths.
// A playlist of tunes, each about a minute and a half, with its own key, tempo and changes.
const QUAL: Record<string, number[]> = { m7: [0, 3, 7, 10], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7b5: [0, 3, 6, 10] };
const JAZZ: { bpm: number; prog: [number, string][] }[] = [
  { bpm: 120, prog: [[50, 'm7'], [55, '7'], [48, 'maj7'], [48, 'maj7'], [52, 'm7'], [57, '7'], [50, 'm7'], [55, '7']] },
  { bpm: 100, prog: [[47, 'm7b5'], [52, '7'], [45, 'm7'], [45, 'm7'], [50, 'm7'], [55, '7'], [48, 'maj7'], [53, 'maj7']] },
  { bpm: 88, prog: [[53, '7'], [58, '7'], [53, '7'], [53, '7'], [58, '7'], [58, '7'], [53, '7'], [50, '7'], [55, 'm7'], [48, '7'], [53, '7'], [48, '7']] }, // slow blues in F
  { bpm: 132, prog: [[51, 'maj7'], [56, 'maj7'], [50, 'm7b5'], [55, '7'], [48, 'm7'], [48, 'm7'], [53, 'm7'], [46, '7']] },
];
const jazz: Start = (ctx, out) => {
  const air = noise(ctx, 0.5), bassTone = lowpass(ctx, out, 600), sax = lowpass(ctx, out, 1500);
  let tr = Math.floor(Math.random() * JAZZ.length), bar = 0, s = 0; // s = swung eighth within the bar, 0-7
  return sequence(ctx, (at) => {
    const tune = JAZZ[tr], len = tune.prog.length, b = 60 / tune.bpm;
    const [root, q] = tune.prog[bar % len], iv = QUAL[q], beat = s >> 1, off = s % 2 === 1;
    if (!off) {
      const nextRoot = tune.prog[(bar + 1) % len][0];
      const walk = beat === 0 ? root : beat === 3 ? nextRoot + pick([1, -1]) : root + pick(iv.slice(1));
      tone(ctx, bassTone, walk - 12, at, b * 0.95, 0.3, 'triangle');
      hit(ctx, out, air, at, 0.12, 0.35, 'bandpass', 7000, 2); // ride
      if (beat % 2) hit(ctx, out, air, at, 0.08, 0.05, 'highpass', 6000); // hi-hat foot on 2 and 4
    } else if (beat % 2) hit(ctx, out, air, at, 0.07, 0.2, 'bandpass', 7000, 2); // the swung "and" of the ride
    if (Math.random() < (off ? 0.2 : 0.1)) for (const i of [iv[1], iv[3], 14, iv[2] + 12]) tone(ctx, out, root + 12 + i, at, b * (off ? 0.9 : 1.4), 0.035, 'triangle');
    if (Math.floor(bar / len) % 2 && Math.random() < 0.5) tone(ctx, sax, root + 24 + pick([...iv, 2, 9]), at, b * 0.6, 0.05, 'sawtooth', 0.04);
    if (++s === 8) {
      s = 0;
      if (++bar >= Math.max(2, Math.round(90 / (4 * b * len))) * len) { bar = 0; tr = (tr + 1) % JAZZ.length; }
    }
    return off ? b / 3 : (b * 2) / 3;
  });
};

// DJ deck: a mellow EDM study mix. Kick on every beat with the pad pumping around it, offbeat bass and hats, an arpeggio,
// in 32-bar tracks: 8 bars of intro, 16 of drop, 8 of breakdown, then the next track.
const EDM: { bpm: number; prog: [number, number[]][] }[] = [
  { bpm: 122, prog: [[57, [0, 3, 7]], [53, [0, 4, 7]], [48, [0, 4, 7]], [55, [0, 4, 7]]] },
  { bpm: 124, prog: [[53, [0, 3, 7]], [49, [0, 4, 7]], [56, [0, 4, 7]], [51, [0, 4, 7]]] },
  { bpm: 120, prog: [[50, [0, 3, 7]], [46, [0, 4, 7]], [53, [0, 4, 7]], [48, [0, 4, 7]]] },
  { bpm: 126, prog: [[52, [0, 3, 7]], [48, [0, 4, 7]], [55, [0, 4, 7]], [50, [0, 4, 7]]] },
];
const edm: Start = (ctx, out) => {
  const air = noise(ctx, 0.5), pump = ctx.createGain(), pad = lowpass(ctx, pump, 800), bass = lowpass(ctx, out, 450), arp = lowpass(ctx, out, 2400);
  pump.connect(out);
  const kick = (at: number) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, at);
    o.frequency.exponentialRampToValueAtTime(45, at + 0.12);
    g.gain.setValueAtTime(0.9, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.35);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + 0.4);
    pump.gain.setValueAtTime(0.25, at); // the pad ducks under each kick
    pump.gain.linearRampToValueAtTime(1, at + 0.22);
  };
  let tr = Math.floor(Math.random() * EDM.length), bar = 0, s = 0; // s = sixteenth within the bar
  return sequence(ctx, (at) => {
    const t = EDM[tr], sx = 15 / t.bpm, [root, iv] = t.prog[bar % 4], part = bar < 8 ? 'intro' : bar < 24 ? 'drop' : 'break';
    if (s === 0) {
      pad.frequency.setValueAtTime(part === 'intro' ? 400 + bar * 150 : part === 'drop' ? 1600 : 900, at);
      for (const i of iv) for (const d of [-8, 8]) tone(ctx, pad, root + i, at, sx * 16, 0.04, 'sawtooth', 0.3, d);
    }
    if (part !== 'break' && s % 4 === 0) kick(at);
    if (part !== 'break' && s % 4 === 2) hit(ctx, out, air, at, 0.12, 0.05, 'highpass', 8000);
    if (part === 'drop') {
      if (s === 4 || s === 12) hit(ctx, out, air, at, 0.35, 0.14, 'bandpass', 1500);
      if (s % 2) hit(ctx, out, air, at, 0.04, 0.03, 'highpass', 9000);
      if (s % 4 === 2) tone(ctx, bass, root - 24, at, sx * 1.8, 0.3, 'sawtooth');
    }
    if ((bar >= 16 && s % 2 === 0) || part === 'break') tone(ctx, arp, root + 12 + iv[(s >> 1) % 3] + (s & 8 ? 12 : 0), at, sx * 1.5, 0.04, 'square');
    if (++s === 16) { s = 0; if (++bar === 32) { bar = 0; tr = (tr + 1) % EDM.length; } }
    return sx;
  });
};

// [what the toast calls it, the sound, whether it's music: only one music plays at a time]
const SOUNDS: Record<string, [string, Start, boolean?]> = {
  recordPlayer: ['Ambience', music, true],
  jazz: ['Jazz', jazz, true],
  djDeck: ['EDM study mix', edm, true],
  fireplace: ['Crackling fire', fire],
  grandClock: ['Tick-tock', clock(1400, 1)],
  alarmClock: ['Ticking', clock(2600, 0.5)],
};
// Every jazz instrument plays the same band, so two of them never play over each other.
const SAME: Record<string, string> = { piano: 'jazz', synth: 'jazz', saxophone: 'jazz', drumKit: 'jazz', guitar: 'jazz' };
const keyOf = (item: string) => SAME[item] ?? item;
const playing = new Map<string, { ctx: AudioContext; out: GainNode; stop: () => void }>();

export const soundName = (item: string) => SOUNDS[keyOf(item)]?.[0];

function stop(key: string) {
  const p = playing.get(key);
  if (!p) return;
  playing.delete(key);
  p.stop();
  p.out.gain.setValueAtTime(p.out.gain.value, p.ctx.currentTime);
  p.out.gain.linearRampToValueAtTime(0, p.ctx.currentTime + 0.6);
  setTimeout(() => p.ctx.close(), 700);
}

// Returns whether that sound is now playing. Must be called from a click (browsers only allow sound after one).
export function toggleSound(item: string): boolean {
  const key = keyOf(item);
  if (playing.has(key)) { stop(key); return false; }
  if (SOUNDS[key][2]) for (const k of [...playing.keys()]) if (SOUNDS[k][2]) stop(k);
  const ctx = new AudioContext(), out = ctx.createGain(), limit = ctx.createDynamicsCompressor();
  out.gain.setValueAtTime(0, ctx.currentTime);
  out.gain.linearRampToValueAtTime(0.8, ctx.currentTime + 1.5);
  out.connect(limit).connect(ctx.destination);
  playing.set(key, { ctx, out, stop: SOUNDS[key][1](ctx, out) });
  return true;
}
