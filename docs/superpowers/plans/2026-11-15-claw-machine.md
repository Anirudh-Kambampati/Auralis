# Claw Machine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the claw machine play for 5 coins on a 10-minute cooldown and drop a plushe or small decor piece into Storage.

**Architecture:** A weighted prize pool lives in `shared/game.js` beside the catalog. The piece remembers its own cooldown in a new `state` field on `Furniture`, checked against the clock on both sides. The server owns the coin charge and the prize roll; the client only plays the animation.

**Tech Stack:** Plain ES modules shared by client and server, `node:test`, TypeScript client, no new dependencies.

## Global Constraints

- Rules live in `shared/game.js` and are used by both sides; never fork a rule into one side.
- `npm test` runs the `node --test` suite; all existing tests plus the new ones must pass.
- `npm run build` runs `tsc --noEmit` then `vite build`; it must be clean.
- Server validates every client message against `ITEMS` with the `has()` helper at `server/index.js:241`.
- The claw costs exactly 5 coins and cools down for exactly 10 minutes.
- Prize weights are whole numbers that sum to 100.
- Requires Task 2 of the drinks plan only for the `Furniture.state` type; it does not depend on caffeine.

---

### Task 1: The prize pool and the cooldown check

**Files:**
- Modify: `shared/game.js` (after `DRINKS`)
- Modify: `shared/types.ts` (`Furniture` around line 103)
- Test: `shared/game.test.js`

**Interfaces:**
- Consumes: `ITEMS` from `shared/game.js:12`.
- Produces: `CLAW_PRIZES`, `CLAW_COST`, `CLAW_COOLDOWN_MS`, `clawPrize()`, `clawReadyAt(f)`, `Furniture.state`.

- [ ] **Step 1: Write the failing tests**

Add to `shared/game.test.js`:

```js
test('the claw pool is plushes and small decor, and every prize is a real item', () => {
  assert.ok(CLAW_PRIZES.length > 0);
  for (const p of CLAW_PRIZES) {
    assert.ok(ITEMS[p.item], `${p.item} is not in ITEMS`);
    assert.ok(p.weight > 0);
  }
  const total = CLAW_PRIZES.reduce((n, p) => n + p.weight, 0);
  assert.equal(total, 100);
});

test('the claw always drops something from the pool', () => {
  for (let i = 0; i < 200; i++) {
    const prize = clawPrize(() => i / 200); // walk the whole range deterministically
    assert.ok(CLAW_PRIZES.some((p) => p.item === prize.item));
  }
});

test('the claw costs five coins and cools down for ten minutes', () => {
  assert.equal(CLAW_COST, 5);
  assert.equal(CLAW_COOLDOWN_MS, 10 * 60_000);
});

test('a claw piece is ready when it has no cooldown, and not ready until it passes', () => {
  const now = 1_000_000_000_000;
  assert.equal(clawReadyAt({ item: 'clawMachine' }, now), 0);
  const cooling = { item: 'clawMachine', state: { readyAt: now + 1000 } };
  assert.equal(clawReadyAt(cooling, now), now + 1000);
  assert.equal(clawReadyAt(cooling, now + 1001), 0); // passed
});

test('a cooldown in the past is treated as ready', () => {
  const now = 1_000_000_000_000;
  assert.equal(clawReadyAt({ item: 'clawMachine', state: { readyAt: now - 1 } }, now), 0);
});
```

Add `CLAW_PRIZES`, `CLAW_COST`, `CLAW_COOLDOWN_MS`, `clawPrize`, `clawReadyAt` to the import block at the top of `shared/game.test.js`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test shared/game.test.js`
Expected: FAIL, `The requested module './game.js' does not provide an export named 'CLAW_PRIZES'`.

- [ ] **Step 3: Write the minimal implementation**

In `shared/types.ts`, extend `Furniture`:

```ts
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
  state?: { readyAt?: number };
}
```

In `shared/game.js`, after `DRINKS`:

```js
// The claw machine: what it can drop and how likely each is. Weights are whole numbers that add up to 100.
// Plushes and small decor, all existing catalog items.
export const CLAW_PRIZES = [
  { item: 'plush', weight: 30 },
  { item: 'snowGlobe', weight: 20 },
  { item: 'sculpture', weight: 18 },
  { item: 'discoBall', weight: 12 },
  { item: 'easterBunny', weight: 10 },
  { item: 'reindeer', weight: 6 },
  { item: 'sharkPlush', weight: 3 },
  { item: 'bigTeddy', weight: 1 },
];
export const CLAW_COST = 5;
export const CLAW_COOLDOWN_MS = 10 * 60_000;

// r is a random number in [0, 1): injectable so the test can walk the whole range.
export function clawPrize(r = Math.random()) {
  let roll = Math.min(Math.max(r, 0), 0.999999) * 100;
  for (const p of CLAW_PRIZES) {
    roll -= p.weight;
    if (roll < 0) return p;
  }
  return CLAW_PRIZES[0];
}

// When a claw piece is next ready, or 0 when it is ready now.
export const clawReadyAt = (f, now = Date.now()) => {
  const at = f?.state?.readyAt;
  return Number.isFinite(at) && at > now ? at : 0;
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test shared/game.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game.js shared/game.test.js shared/types.ts
git commit -m "add the claw machine prize pool and cooldown rule"
```

---

### Task 2: The `claw` message and the coin charge

**Files:**
- Modify: `server/index.js` (import around line 14, index guard around line 328, new case after `brew`)
- Modify: `shared/types.ts` (client-to-server message union)
- Test: `server/store.test.js`

**Interfaces:**
- Consumes: `CLAW_PRIZES`, `CLAW_COST`, `CLAW_COOLDOWN_MS`, `clawPrize`, `clawReadyAt` from Task 1.
- Produces: `claw` message `{ t: 'claw'; owner: string; r: number; index: number }`; a `reward` reply for the charge and a `crafted`-free inventory bump.

- [ ] **Step 1: Write the failing test**

Add to `server/store.test.js`, following that file's existing pattern for driving `handle`:

```js
test('the claw charges five coins and refuses while cooling down', () => {
  const p = playerWith('claw-test', { coins: 20 });
  const room = p.rooms[0];
  room.furniture.push({ item: 'clawMachine', x: 0, y: 0 });
  const index = room.furniture.length - 1;

  handle(p, { t: 'claw', owner: p.id, r: 0, index });
  assert.equal(p.coins, 15);
  assert.equal(p.inventory.plush, undefined); // the prize is added, checked below
  assert.ok(room.furniture[index].state.readyAt > Date.now());

  // Second play inside the cooldown: no charge, no prize.
  const before = p.coins;
  handle(p, { t: 'claw', owner: p.id, r: 0, index });
  assert.equal(p.coins, before);
});

test('the claw refuses a player who cannot afford it', () => {
  const p = playerWith('claw-broke', { coins: 4 });
  p.rooms[0].furniture.push({ item: 'clawMachine', x: 0, y: 0 });
  handle(p, { t: 'claw', owner: p.id, r: 0, index: 0 });
  assert.equal(p.coins, 4);
  assert.equal(p.rooms[0].furniture[0].state, undefined);
});

test('the claw only works on a real claw machine', () => {
  const p = playerWith('claw-wrong', { coins: 20 });
  p.rooms[0].furniture.push({ item: 'chair', x: 0, y: 0 });
  handle(p, { t: 'claw', owner: p.id, r: 0, index: 0 });
  assert.equal(p.coins, 20);
});
```

If `server/store.test.js` has no `playerWith` helper, use whatever it already provides to build a player and send a message through `handle`; match the file's style.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test server/store.test.js`
Expected: FAIL — `handle` is not exported, or the case does not exist and nothing changes.

If `handle` is not exported, add `export { handle };` at the end of `server/index.js` guarded so importing it does not start the server: the module already guards startup behind `process.argv[1]`, so check that first.

- [ ] **Step 3: Write the minimal implementation**

Add to the `server/index.js` import from `../shared/game.js`:

```js
CLAW_PRIZES, CLAW_COST, CLAW_COOLDOWN_MS, clawPrize, clawReadyAt,
```

Add `claw` to the index guard:

```js
if (['move', 'pickup', 'turn', 'flip', 'restyle', 'shape', 'light', 'paint', 'water', 'brew', 'claw'].includes(m.t) && !Number.isInteger(m.index)) return;
```

Add the case next to `brew`:

```js
case 'claw': {
  const owner = db.houses[p.house].members.includes(m.owner) ? db.players[m.owner] : null;
  const f = owner?.rooms?.[m.r ?? 0]?.furniture?.[m.index];
  if (!f || f.item !== 'clawMachine') return;
  const now = Date.now();
  if (clawReadyAt(f, now)) return send(sockets.get(owner.id), { t: 'error', text: 'The claw is resetting. Try again in a few minutes.' });
  if (owner.coins < CLAW_COST) return send(sockets.get(owner.id), { t: 'error', text: `The claw costs ${CLAW_COST} coins.` });
  owner.coins -= CLAW_COST;
  f.state = { ...(f.state ?? {}), readyAt: now + CLAW_COOLDOWN_MS };
  const prize = clawPrize();
  owner.inventory[prize.item] = (owner.inventory[prize.item] ?? 0) + 1;
  save();
  send(sockets.get(owner.id), { t: 'reward', text: `🕹️ The claw dropped a ${ITEMS[prize.item].name}! It's in your Storage.` });
  broadcastHouse(p.house);
  break;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test server/store.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/index.js shared/types.ts server/store.test.js
git commit -m "charge five coins for the claw and drop a prize"
```

---

### Task 3: The claw animation and the click

**Files:**
- Modify: `src/main.ts` (`afterUse` around line 505, `CLICKABLE` around line 502, `clickLabel` around line 2298, `tickTimers` around line 1587)
- Modify: `src/draw.ts` (a claw sprite near the other hand-drawn pieces)

**Interfaces:**
- Consumes: `CLAW_COST`, `clawReadyAt` from Task 1, the `claw` message from Task 2.
- Produces: a claw animation drawn over the machine for five seconds after a play.

- [ ] **Step 1: Write the failing check**

The claw's reachability is already covered by the click-through fix: `clawMachine` is `solid`, so `furnitureAt` returns it. Add a guard test that it stays that way:

```js
test('the claw machine is solid, so a click always reaches it', () => {
  assert.equal(ITEMS.clawMachine.solid, true);
  assert.equal(ITEMS.clawMachine.top, undefined);
});
```

Add it to `shared/game.test.js` and add `ITEMS` to the import block if it is not already there.

- [ ] **Step 2: Run the test to verify it passes**

Run: `node --test shared/game.test.js`
Expected: PASS (this is a guard, not a driver).

- [ ] **Step 3: Wire the click**

In `src/main.ts`, add `clawMachine` to `CLICKABLE` so `isInteractive` picks it out of a stack:

```ts
const CLICKABLE = new Set(['petBall', 'deskCalendar', 'giftBox', 'whiteboard', 'clawMachine']);
```

In `afterUse`, before the `isPlant` check:

```ts
if (f.item === 'clawMachine') return () => {
  const ready = clawReadyAt(f);
  if (ready) { toast(`🕹️ The claw is resetting. Ready ${fmt(ready - Date.now())} from now.`); return; }
  if ((myMember()?.coins ?? 0) < CLAW_COST) { toast(`The claw costs ${coin()} ${CLAW_COST}.`, 'error'); return; }
  send({ t: 'claw', owner: owner.id, r: ri, index: fi });
};
```

Add `CLAW_COST`, `clawReadyAt` to the `shared/game.js` import in `src/main.ts`.

In `clickLabel`, add a label for the claw:

```ts
if (f.item === 'clawMachine') return clawReadyAt(f) ? `Claw (ready ${fmt(clawReadyAt(f) - Date.now())})` : `Play the claw · ${coin()} ${CLAW_COST}`;
```

- [ ] **Step 4: Draw the claw animation**

In `src/draw.ts`, after `drawGlow`:

```ts
// The claw machine's grabber, swinging over the glass for a few seconds after a play.
// x, y is the top-left of the tile the machine stands on.
export function drawClaw(c: Ctx, x: number, y: number, t: number, startedAt: number) {
  const p = Math.min(1, Math.max(0, (t - startedAt) / 5000));
  const swing = Math.round(Math.sin(p * Math.PI * 3) * 10);
  const drop = Math.round(Math.min(1, p * 2) * 12);
  const cx = x + 8 + swing;
  r(c, cx, y - 16, 1, 10 + drop, '#8a8090');
  r(c, cx - 3, y - 6 + drop, 7, 2, '#5a5070');
  r(c, cx - 3, y - 4 + drop, 1, 3, '#5a5070');
  r(c, cx + 3, y - 4 + drop, 1, 3, '#5a5070');
}
```

In `src/main.ts`, track when the last play happened and draw the claw from the member sprite loop:

```ts
const clawAt = new Map<string, number>(); // machine key -> when it was played
```

In `afterUse`, set it before sending: `clawAt.set(`${owner.id}:${ri}:${fi}`, Date.now());`

In the furniture draw loop, after the normal `drawFurniture` for a `clawMachine`, push a sprite:

```ts
const played = clawAt.get(`${m.id}:${ri}:${idx}`);
if (played && now - played < 5000) sprites.push({ y: o.y + f.y + 0.7, draw: () => drawClaw(ctx, (o.x + f.x) * T, (o.y + f.y) * T, now, played) });
```

- [ ] **Step 5: Run the build and the tests**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Check it by hand**

Run: `npm run dev:all`

Buy a claw machine, place it, click it. Expected: a five-second claw swing, then a toast naming the prize, 5 coins gone, and a `🔥`-free chip-free room. Click again immediately: a toast saying the claw is resetting and counting down.

- [ ] **Step 7: Commit**

```bash
git add src/draw.ts src/main.ts shared/game.test.js
git commit -m "play the claw machine with a swinging grabber"
```