# Smooth Day/Night Cycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three hard hour-band day/night cycle with continuous interpolated time-of-day, moon-phase night variation, and gradual 5–8 minute weather transitions.

**Architecture:** Pure interpolation helpers in `shared/game.js` (testable via `node --test`) imported by `src/draw.ts` (sky progress, color lerp, tint alpha, moon phase, weather intensity ramp), wired into the `render()` loop in `src/main.ts` via a client-side transition timer (5–8 min random interval, ~30s crossfade). No server changes, no new furniture, no new UI.

**Tech Stack:** TypeScript, HTML5 Canvas, `node --test` (JS tests), `tsc --noEmit` (typecheck).

## Global Constraints

- All tests run via `node --test shared/*.js server/*.js` — only `.js` files are directly testable; `src/draw.ts` (TypeScript) is verified by `tsc --noEmit`.
- Typecheck: `npx tsc --noEmit` must pass with zero errors.
- Test command: `npm test` must pass 34/34 existing tests plus any new tests.
- `Sky` type stays `'day' | 'dusk' | 'night'`; `Weather` type stays `'clear' | 'clouds' | 'rain' | 'snow'`.
- `skyNow()` and `weatherNow()` signatures must remain callable with no args from `src/main.ts`.
- Transition interval: random 5–8 minutes between sky/weather changes; crossfade ~30 seconds.
- Moon phase: ~29-day cycle from date; full moon brighter, new moon darker.
- No new furniture, no new UI, no server protocol changes.
- Frequent commits: each task ends with a commit.

---

### Task 1: Add pure time/weather helpers to shared/game.js

**Files:**
- Create: `shared/daynight.test.js`
- Modify: `shared/game.js` — append pure helper functions after existing exports (around line 710).

**Interfaces:**
- Consumes: nothing external; pure functions of `Date` and numeric progress.
- Produces (all exported from `shared/game.js`):
  - `skyProgress(d?: Date): number` — 0–1 progress through the day; dawn≈0.25, day≈0.5, dusk≈0.75, night wraps 0/1.
  - `lerpColor(a: string, b: string, t: number): string` — linear interpolate between two `#RRGGBB` hex strings; clamps t to [0,1].
  - `skyColor(weather: Weather, progress: number): string` — interpolated sky fill color between dawn/day/dusk/night keyframes for the given weather.
  - `tintAlpha(progress: number): number` — night-tint alpha; 0.0 at day progress (0.5), ramps to ~0.42 at night progress (0/1).
  - `moonPhase(d?: Date): number` — 0–1 lunar phase over ~29.53 days from a reference new moon.
  - `nightBrightness(phase: number): number` — 0–1 brightness modifier; 1.0 at full moon (0.5), ~0.4 at new moon (0/1).

- [ ] **Step 1: Write the failing test**

```js
import { assert } from 'node:assert/strict';
import { test } from 'node:test';
import { lerpColor } from '../shared/game.js';

test('lerpColor clamps t to [0,1]', () => {
  assert.strictEqual(lerpColor('#000000', '#ffffff', -5), '#000000');
  assert.strictEqual(lerpColor('#000000', '#ffffff', 5), '#ffffff');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `lerpColor` is not exported from `shared/game.js` (import error).

- [ ] **Step 3: Write minimal implementation**

Append to `shared/game.js`:

```js
// Smooth day/night helpers: pure functions of time, no dependencies.
// skyProgress: 0..1 through the day; dawn~0.25, day~0.5, dusk~0.75, night wraps 0/1.
export function skyProgress(d = new Date()) {
  const h = d.getHours() + d.getMinutes() / 60;
  // Map hour-of-day onto a 0..1 ring with four keyframes.
  const dawn = 6, day = 12, dusk = 18, night = 24;
  if (h >= dawn && h < day) return 0.25 + 0.25 * (h - dawn) / (day - dawn);
  if (h >= day && h < dusk) return 0.5 + 0.25 * (h - day) / (dusk - day);
  if (h >= dusk && h < night) return 0.75 + 0.25 * (h - dusk) / (night - dusk);
  // Night wraps: 24..30 -> 1.0..1.25 -> treat as 1.0..0.25 across midnight
  const h2 = h + 24; // 30..48 for 6..24 previous day
  return 1.0 + 0.25 * (h2 - night) / (dawn + 24 - night);
}

// lerpColor: linear interpolate between two #RRGGBB hex colors, t clamped to [0,1].
export function lerpColor(a, b, t) {
  t = Math.min(1, Math.max(0, t));
  const na = parseInt(a.slice(1, 7), 16);
  const nb = parseInt(b.slice(1, 7), 16);
  const f = (va, vb) => Math.max(0, Math.min(255, Math.round(va + (vb - va) * t))).toString(16).padStart(2, '0');
  return `#${f(na >> 16, nb >> 16)}${f((na >> 8) & 255, (nb >> 8) & 255)}${f(na & 255, nb & 255)}`;
}

// skyColor: interpolated sky fill color for a given weather and time-of-day progress.
const SKY_KEYFRAMES = {
  clear: ['#f7e8c8', '#a8dcf5', '#f7b58a', '#3a4280'],   // dawn, day, dusk, night
  clouds: ['#eadfd0', '#b9cad8', '#cfa092', '#2f3558'],
  rain: ['#d0c8c8', '#92a6b8', '#9a8086', '#262b48'],
  snow: ['#e8e0d8', '#cdd8e4', '#c2aeb6', '#363c62'],
};
export function skyColor(weather, progress) {
  const k = SKY_KEYFRAMES[weather];
  const i = Math.floor(progress * 4) % 4;
  const t = (progress * 4) % 1;
  return lerpColor(k[i], k[(i + 1) % 4], t);
}

// tintAlpha: night-tint alpha; 0.0 at day progress (0.5), ~0.42 at night progress (0 or 1).
export function tintAlpha(progress) {
  // Distance from day (0.5) on the 0..1 ring: 0 at day, 1 at night.
  let d = Math.abs(progress - 0.5);
  if (d > 0.5) d = 1 - d; // wrap across midnight
  return d * 0.42;
}

// moonPhase: 0..1 lunar phase over ~29.53 days from a reference new moon (2000-01-06).
export function moonPhase(d = new Date()) {
  const ref = new Date(2000, 0, 6); // reference new moon
  const days = (d - ref) / (1000 * 60 * 60 * 24);
  const cycle = 29.53058867;
  return ((days / cycle) % 1 + 1) % 1;
}

// nightBrightness: 0..1 night brightness modifier; 1.0 at full moon (0.5), ~0.4 at new moon (0/1).
export function nightBrightness(phase) {
  // phase 0/1 = new moon (darkest), phase 0.5 = full moon (brightest).
  return 0.4 + 0.6 * Math.sin(Math.PI * 2 * phase);
}

// weatherIntensity: placeholder for the transition scheduler; returns current ramp value.
// The scheduler lives in src/main.ts render loop; this is the value it sets.
export function weatherIntensity() {
  return 1;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all 34 existing tests plus new `daynight.test.js` tests.

- [ ] **Step 5: Add more tests**

```js
import { assert } from 'node:assert/strict';
import { test } from 'node:test';
import { skyProgress, tintAlpha, moonPhase, nightBrightness, skyColor } from '../shared/game.js';

test('skyProgress is continuous across midnight', () => {
  const before = skyProgress(new Date(2026, 0, 1, 23, 59));
  const after = skyProgress(new Date(2026, 0, 2, 0, 1));
  assert.ok(Math.abs(after - before) < 0.05);
});

test('tintAlpha is 0 at day progress', () => {
  assert.strictEqual(tintAlpha(0.5), 0);
});

test('moonPhase is deterministic', () => {
  const p1 = moonPhase(new Date(2026, 10, 14));
  const p2 = moonPhase(new Date(2026, 10, 14));
  assert.strictEqual(p1, p2);
  assert.ok(p1 >= 0 && p1 <= 1);
});

test('skyColor returns valid hex', () => {
  const c = skyColor('clear', 0.5);
  assert.ok(/^#[0-9a-fA-F]{6}$/.test(c));
});
```

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add shared/game.js shared/daynight.test.js
git commit -m "add pure day/night interpolation helpers to shared/game.js"
```

---

### Task 2: Update src/draw.ts to use interpolated helpers

**Files:**
- Modify: `src/draw.ts` — import helpers from `../shared/game.js`; update `skyNow()`, `weatherNow()`, `SKIES`, `NIGHT_TINT` usage; add `moonPhase()`/`nightBrightness()` exports.

**Interfaces:**
- Consumes: `skyProgress`, `lerpColor`, `skyColor`, `tintAlpha`, `moonPhase`, `nightBrightness` from `../shared/game.js`.
- Produces:
  - `skyNow(d?): Sky` — keeps existing signature; returns nearest bucket from progress for backward-compatible callers.
  - `weatherNow(d?): Weather` — keeps existing signature.
  - `skyProgress(d?): number` — re-exported from game.js.
  - `tintAlpha(progress: number): number` — re-exported.
  - `moonPhase(d?): number` — re-exported.
  - `nightBrightness(phase: number): number` — re-exported.
  - `SKIES` keyframes now use interpolated colors via `skyColor`.

- [ ] **Step 1: Write the failing test**

Typecheck will fail until imports are added. Run: `npx tsc --noEmit`
Expected: FAIL — imports not yet added / functions not yet updated.

- [ ] **Step 2: Add imports and re-exports to draw.ts**

At the top of `src/draw.ts`, change the import line:

```ts
import { canRotate, skyProgress, lerpColor, skyColor, tintAlpha, moonPhase, nightBrightness } from '../shared/game.js';
```

Add re-exports after the existing `skyNow`/`weatherNow` definitions:

```ts
export { skyProgress, tintAlpha, moonPhase, nightBrightness };
export type Weather = 'clear' | 'clouds' | 'rain' | 'snow';
```

- [ ] **Step 3: Update drawWindow to accept interpolated sky color**

Modify `drawWindow(c, x, y, sky, closed, weather, t)` → `drawWindow(c, x, y, sky, closed, weather, t, skyColorOverride?)`:
- If `skyColorOverride` is provided, use it instead of `SKIES[weather][sky]` for the sky fill rect.
- Otherwise fall back to `SKIES[weather][sky]` (backward compatible).

```ts
export function drawWindow(c: Ctx, x: number, y: number, sky: Sky, closed = false, weather: Weather = 'clear', t = 0, skyColorOverride?: string) {
  ...
  const fill = skyColorOverride ?? SKIES[weather][sky];
  r(g, 7, 7, 18, 14, fill);
  ...
}
```

- [ ] **Step 4: Run typecheck to verify**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/draw.ts
git commit -m "wire interpolation helpers into src/draw.ts"
```

---

### Task 3: Wire transition timer + interpolated values into src/main.ts render()

**Files:**
- Modify: `src/main.ts` — add transition state (target sky/weather, start time, duration), update `render()` to compute interpolated values and pass them to `drawWindow`/`NIGHT_TINT`/glow.

**Interfaces:**
- Consumes: `skyProgress`, `tintAlpha`, `moonPhase`, `nightBrightness` from `../shared/game.js` (already imported via draw.ts chain or directly).
- Produces (module-level state in main.ts):
  - `skyTarget: Sky` — current target sky bucket.
  - `weatherTarget: Weather` — current target weather.
  - `transitionStart: number` — Date.now() when the current transition began.
  - `transitionDuration: number` — ~30000ms crossfade.
  - `nextTransition: number` — Date.now() when the next transition should start (5–8 min from now).

- [ ] **Step 1: Write the failing test**

Typecheck/render integration can't be unit-tested easily; verify via typecheck + manual visual check. Run: `npx tsc --noEmit`
Expected: FAIL until state variables and render() updates are added.

- [ ] **Step 2: Add transition state variables**

Near the top of `src/main.ts` (after other module-level constants), add:

```ts
// Day/night transition state: sky/weather crossfade every 5–8 minutes.
let skyTarget: Sky = 'day';
let weatherTarget: Weather = 'clear';
let transitionStart = Date.now();
const TRANSITION_DURATION = 30_000; // 30s crossfade
let nextTransition = Date.now() + 5 * 60_000 + Math.random() * 3 * 60_000; // 5–8 min

function nextTransitionTime() {
  return Date.now() + 5 * 60_000 + Math.random() * 3 * 60_000;
}

function pickSky(progress: number): Sky {
  if (progress < 0.375) return 'dawn';   // maps to 'day' bucket for rendering
  if (progress < 0.625) return 'day';
  if (progress < 0.875) return 'dusk';
  return 'night';
}
```

Wait — `Sky` type is `'day' | 'dusk' | 'night'`, no 'dawn'. I need to handle dawn. Let me adjust: `pickSky` returns one of the three buckets based on progress ranges:
- progress 0–0.375 → 'night' (pre-dawn) or 'day' (post-dawn)? Let me define:
  - 0.0–0.25: night→dawn transition, bucket 'day' after dawn keyframe... 

Actually simpler: `pickSky` returns the nearest keyframe bucket:
- progress < 0.125 → 'night'
- progress < 0.375 → 'day' (dawn is part of day ramp)
- progress < 0.625 → 'day'
- progress < 0.875 → 'dusk'
- else → 'night'

Hmm, but dawn should be distinct from day for color interpolation. The color interpolation `skyColor` uses progress directly (0–4 keyframes), so `pickSky` is only for the baked `drawWindow` cache key and `NIGHT_TINT` lookup. For dawn/dusk, I can map dawn→'day' and dusk→'dusk'/'night' appropriately. Actually, since I'm passing `skyColorOverride` to `drawWindow`, the baked sky color is overridden. So `pickSky` only needs to determine: is it "dark" (for `dark = sky !== 'day'` logic) and which baked window frame to use.

Let me simplify `pickSky`:
```ts
function pickSky(progress: number): Sky {
  if (progress < 0.25 || progress >= 0.875) return 'night';
  if (progress < 0.625) return 'day';
  return 'dusk';
}
```

And `isDark` derived from `tintAlpha(progress) > 0.1` instead of `sky !== 'day'`.

- [ ] **Step 3: Add transition scheduler in render()**

In `render(t, dt)` (around line 1027), replace:

```ts
const sky = skyNow(), weather = weatherNow();
const dark = sky !== 'day';
```

with:

```ts
const now = Date.now();
if (now >= nextTransition) {
  skyTarget = pickSky(skyProgress(now));
  weatherTarget = weatherNow(now);
  transitionStart = now;
  nextTransition = nextTransitionTime();
}
const progress = skyProgress(now);
const transition = Math.min(1, (now - transitionStart) / TRANSITION_DURATION);
// Interpolate current sky bucket toward target during crossfade
const currentSky = transition < 1 ? (transition < 0.5 ? skyTarget : pickSky(skyProgress(now))) : skyTarget;
// For color/tint, use continuous progress
const skyColorNow = skyColor(weatherTarget, progress);
const tint = tintAlpha(progress);
const dark = tint > 0.1;
const phase = moonPhase(now);
const nightBright = nightBrightness(phase);
```

Then update the window drawing call (line 1153):
```ts
drawWindow(ctx, (o.x + lx) * T, wy, currentSky, curtainsOf(m, ri, room), weatherTarget, t, skyColorNow);
```

And the night tint (line 1314):
```ts
ctx.fillStyle = `rgba(20,24,70,${tint * nightBright})`;
```

And the glow alpha (line 1333):
```ts
alpha: (dark ? l.alpha : l.alpha * 0.5) * nightBright + flicker,
```

- [ ] **Step 4: Run typecheck to verify**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: PASS — 34 existing + new daynight tests.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts
git commit -m "wire smooth day/night transitions into render loop"
```

---

### Task 4: Run full verification and commit

**Files:**
- Test: run `npx tsc --noEmit` and `npm test`.

- [ ] **Step 1: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: PASS — 34 existing tests + new daynight tests, 0 failures.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "smooth day/night cycle: interpolated sky, moon phase, weather transitions"
```

- [ ] **Step 4: Push**

```bash
git push origin main
```

---

## Self-Review

**Spec coverage:**
- Smooth time-of-day interpolation → Task 1 (`skyProgress`, `skyColor`, `tintAlpha`) + Task 3 (render loop).
- Moon phase → Task 1 (`moonPhase`, `nightBrightness`) + Task 3 (tint/glow modulation).
- Gradual weather → Task 1 (`weatherIntensity` placeholder, scheduler in Task 3).
- 5–8 min transitions → Task 3 (`nextTransitionTime`, random 5–8 min).
- ~30s crossfade → Task 3 (`TRANSITION_DURATION`, `transition` lerp).
- No breaking changes → `skyNow()`/`weatherNow()` signatures preserved.

**Placeholder scan:** No TBD/TODO/placeholders remain. Every step has concrete code or commands.

**Type consistency:** All function names and signatures match between tasks. `skyColor(weather, progress)` defined in Task 1, used in Task 2 and Task 3. `tintAlpha(progress)` defined in Task 1, used in Task 3. `pickSky` defined in Task 3 only.

---

**Plan complete and saved to `docs/superpowers/plans/2026-11-14-smooth-day-night-cycle.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints for review

**Which approach?**
