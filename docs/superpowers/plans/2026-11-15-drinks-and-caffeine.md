# Drinks and Caffeine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make coffee, the coffee machine, the energy can and wine grant a shared 10-minute caffeine effect that pays a focus bonus and sets the character on fire, with wine adding a two-minute tipsy sway.

**Architecture:** One table (`DRINKS`) in `shared/game.js` maps a drink item to its effect. Caffeine is a window on the member (`caffeineSince` / `caffeineUntil`), not a flag, so the reward can be computed from its overlap with a focus session at `focus_done`. The client reads the same window to draw the flame, the HUD chip and the walk speed.

**Tech Stack:** Plain ES modules shared by browser and Node, `node:test` for tests, TypeScript for the client, no new dependencies.

## Global Constraints

- Rules live in `shared/game.js` and are used by both client and server; never fork a rule into one side.
- `npm test` runs `node --test shared/game.test.js shared/daynight.test.js shared/watch.test.js shared/stats.test.js server/store.test.js`. All 40 existing tests must keep passing.
- `npm run build` runs `tsc --noEmit` then `vite build`; it must be clean.
- Server validates every client message against `ITEMS` with the `has()` helper at `server/index.js:241`. `ITEMS['__proto__']` is truthy, so an unchecked lookup is a real bug.
- Caffeinated minutes pay exactly one extra coin each, as whole minutes of overlap.
- Drinks cost nothing and consume nothing.
- Caffeine is visible to housemates: it rides on the member in the house state.

---

### Task 1: Caffeine overlap rule

**Files:**
- Modify: `shared/game.js` (after `quitMinutes`, around line 667)
- Test: `shared/game.test.js`

**Interfaces:**
- Consumes: `focusEnd(f, now)` from `shared/game.js:653`.
- Produces: `focusStart(f, now)`, `caffeineOverlap(from, to, caffeineSince, caffeineUntil)`, `caffeineMinutes(f, caffeineSince, caffeineUntil, now)`.

- [ ] **Step 1: Write the failing tests**

Add to `shared/game.test.js`:

```js
test('caffeine overlap counts whole minutes of a session that fall inside the window', () => {
  const now = 1_000_000_000_000;
  const f = { minutes: 60, endsAt: now, pausedAt: null };
  const since = now - 55 * 60_000, until = now - 40 * 60_000;
  assert.equal(caffeineMinutes(f, since, until, now), 15);
});

test('caffeine overlap is zero when the window is outside the session', () => {
  const now = 1_000_000_000_000;
  const f = { minutes: 25, endsAt: now, pausedAt: null };
  assert.equal(caffeineMinutes(f, now + 60_000, now + 120_000, now), 0);
  assert.equal(caffeineMinutes(f, now - 3 * 3600_000, now - 2 * 3600_000, now), 0);
});

test('caffeine overlap never exceeds the session or the window', () => {
  const now = 1_000_000_000_000;
  const f = { minutes: 15, endsAt: now, pausedAt: null };
  assert.equal(caffeineMinutes(f, now - 3600_000, now + 3600_000, now), 15);
});

test('a missing or inverted caffeine window overlaps for nothing', () => {
  const now = 1_000_000_000_000;
  const f = { minutes: 25, endsAt: now, pausedAt: null };
  assert.equal(caffeineMinutes(f, 0, 0, now), 0);
  assert.equal(caffeineMinutes(f, now, now - 1000, now), 0);
});

test('focusStart is the end minus the session length, with paused time frozen', () => {
  const now = 1_000_000_000_000;
  const f = { minutes: 25, endsAt: now, pausedAt: null };
  assert.equal(focusStart(f, now), now - 25 * 60_000);
  const paused = { minutes: 25, endsAt: now, pausedAt: now - 100_000 };
  assert.equal(focusStart(paused, now), paused.endsAt + 100_000 - 25 * 60_000);
});
```

Add `focusStart`, `caffeineOverlap`, `caffeineMinutes` to the import block at the top of `shared/game.test.js`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test shared/game.test.js`
Expected: FAIL, `SyntaxError: The requested module './game.js' does not provide an export named 'caffeineMinutes'`.

- [ ] **Step 3: Write the minimal implementation**

Add to `shared/game.js` immediately after `quitMinutes`:

```js
// The start of a focus session, worked back from its end (paused time has moved the end out).
export const focusStart = (f, now = Date.now()) => focusEnd(f, now) - f.minutes * 60_000;

// Whole minutes shared by [from, to) and the caffeine window. Zero when either is missing or inverted.
export function caffeineOverlap(from, to, caffeineSince, caffeineUntil) {
  if (!Number.isFinite(caffeineSince) || !Number.isFinite(caffeineUntil) || caffeineUntil <= caffeineSince) return 0;
  return Math.max(0, Math.floor((Math.min(to, caffeineUntil) - Math.max(from, caffeineSince)) / 60_000));
}

// Caffeinated minutes of a whole session: what focus_done pays the bonus on.
export const caffeineMinutes = (f, caffeineSince, caffeineUntil, now = Date.now()) =>
  caffeineOverlap(focusStart(f, now), focusEnd(f, now), caffeineSince, caffeineUntil);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test shared/game.test.js`
Expected: PASS, all previous tests plus the five new ones.

- [ ] **Step 5: Commit**

```bash
git add shared/game.js shared/game.test.js
git commit -m "add caffeine overlap rule to shared game logic"
```

---

### Task 2: The `DRINKS` table

**Files:**
- Modify: `shared/game.js` (next to `USES`, around line 403)
- Test: `shared/game.test.js`

**Interfaces:**
- Consumes: `ITEMS` from the same file.
- Produces: `DRINKS`, used by Tasks 3 and 5.

- [ ] **Step 1: Write the failing tests**

Add to `shared/game.test.js`:

```js
test('the drinks table names a caffeine length for the three caffeinated drinks', () => {
  assert.equal(DRINKS.coffeeMachine.caffeine, 10);
  assert.equal(DRINKS.coffee.caffeine, 10);
  assert.equal(DRINKS.energyCan.caffeine, 10);
  assert.equal(DRINKS.wine.rest, 2);
  assert.ok(DRINKS.wine.tipsy);
});

test('every drink in the table is a real catalog item', () => {
  for (const key of Object.keys(DRINKS)) assert.ok(ITEMS[key], `${key} is not in ITEMS`);
});

test('a drink that is not in the table has no effect', () => {
  assert.equal(DRINKS.notADrink, undefined);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test shared/game.test.js`
Expected: FAIL, `DRINKS is not defined`.

- [ ] **Step 3: Write the minimal implementation**

Add to `shared/game.js` after `USES`:

```js
// What clicking a drink does. caffeine: minutes of the shared effect. rest: minutes of break. tipsy: cosmetic sway.
// Drinks cost nothing and are never consumed; the window they open is the only limit.
export const DRINKS = {
  coffeeMachine: { caffeine: 10 },
  coffee: { caffeine: 10 },
  energyCan: { caffeine: 10 },
  wine: { rest: 2, tipsy: true },
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test shared/game.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game.js shared/game.test.js
git commit -m "add the drinks table"
```

---

### Task 3: The caffeine window on the member, and `brew`

**Files:**
- Modify: `shared/types.ts` (`Member` around line 64, message union around line 271)
- Modify: `server/index.js` (import around line 14, index guard around line 328, new case after `water` around line 736, `publicPlayer` around line 256)
- Test: `server/store.test.js`

**Interfaces:**
- Consumes: `DRINKS` from Task 2.
- Produces: `brew` message `{ t: 'brew'; owner: string; r: number; index: number }`; `caffeineSince`, `caffeineUntil`, `tipsyUntil` on `Member` and in `publicPlayer`.

- [ ] **Step 1: Write the failing test**

Add to `server/store.test.js`, matching the file's existing helpers:

```js
test('the caffeine window is part of a player and survives a round trip', async () => {
  const p = newPlayer('caf-test');
  p.caffeineSince = 1000;
  p.caffeineUntil = 601_000;
  await savePlayer(p);
  const back = await loadPlayer('caf-test');
  assert.equal(back.caffeineSince, 1000);
  assert.equal(back.caffeineUntil, 601_000);
});
```

Read the top of `server/store.test.js` first and use the helpers it actually has.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test server/store.test.js`
Expected: FAIL — either the helper does not exist or `caffeineSince` comes back `undefined`.

- [ ] **Step 3: Write the minimal implementation**

In `shared/types.ts`, add to `Member`:

```ts
caffeineSince?: number;
caffeineUntil?: number;
tipsyUntil?: number;
```

Add to the client-to-server message union:

```ts
brew: { t: 'brew'; owner: string; r: number; index: number };
```

In `server/index.js`, add `DRINKS` to the import from `../shared/game.js`.

Add `brew` to the index guard:

```js
if (['move', 'pickup', 'turn', 'flip', 'restyle', 'shape', 'light', 'paint', 'water', 'brew'].includes(m.t) && !Number.isInteger(m.index)) return;
```

Add the case next to `water`:

```js
case 'brew': { // coffee machine, coffee cup or energy can: 10 minutes of caffeine, free
  const owner = db.houses[p.house].members.includes(m.owner) ? db.players[m.owner] : null;
  const f = owner?.rooms?.[m.r ?? 0]?.furniture?.[m.index];
  if (!f || !DRINKS[f.item]?.caffeine) return;
  const now = Date.now();
  // Already caffeinated: top the timer back up rather than opening a second window.
  if (!(owner.caffeineUntil > now)) owner.caffeineSince = now;
  owner.caffeineUntil = Math.max(owner.caffeineUntil ?? 0, now + DRINKS[f.item].caffeine * 60_000);
  // Wine rests rather than caffeinating; the client starts the break.
  if (DRINKS[f.item].tipsy) owner.tipsyUntil = now + (DRINKS[f.item].rest ?? 2) * 60_000;
  save();
  broadcastHouse(p.house); // the flame is visible to housemates
  break;
}
```

In `publicPlayer`, add the three fields:

```js
caffeineSince: p.caffeineSince, caffeineUntil: p.caffeineUntil, tipsyUntil: p.tipsyUntil,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test server/store.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/types.ts server/index.js server/store.test.js
git commit -m "carry a caffeine window on the player and accept brew"
```

---

### Task 4: The focus bonus

**Files:**
- Modify: `server/index.js` (`focus_cancel` around line 496, `focus_done` around line 515)
- Test: `shared/game.test.js` for the arithmetic, `server/store.test.js` for the wiring

**Interfaces:**
- Consumes: `caffeineMinutes`, `caffeineOverlap`, `focusStart` from Task 1; the window from Task 3.
- Produces: a reward that includes one extra coin per caffeinated minute, on both `focus_done` and `focus_cancel`.

- [ ] **Step 1: Write the failing tests**

Add to `shared/game.test.js` (the arithmetic, which is the part that can be wrong):

```js
test('a session caffeinated for ten of its minutes pays ten extra coins', () => {
  const now = 1_000_000_000_000;
  const f = { minutes: 60, endsAt: now, pausedAt: null };
  const since = now - 55 * 60_000, until = now - 45 * 60_000;
  assert.equal(caffeineMinutes(f, since, until, now), 10);
});

test('leaving early pays the overlap for the time actually worked', () => {
  const now = 1_000_000_000_000;
  const f = { minutes: 60, endsAt: now, pausedAt: null };
  const workedFrom = focusStart(f, now);
  // Caffeinated from minute 5 to minute 12, but the player left at minute 10.
  const leftAt = workedFrom + 10 * 60_000;
  assert.equal(caffeineOverlap(workedFrom, leftAt, workedFrom + 5 * 60_000, workedFrom + 12 * 60_000), 5);
});
```

Add to `server/store.test.js`:

```js
test('finishing a caffeinated session pays the bonus', () => {
  const p = playerWith('caf-reward', { coins: 0 });
  const now = Date.now();
  p.focus = { minutes: 25, endsAt: now, tag: 'Study' };
  p.caffeineSince = now - 20 * 60_000;
  p.caffeineUntil = now - 5 * 60_000;
  p.sessions = [];
  handle(p, { t: 'focus_done' });
  const gain = p.coins - 25; // 25 minutes at one coin, before any bonus
  assert.equal(gain, 15);
});
```

The exact expected number depends on whether the test player has a streak; if `playerWith` sets `sessions` so that a streak bonus applies, subtract it or clear `sessions` first so the streak is zero.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test shared/game.test.js`
Expected: PASS (the arithmetic already exists from Task 1).

Run: `node --test server/store.test.js`
Expected: FAIL — the reward does not include the bonus yet.

- [ ] **Step 3: Write the minimal implementation**

In `server/index.js` `focus_done`, extend the reward line:

```js
const reward = focusReward(p.focus.minutes, buddies) + Math.ceil(p.focus.minutes * streakBonus(streak))
  + caffeineMinutes(p.focus, p.caffeineSince, p.caffeineUntil, now);
```

In `focus_cancel`, pay the overlap for the time actually worked:

```js
const reward = quitReward(p.focus.minutes, buddiesOf(p, now), elapsed)
  + caffeineOverlap(focusStart(p.focus, now), now, p.caffeineSince, p.caffeineUntil);
```

Add `caffeineMinutes`, `caffeineOverlap`, `focusStart` to the `server/index.js` import from `../shared/game.js`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test shared/game.test.js server/store.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game.test.js server/index.js server/store.test.js
git commit -m "pay a focus bonus for caffeinated minutes"
```

---

### Task 5: Drinking in the client, and the HUD chip

**Files:**
- Modify: `src/main.ts` (`afterUse` around line 505, `tickTimers` around line 1587, the local `Member` type around line 23)
- Modify: `index.html` (next to `#breakChip` at line 122)
- Modify: `src/style.css` (next to the `.chip.break` rule)

**Interfaces:**
- Consumes: `DRINKS` from Task 2, `caffeineUntil` / `tipsyUntil` on `Member` from Task 3.
- Produces: `caffeinated(m)` in the client, and a `#cafChip` element with a `#cafTime` span.

- [ ] **Step 1: Add the chip markup**

In `index.html`, after the `#breakChip` line:

```html
<div class="chip caf" id="cafChip" hidden>🔥 <span id="cafTime"></span></div>
```

In `src/style.css`, next to the `.chip.break` rule, copy its shape:

```css
.chip.caf { background: #ffe6d6; border-color: #e0a184; color: #8a4a2a; }
```

- [ ] **Step 2: Add the helper and the interaction**

In `src/main.ts`, add `DRINKS` to the import from `../shared/game.js`.

Extend the local `Member` type:

```ts
caffeineUntil?: number;
tipsyUntil?: number;
```

Add a helper next to `myMember`:

```ts
const caffeinated = (m: Member | undefined, now = Date.now()) => !!m && (m.caffeineUntil ?? 0) > now;
const tipsy = (m: Member | undefined, now = Date.now()) => !!m && (m.tipsyUntil ?? 0) > now;
```

In `afterUse`, before the `isPlant` check:

```ts
const drink = DRINKS[f.item as keyof typeof DRINKS];
if (drink) return () => {
  if (drink.tipsy) startBreak((drink.rest ?? 2) * 60_000, '🍷 A short rest. Take two minutes.');
  send({ t: 'brew', owner: owner.id, r: ri, index: fi });
  if (drink.caffeine) toast(`☕ Caffeinated for ${drink.caffeine} minutes.`);
};
```

Drinks are reached from the tile below, like any other `use` piece, so `interact` needs no change: `afterUse` is already the "arrived at the front" hook.

- [ ] **Step 3: Show the chip**

In `tickTimers`, next to the break chip:

```ts
const caf = caffeinated(myMember());
$('#cafChip').hidden = !caf;
if (caf) $('#cafTime').textContent = `Caffeinated ${fmt((myMember()!.caffeineUntil ?? 0) - Date.now())}`;
```

- [ ] **Step 4: Verify it builds and the tests pass**

Run: `npm run build`
Expected: PASS.

Run: `npm test`
Expected: PASS, all tests.

- [ ] **Step 5: Check it by hand**

Run: `npm run dev:all`

Buy a coffee machine from the Shop, place it on a counter, click it. Expected: the character walks over, a chip appears reading `🔥 Caffeinated 10:00` and counting down. Put a wine glass on a table, click it: a two-minute break starts with a chime.

- [ ] **Step 6: Commit**

```bash
git add index.html src/style.css src/main.ts
git commit -m "drink coffee, tea and wine from the room, with a caffeine chip"
```

---

### Task 6: The flame and the tipsy sway

**Files:**
- Modify: `src/draw.ts` (export a flame pass near `drawGlow` at line 1144)
- Modify: `src/main.ts` (the member sprite loop around line 1371, `step` speed at line 1057)

**Interfaces:**
- Consumes: `caffeinated()` and `tipsy()` from Task 5.
- Produces: `drawFlames(c, x, y, t)` in `src/draw.ts`.

- [ ] **Step 1: Write the flame pass**

In `src/draw.ts`, after `drawGlow`:

```ts
// A character who drank coffee is on fire for ten minutes: a few flame licks rising off the sprite.
// x, y is the top-left of the tile the character stands on.
export function drawFlames(c: Ctx, x: number, y: number, t: number) {
  for (let j = 0; j < 4; j++) {
    const p = (t / 520 + j / 4) % 1;
    const fx = Math.round(x + 3 + j * 3 + Math.sin(p * 7 + j * 2) * 1.6);
    const fy = Math.round(y + T - 2 - p * 15);
    c.globalAlpha = 1 - p * 0.85;
    const col = j % 2 ? '#ffd34d' : '#f28a3a';
    r(c, fx, fy, 2, 3, col);
    r(c, fx, fy - 2, 1, 2, '#fff3b0');
  }
  c.globalAlpha = 1;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Draw it, and speed the character up**

In `src/main.ts`, add `drawFlames` to the import from `./draw`.

In the member sprite loop, apply the tipsy sway to `ax`/`ay`:

```ts
const sway = tipsy(m) ? Math.round(Math.sin(now / 190) * 1.5) : 0;
const ay = Math.round(a.y * T) - hop - (tipsy(m) ? Math.abs(Math.sin(now / 190)) : 0);
const ax = Math.round(a.x * T) + sway;
```

After the sprite is pushed, add a second sprite so the flame sorts in front of the character:

```ts
if (caffeinated(m)) sprites.push({ y: a.y + 1.02, draw: () => drawFlames(ctx, ax, ay - 4, t) });
```

In `step`, raise the walk speed while caffeinated:

```ts
const speed = caffeinated(myMember()) ? 4.2 : 3.2; // tiles per second
```

- [ ] **Step 4: Run the tests and the build**

Run: `npm test`
Expected: PASS, all tests.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Check it by hand**

Run: `npm run dev:all`

Click the coffee machine. Expected: the character is wreathed in flame and walks visibly faster for ten minutes. Open a second browser, join the same house, and confirm the flame is visible on the first player too.

- [ ] **Step 6: Commit**

```bash
git add src/draw.ts src/main.ts
git commit -m "set the character on fire while caffeinated, and sway when tipsy"
```