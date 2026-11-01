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

// Jazz instruments: each one plays its own part (piano comps, drums swing, cello walks the bass...), all on one shared
// clock and playlist, so instruments switched on together play as a band instead of over each other.
const QUAL: Record<string, number[]> = { m7: [0, 3, 7, 10], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7b5: [0, 3, 6, 10] };
const SCALE: Record<string, number[]> = { m7: [0, 2, 3, 5, 7, 9, 10], '7': [0, 2, 4, 5, 7, 9, 10], maj7: [0, 2, 4, 5, 7, 9, 11], m7b5: [0, 1, 3, 5, 6, 8, 10] };
const JAZZ: { bpm: number; prog: [number, string][] }[] = [
  { bpm: 120, prog: [[50, 'm7'], [55, '7'], [48, 'maj7'], [48, 'maj7'], [52, 'm7'], [57, '7'], [50, 'm7'], [55, '7']] },
  { bpm: 100, prog: [[47, 'm7b5'], [52, '7'], [45, 'm7'], [45, 'm7'], [50, 'm7'], [55, '7'], [48, 'maj7'], [53, 'maj7']] },
  { bpm: 88, prog: [[53, '7'], [58, '7'], [53, '7'], [53, '7'], [58, '7'], [58, '7'], [53, '7'], [50, '7'], [55, 'm7'], [48, '7'], [53, '7'], [48, '7']] }, // slow blues in F
  { bpm: 132, prog: [[51, 'maj7'], [56, 'maj7'], [50, 'm7b5'], [55, '7'], [48, 'm7'], [48, 'm7'], [53, 'm7'], [46, '7']] },
];
// How many bars each tune runs: about a minute and a half, in whole choruses.
const tuneBars = (t: (typeof JAZZ)[number]) => Math.max(2, Math.round(90 / ((4 * 60 / t.bpm) * t.prog.length))) * t.prog.length;
const band = { start: 0, first: 0, on: 0 }; // wall-clock start (s), which tune it began on, instruments playing
const wall = () => performance.now() / 1000;

type Beat = {
  root: number; q: string; iv: number[]; scale: number[]; nextRoot: number;
  bar: number; beat: number; off: boolean; b: number; chorus: number; barsLeft: number;
};
// Where the band is at wall time w, snapped to the swung-eighth grid at or after it.
function bandAt(w: number): { at: number; beat: Beat } {
  let t = w - band.start, tr = band.first;
  for (;;) { // skip whole tunes
    const tune = JAZZ[tr % JAZZ.length], len = tuneBars(tune) * 4 * 60 / tune.bpm;
    if (t < len) break;
    t -= len; tr++;
  }
  const tune = JAZZ[tr % JAZZ.length], b = 60 / tune.bpm, beats = t / b;
  let whole = Math.floor(beats), frac = beats - whole;
  let off = false;
  if (frac > 1e-6 && frac <= 2 / 3 + 1e-6) { off = true; frac = 2 / 3; } else if (frac > 2 / 3) { whole++; frac = 0; }
  const at = w + ((whole + frac) - beats) * b;
  const bars = tuneBars(tune), barN = Math.floor(whole / 4);
  if (barN >= bars) return bandAt(at + 1e-4); // rolled into the next tune
  const len = tune.prog.length, [root, q] = tune.prog[barN % len];
  return {
    at,
    beat: { root, q, iv: QUAL[q], scale: SCALE[q], nextRoot: tune.prog[(barN + 1) % len][0], bar: barN % len, beat: whole % 4, off, b, chorus: Math.floor(barN / len), barsLeft: bars - barN },
  };
}
// Calls play for every swung eighth, on the band's clock, half a second ahead.
function bandSequence(ctx: AudioContext, play: (at: number, beat: Beat) => void) {
  if (!band.on++) { band.start = wall(); band.first = Math.floor(Math.random() * JAZZ.length); }
  let next = wall() + 0.15;
  const tick = () => {
    const now = wall();
    while (next < now + 0.5) {
      const { at, beat } = bandAt(next);
      play(ctx.currentTime + (at - now), beat);
      next = at + (beat.off ? beat.b / 3 : (beat.b * 2) / 3) - 1e-4;
    }
  };
  tick();
  const timer = setInterval(tick, 100);
  return () => { clearInterval(timer); band.on--; };
}

// An improvising line: steps along the chord's scale, lands on chord tones on the beat, breathes between phrases.
function improviser(lo: number, hi: number, busy: number) {
  let note = (lo + hi) >> 1, resting = 0;
  return (bt: Beat): number | null => {
    if (!bt.off && bt.beat === 0 && bt.bar % 2 === 0) resting = Math.random() < 0.35 ? 4 + Math.floor(Math.random() * 4) : 0; // a phrase, or a breath
    if (resting > 0) { resting--; return null; }
    if (Math.random() > busy) return null;
    const pool: number[] = [];
    for (let o = -24; o <= 36; o += 12) for (const s of (bt.off ? bt.scale : bt.iv)) pool.push(bt.root + o + s);
    const near = pool.filter((m) => m >= lo && m <= hi && Math.abs(m - note) <= (Math.random() < 0.2 ? 7 : 3) && m !== note);
    note = near.length ? pick(near) : pick(pool.filter((m) => m >= lo && m <= hi));
    return note;
  };
}

// Sounds for each instrument.
function pluck(ctx: AudioContext, dest: AudioNode, m: number, at: number, len: number, vol: number, bright: number, type: OscillatorType = 'sawtooth') {
  const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = type;
  o.frequency.value = hz(m);
  f.type = 'lowpass';
  f.frequency.setValueAtTime(bright, at);
  f.frequency.exponentialRampToValueAtTime(Math.max(200, hz(m) * 1.5), at + len * 0.6); // the string's brightness dies first
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  o.connect(f).connect(g).connect(dest);
  o.start(at);
  o.stop(at + len + 0.02);
}
// A sustained, singing note (sax, violin): a soft attack and a vibrato that comes in late.
function sing(ctx: AudioContext, dest: AudioNode, m: number, at: number, len: number, vol: number, type: OscillatorType, cutoff: number, vib: number) {
  const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain();
  o.type = type;
  o.frequency.value = hz(m);
  lfo.frequency.value = 5.5;
  depth.gain.setValueAtTime(0, at);
  depth.gain.linearRampToValueAtTime(vib, at + Math.min(len, 0.35));
  lfo.connect(depth).connect(o.detune);
  f.type = 'lowpass';
  f.frequency.value = cutoff;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.05);
  g.gain.setValueAtTime(vol, at + len * 0.8);
  g.gain.linearRampToValueAtTime(0.0001, at + len + 0.06);
  o.connect(f).connect(g).connect(dest);
  o.start(at); lfo.start(at);
  o.stop(at + len + 0.1); lfo.stop(at + len + 0.1);
}
// Electric piano: a sine with a bell-like overtone that fades fast.
function rhodes(ctx: AudioContext, dest: AudioNode, m: number, at: number, len: number, vol: number) {
  const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
  car.frequency.value = hz(m);
  mod.frequency.value = hz(m) * 7;
  mg.gain.setValueAtTime(hz(m) * 1.2, at);
  mg.gain.exponentialRampToValueAtTime(1, at + 0.3);
  mod.connect(mg).connect(car.frequency);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  car.connect(g).connect(dest);
  car.start(at); mod.start(at);
  car.stop(at + len + 0.02); mod.stop(at + len + 0.02);
}
const voicing = (bt: Beat) => [bt.iv[1], bt.iv[3], 14, bt.iv[2] + 12].map((i) => bt.root + 12 + i); // rootless: 3, 7, 9, 5
const thump = (ctx: AudioContext, dest: AudioNode, at: number, from: number, to: number, vol: number, len: number) => {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(from, at);
  o.frequency.exponentialRampToValueAtTime(to, at + len * 0.5);
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + len);
  o.connect(g).connect(dest);
  o.start(at);
  o.stop(at + len + 0.02);
};

const piano: Start = (ctx, out) => {
  const room = lowpass(ctx, out, 3200), right = improviser(67, 86, 0.75);
  const key = (m: number, at: number, len: number, vol: number) => { tone(ctx, room, m, at, len, vol, 'triangle', 0.004); tone(ctx, room, m + 12, at, len * 0.5, vol * 0.25, 'sine', 0.004); };
  return bandSequence(ctx, (at, bt) => {
    // Left hand: Charleston comping, on 1 and the "and" of 2, sometimes pushed.
    if ((!bt.off && bt.beat === 0) || (bt.off && bt.beat === 1) || (Math.random() < 0.08 && bt.off)) for (const m of voicing(bt)) key(m - 12, at, bt.b * 1.2, 0.04);
    if (!bt.off && bt.beat === 0 && bt.chorus === 0) key(bt.root - 12, at, bt.b * 2, 0.05);
    // Right hand: improvised lines from the second chorus on, melody fragments in the first.
    const m = right(bt);
    if (m !== null && (bt.chorus > 0 || Math.random() < 0.4)) key(m, at, bt.b * 0.9, 0.06);
  });
};
const guitar: Start = (ctx, out) => {
  const body = lowpass(ctx, out, 2600), fills = improviser(55, 76, 0.6);
  return bandSequence(ctx, (at, bt) => {
    // Four to the bar, short and muted, the way rhythm guitar holds a big band together.
    if (!bt.off) [bt.root - 12, bt.root - 12 + bt.iv[3], bt.root + bt.iv[1]].forEach((m, i) => pluck(ctx, body, m, at + i * 0.012, bt.b * 0.45, bt.beat % 2 ? 0.05 : 0.06, 1800));
    // Single-note fills in the last two bars of a chorus.
    if (bt.bar >= 6 || bt.barsLeft <= 2) { const m = fills(bt); if (m !== null) pluck(ctx, body, m, at, bt.b * 0.8, 0.07, 2400); }
  });
};
const saxophone: Start = (ctx, out) => {
  const air = noise(ctx, 0.5), horn = lowpass(ctx, out, 1700), line = improviser(58, 77, 0.8);
  return bandSequence(ctx, (at, bt) => {
    const m = line(bt);
    if (m === null) return;
    const len = bt.off ? bt.b / 3 : (bt.b * 2) / 3;
    sing(ctx, horn, m, at, len * (Math.random() < 0.2 ? 2.6 : 1.05), 0.07, 'sawtooth', 1500, 14);
    hit(ctx, horn, air, at, 0.02, len, 'bandpass', 1800, 1); // breath
  });
};
const drumKit: Start = (ctx, out) => {
  const air = noise(ctx, 0.5);
  return bandSequence(ctx, (at, bt) => {
    if (!bt.off) {
      hit(ctx, out, air, at, 0.13, 0.4, 'bandpass', 7000, 2); // ride
      if (bt.beat % 2) hit(ctx, out, air, at, 0.09, 0.05, 'highpass', 6000); // hi-hat on 2 and 4
      thump(ctx, out, at, 90, 50, 0.18, 0.18); // feathered kick
    } else if (bt.beat % 2) hit(ctx, out, air, at, 0.08, 0.22, 'bandpass', 7000, 2); // the swung "and"
    // brushes: a soft swish on the beat, comping snare taps on the offbeats
    if (!bt.off) hit(ctx, out, air, at, 0.03, bt.b * 0.6, 'bandpass', 2500, 0.7);
    if (bt.off && Math.random() < 0.18) hit(ctx, out, air, at, 0.12, 0.08, 'bandpass', 1800, 1.5);
    // a fill to close each chorus
    if (bt.bar === 7 && bt.beat >= 2) { hit(ctx, out, air, at, 0.2, 0.1, 'bandpass', 1600, 1.5); if (bt.off) thump(ctx, out, at, 160, 80, 0.2, 0.2); }
  });
};
const synth: Start = (ctx, out) => {
  const keys = lowpass(ctx, out, 2400), line = improviser(64, 82, 0.5);
  return bandSequence(ctx, (at, bt) => {
    if ((!bt.off && bt.beat === 0) || (bt.off && bt.beat === 2 && Math.random() < 0.6)) for (const m of voicing(bt)) rhodes(ctx, keys, m, at, bt.b * 2.5, 0.035);
    const m = line(bt);
    if (m !== null && bt.chorus % 2 === 1) rhodes(ctx, keys, m, at, bt.b * 1.2, 0.05);
  });
};
const cello: Start = (ctx, out) => {
  const wood = lowpass(ctx, out, 900);
  return bandSequence(ctx, (at, bt) => {
    if (bt.off) return;
    // Walking bass, plucked: the root on 1, chord tones through the bar, a half step into the next chord on 4.
    const m = bt.beat === 0 ? bt.root : bt.beat === 3 ? bt.nextRoot + pick([1, -1]) : bt.root + pick(bt.iv.slice(1));
    pluck(ctx, wood, m - 12, at, bt.b * 0.95, 0.28, 700, 'triangle');
  });
};
const violin: Start = (ctx, out) => {
  const strings = lowpass(ctx, out, 3500), line = improviser(67, 91, 0.85);
  return bandSequence(ctx, (at, bt) => {
    const m = line(bt);
    if (m !== null) sing(ctx, strings, m, at, (bt.off ? bt.b / 3 : (bt.b * 2) / 3) * 1.1, 0.045, 'sawtooth', 3000, 22);
  });
};
const harp: Start = (ctx, out) => {
  const strings = lowpass(ctx, out, 4000);
  return bandSequence(ctx, (at, bt) => {
    if (bt.off || bt.beat % 2) return;
    // A rolled chord up two octaves every half bar.
    const notes = [...bt.iv, ...bt.iv.map((i) => i + 12), 24].map((i) => bt.root + i);
    notes.forEach((m, k) => tone(ctx, strings, m, at + k * 0.07, 2.2, 0.035, 'triangle', 0.003));
  });
};
const dhol: Start = (ctx, out) => {
  const air = noise(ctx, 0.3);
  return bandSequence(ctx, (at, bt) => {
    // Chaal: the deep bass side on the beat, the stick's crack on the swung "and"s.
    if (!bt.off) thump(ctx, out, at, bt.beat % 2 ? 110 : 75, 45, 0.5, 0.3);
    if (bt.off || bt.beat % 2) hit(ctx, out, air, at, 0.18, 0.06, 'bandpass', 2400, 3);
    if (bt.off && bt.beat === 3) thump(ctx, out, at, 95, 50, 0.35, 0.2);
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

// [what the toast calls it, the sound, what kind: 'music' plays alone; band instruments play together, but not over music]
const SOUNDS: Record<string, [string, Start, ('music' | 'band')?]> = {
  recordPlayer: ['Ambience', music, 'music'],
  djDeck: ['EDM study mix', edm, 'music'],
  piano: ['Jazz piano', piano, 'band'],
  guitar: ['Jazz guitar', guitar, 'band'],
  saxophone: ['Sax solo', saxophone, 'band'],
  drumKit: ['Jazz drums', drumKit, 'band'],
  synth: ['Electric piano', synth, 'band'],
  cello: ['Walking bass', cello, 'band'],
  violin: ['Swing violin', violin, 'band'],
  harp: ['Harp', harp, 'band'],
  dhol: ['Dhol beat', dhol, 'band'],
  fireplace: ['Crackling fire', fire],
  grandClock: ['Tick-tock', clock(1400, 1)],
  alarmClock: ['Ticking', clock(2600, 0.5)],
};
const keyOf = (item: string) => item;
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

// Silence everything: furniture sounds belong to the house they were started in, so leaving it (or being asked to
// leave, or signing out) stops them.
export function stopAllSounds() { for (const key of [...playing.keys()]) stop(key); }

// Returns whether that sound is now playing. Must be called from a click (browsers only allow sound after one).
export function toggleSound(item: string): boolean {
  const key = keyOf(item);
  if (playing.has(key)) { stop(key); return false; }
  // Music stops everything else that's music; a band instrument only stops music, so the band can grow.
  const kind = SOUNDS[key][2];
  if (kind) for (const k of [...playing.keys()]) if (SOUNDS[k][2] === 'music' || (kind === 'music' && SOUNDS[k][2])) stop(k);
  const ctx = new AudioContext(), out = ctx.createGain(), limit = ctx.createDynamicsCompressor();
  out.gain.setValueAtTime(0, ctx.currentTime);
  out.gain.linearRampToValueAtTime(0.8, ctx.currentTime + 1.5);
  out.connect(limit).connect(ctx.destination);
  playing.set(key, { ctx, out, stop: SOUNDS[key][1](ctx, out) });
  return true;
}

// A few soft sine notes in a row. Fine outside a click once the page has been clicked before.
function notes(list: number[], gap: number, vol: number) {
  const ctx = new AudioContext();
  list.forEach((m, i) => {
    const o = ctx.createOscillator(), g = ctx.createGain(), at = ctx.currentTime + 0.05 + i * gap;
    o.type = 'sine';
    o.frequency.value = hz(m);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 1.2);
    o.connect(g).connect(ctx.destination);
    o.start(at);
    o.stop(at + 1.3);
  });
  setTimeout(() => ctx.close(), 2500);
}
export const chime = () => notes([72, 76, 79], 0.25, 0.25); // rewards, end of a break
export const ping = () => notes([84, 91], 0.12, 0.12); // a new message
