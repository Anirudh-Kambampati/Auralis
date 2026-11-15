# Crafting and Gifting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the pottery wheel, easel, loom, craft table and sewing table make an existing decor piece in a random colour, which the player keeps in Storage or gifts to a housemate.

**Architecture:** Each craft piece owns a pool of catalog items. Crafting is one message: the server picks the item and colour, appends to the player's `crafted` list, and the client plays the making animation while it waits. A crafted piece is a real instance, not a count, because `inventory` is `Record<string, number>` and cannot hold a colour.

**Tech Stack:** Plain ES modules shared by client and server, `node:test`, TypeScript client, no new dependencies.

## Global Constraints

- Rules live in `shared/game.js` and are used by both sides; never fork a rule into one side.
- `npm test` runs the `node --test` suite; all existing tests plus the new ones must pass.
- `npm run build` runs `tsc --noEmit` then `vite build`; it must be clean.
- Server validates every client message against `ITEMS` with the `has()` helper at `server/index.js:241`.
- Crafting is free and cools down for 5 minutes per piece.
- A colour is a six-digit hex string, matching the `paint` message's `/^#[0-9a-fA-F]{6}$/` check at `server/index.js:774`.
- `crafted` is private to its owner: it rides in `me`, never in `publicPlayer`.

---

### Task 1: Craft pools and the colour pick

**Files:**
- Modify: `shared/game.js` (after the claw pool)
- Test: `shared/game.test.js`

**Interfaces:**
- Consumes: `ITEMS`, `colorsFor`, `PASTELS` from `shared/game.js`.
- Produces: `CRAFT`, `CRAFT_COOLDOWN_MS`, `craftColour(item, r)`, `craftedProblem(entry)`.

- [ ] **Step 1: Write the failing tests**

Add to `shared/game.test.js`:

```js
test('every craft piece names a pool of real catalog items', () => {
  for (const [piece, pool] of Object.entries(CRAFT)) {
    assert.ok(ITEMS[piece], `${piece} is not in ITEMS`);
    assert.ok(Array.isArray(pool) && pool.length > 0, `${piece} has no pool`);
    for (const item of pool) assert.ok(ITEMS[item], `${piece} yields ${item}, which is not in ITEMS`);
  }
});

test('the five paint pieces are the craft pieces', () => {
  for (const key of ['potteryWheel', 'easel', 'loom', 'craftTable', 'sewingTable']) {
    assert.ok(CRAFT[key], `${key} is missing`);
  }
});

test('crafting is free and cools down for five minutes', () => {
  assert.equal(CRAFT_COOLDOWN_MS, 5 * 60_000);
});

test('craft colour comes from the item palette when it has one, and pastels otherwise', () => {
  // Vase has a pastel palette; a rug has none, so it falls back to PASTELS.
  const vase = craftColour('vase', 0);
  assert.ok(colorsFor('vase').includes(vase));
  const rug = craftColour('rug', 0);
  assert.ok(PASTELS.includes(rug));
});

test('craft colour stays inside the palette across the whole range', () => {
  for (const item of ['vase', 'sculpture', 'rug', 'plush']) {
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const col = craftColour(item, r);
      assert.match(col, /^#[0-9a-f]{6}$/);
    }
  }
});

test('a crafted entry is only valid with a known item and a hex colour', () => {
  assert.equal(craftedProblem({ item: 'vase', col: '#aabbcc' }), null);
  assert.ok(craftedProblem({ item: 'notAnItem', col: '#aabbcc' }));
  assert.ok(craftedProblem({ item: 'vase', col: 'red' }));
  assert.ok(craftedProblem(null));
});
```

Add `CRAFT`, `CRAFT_COOLDOWN_MS`, `craftColour`, `craftedProblem` to the import block at the top of `shared/game.test.js`, and `PASTELS` if it is not already imported.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test shared/game.test.js`
Expected: FAIL, `The requested module './game.js' does not provide an export named 'CRAFT'`.

- [ ] **Step 3: Write the minimal implementation**

In `shared/game.js`, after the claw pool:

```js
// What each making piece can produce. All five already carry use: 'paint'.
export const CRAFT = {
  potteryWheel: ['vase', 'sculpture', 'bust', 'mushrooms'],
  easel: ['photoFrames', 'vase', 'sculpture', 'bust'],
  loom: ['rug', 'roundRug', 'ovalRug', 'runnerRug'],
  craftTable: ['candles', 'photoFrames', 'snowGlobe'],
  sewingTable: ['plush', 'bigTeddy', 'sharkPlush'],
};
export const CRAFT_COOLDOWN_MS = 5 * 60_000;

// A crafted piece comes out in one of its own colours when it has a palette, and a pastel otherwise.
export function craftColour(item, r = Math.random()) {
  const palette = colorsFor(item);
  const list = palette.length ? palette : PASTELS;
  return list[Math.min(list.length - 1, Math.floor(Math.min(Math.max(r, 0), 0.999999) * list.length))];
}

// What is wrong with a crafted entry, in the same spirit as usernameProblem, or null when it is fine.
const hasOwn = (table, key) => typeof key === 'string' && Object.hasOwn(table, key);
export function craftedProblem(entry) {
  if (!entry || typeof entry !== 'object') return 'That piece is missing.';
  if (!hasOwn(ITEMS, entry.item)) return 'That piece is not in the catalog.';
  if (typeof entry.col !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(entry.col)) return 'That colour is not a hex colour.';
  return null;
}
```

`craftedProblem` needs `hasOwn` defined before use; the `const` above is hoisted in TDZ, so put the `hasOwn` line above `craftedProblem`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test shared/game.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game.js shared/game.test.js
git commit -m "add craft pools and the crafted colour pick"
```

---

### Task 2: The `crafted` list on the player

**Files:**
- Modify: `shared/types.ts` (`Me`-side player fields, around line 40)
- Modify: `server/index.js` (`me` payload at line 308, load-time cleanup near line 1447)
- Test: `server/store.test.js`

**Interfaces:**
- Consumes: `craftedProblem` from Task 1.
- Produces: `crafted?: { item: string; col: string }[]` on the player, sent in `me`.

- [ ] **Step 1: Write the failing test**

Add to `server/store.test.js`:

```js
test('a crafted list survives a round trip', async () => {
  const p = newPlayer('craft-test');
  p.crafted = [{ item: 'vase', col: '#aabbcc' }];
  await savePlayer(p);
  const back = await loadPlayer('craft-test');
  assert.deepEqual(back.crafted, [{ item: 'vase', col: '#aabbcc' }]);
});

test('a malformed crafted list is dropped on load, not trusted', async () => {
  const p = newPlayer('craft-bad');
  p.crafted = [{ item: 'vase', col: '#aabbcc' }, { item: 'notAnItem', col: '#aabbcc' }, { item: 'bust', col: 'red' }];
  await savePlayer(p);
  const back = await loadPlayer('craft-bad');
  assert.deepEqual(back.crafted, [{ item: 'vase', col: '#aabbcc' }]);
});
```

Match the helper names to whatever `server/store.test.js` already uses.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test server/store.test.js`
Expected: FAIL — `crafted` comes back `undefined` or unfiltered.

- [ ] **Step 3: Write the minimal implementation**

In `shared/types.ts`, add to the player type (the one carrying `inventory`):

```ts
crafted?: { item: string; col: string }[];
```

In `server/index.js`, add `crafted: p.crafted ?? []` to the `me` object in `broadcastHouse`:

```js
me: { id: p.id, home: p.home, ...houseLists(p), coins: p.coins, discount: !!p.discount, notes: p.notes ?? [], inbox: p.inbox ?? [], inboxSeen: p.inboxSeen ?? 0, events: p.events ?? [], inventory: p.inventory, crafted: p.crafted ?? [], petAccs: p.petAccs ?? [], /* rest unchanged */ }
```

In the load-time cleanup near `server/index.js:1447`, drop malformed entries the same way unknown inventory keys are dropped:

```js
for (const p of Object.values(db.players)) {
  if (!Array.isArray(p.crafted)) { delete p.crafted; continue; }
  const kept = p.crafted.filter((e) => !craftedProblem(e));
  if (kept.length) p.crafted = kept; else delete p.crafted;
}
```

Add `craftedProblem` to the `shared/game.js` import in `server/index.js`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test server/store.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/types.ts server/index.js server/store.test.js
git commit -m "carry a crafted list on the player"
```

---

### Task 3: The `craft` message

**Files:**
- Modify: `server/index.js` (import, index guard, new case next to `claw`)
- Modify: `shared/types.ts` (message union)
- Test: `server/store.test.js`

**Interfaces:**
- Consumes: `CRAFT`, `CRAFT_COOLDOWN_MS`, `craftColour`, `clawReadyAt` from Tasks 1 and 2; `inbox` at `server/index.js:283`.
- Produces: `craft` message `{ t: 'craft'; owner: string; r: number; index: number; keep: boolean; to?: string }`, `gift_crafted` message `{ t: 'gift_crafted'; index: number; to: string }`, and a `crafted` reply.

- [ ] **Step 1: Write the failing tests**

Add to `server/store.test.js`:

```js
test('crafting is free, cools down, and keeps a piece the player asked to keep', () => {
  const p = playerWith('craft-keep', { coins: 10 });
  p.rooms[0].furniture.push({ item: 'potteryWheel', x: 0, y: 0 });
  const index = 0;

  handle(p, { t: 'craft', owner: p.id, r: 0, index, keep: true });
  assert.equal(p.coins, 10); // free
  assert.equal(p.crafted.length, 1);
  assert.ok(['vase', 'sculpture', 'bust', 'mushrooms'].includes(p.crafted[0].item));
  assert.match(p.crafted[0].col, /^#[0-9a-f]{6}$/);
  assert.ok(p.rooms[0].furniture[index].state.readyAt > Date.now());

  // Second craft inside the cooldown: nothing happens.
  handle(p, { t: 'craft', owner: p.id, r: 0, index, keep: true });
  assert.equal(p.crafted.length, 1);
});

test('a craft on something that is not a craft piece does nothing', () => {
  const p = playerWith('craft-wrong', { coins: 10 });
  p.rooms[0].furniture.push({ item: 'chair', x: 0, y: 0 });
  handle(p, { t: 'craft', owner: p.id, r: 0, index: 0, keep: true });
  assert.equal(p.crafted, undefined);
});

test('a gift goes to the housemate and files an inbox line for them', () => {
  const a = playerWith('craft-a', { coins: 10 });
  const b = playerWith('craft-b', { coins: 10 });
  const house = a.house;
  if (!db.houses[house].members.includes(b.id)) db.houses[house].members.push(b.id);
  a.rooms[0].furniture.push({ item: 'easel', x: 0, y: 0 });

  handle(a, { t: 'craft', owner: a.id, r: 0, index: 0, keep: false, to: b.id });
  assert.equal(a.crafted, undefined); // the maker keeps nothing
  assert.equal(b.crafted.length, 1);
  assert.equal(b.inbox.at(-1).kind, 'gift');
});

test('a gift to nobody falls back to keeping the piece', () => {
  const p = playerWith('craft-nobody', { coins: 10 });
  p.rooms[0].furniture.push({ item: 'loom', x: 0, y: 0 });
  handle(p, { t: 'craft', owner: p.id, r: 0, index: 0, keep: false, to: 'ghost' });
  assert.equal(p.crafted.length, 1);
});

test('a stored crafted piece can be gifted by index', () => {
  const a = playerWith('craft-idx-a', { coins: 10 });
  const b = playerWith('craft-idx-b', { coins: 10 });
  if (!db.houses[a.house].members.includes(b.id)) db.houses[a.house].members.push(b.id);
  a.crafted = [{ item: 'bust', col: '#112233' }];

  handle(a, { t: 'gift_crafted', index: 0, to: b.id });
  assert.equal(a.crafted.length, 0);
  assert.deepEqual(b.crafted, [{ item: 'bust', col: '#112233' }]);
});

test('a gift of a piece the player does not have does nothing', () => {
  const a = playerWith('craft-idx-none', { coins: 10 });
  a.crafted = [];
  handle(a, { t: 'gift_crafted', index: 0, to: a.id });
  assert.equal(a.crafted.length, 0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test server/store.test.js`
Expected: FAIL — the `craft` case does not exist.

- [ ] **Step 3: Write the minimal implementation**

In `shared/types.ts`, add to the client-to-server message union:

```ts
craft: { t: 'craft'; owner: string; r: number; index: number; keep: boolean; to?: string };
```

In `server/index.js`, add to the import from `../shared/game.js`:

```js
CRAFT, CRAFT_COOLDOWN_MS, craftColour, clawReadyAt,
```

Add `craft` and `claw` to the index guard:

```js
if (['move', 'pickup', 'turn', 'flip', 'restyle', 'shape', 'light', 'paint', 'water', 'brew', 'claw', 'craft'].includes(m.t) && !Number.isInteger(m.index)) return;
```

`gift_crafted` is deliberately not in that list: it is addressed by an index into `crafted`, which its handler validates itself with `Number.isInteger(m.index)`.

Add the case next to `claw`:

```js
case 'craft': {
  const owner = db.houses[p.house].members.includes(m.owner) ? db.players[m.owner] : null;
  const f = owner?.rooms?.[m.r ?? 0]?.furniture?.[m.index];
  if (!f || !CRAFT[f.item]) return;
  const now = Date.now();
  if (clawReadyAt(f, now)) return send(sockets.get(owner.id), { t: 'error', text: 'That is still being set up. Try again in a few minutes.' });
  const pool = CRAFT[f.item];
  const item = pool[Math.floor(Math.random() * pool.length)];
  const piece = { item, col: craftColour(item) };
  f.state = { ...(f.state ?? {}), readyAt: now + CRAFT_COOLDOWN_MS };

  const to = m.keep ? null : (db.houses[p.house].members.includes(m.to) ? db.players[m.to] : null);
  if (to && to.id !== owner.id) {
    to.crafted = [...(to.crafted ?? []), piece];
    inbox(to, 'gift', owner, `made you a ${ITEMS[item].name.toLowerCase()}`);
    send(sockets.get(to.id), { t: 'crafted', piece, from: owner.name });
  } else {
    owner.crafted = [...(owner.crafted ?? []), piece];
  }
  save();
  send(sockets.get(owner.id), { t: 'crafted', piece, to: to?.id });
  broadcastHouse(p.house);
  break;
}
```

Add `gift_crafted` to the message union:

```ts
gift_crafted: { t: 'gift_crafted'; index: number; to: string };
```

`clawReadyAt` is the generic "is this piece's `state.readyAt` still running" check and works for any `state.readyAt`.

Also add the gift handler, next to `craft`. It moves a stored piece by index rather than making a new one:

```js
case 'gift_crafted': {
  const list = p.crafted ?? [];
  const piece = Number.isInteger(m.index) ? list[m.index] : null;
  const to = db.houses[p.house].members.includes(m.to) ? db.players[m.to] : null;
  if (!piece || !to || to.id === p.id) return;
  p.crafted = [...list.slice(0, m.index), ...list.slice(m.index + 1)];
  to.crafted = [...(to.crafted ?? []), piece];
  inbox(to, 'gift', p, `made you a ${ITEMS[piece.item].name.toLowerCase()}`);
  send(sockets.get(to.id), { t: 'crafted', piece, from: p.name });
  save();
  send(sockets.get(p.id), { t: 'crafted', piece, to: to.id });
  break;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test server/store.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/index.js shared/types.ts server/store.test.js
git commit -m "craft a piece and keep it or send it to a housemate"
```

---

### Task 4: Placing a crafted piece

**Files:**
- Modify: `server/index.js` (`place` case around line 559)
- Test: `server/store.test.js`

**Interfaces:**
- Consumes: `crafted` from Task 2.
- Produces: a `place` message that accepts `crafted: true` to consume a matching entry and set `col` on the placed furniture.

- [ ] **Step 1: Write the failing test**

Add to `server/store.test.js`:

```js
test('placing a crafted piece consumes the entry and colours what is placed', () => {
  const p = playerWith('craft-place', { coins: 10 });
  p.crafted = [{ item: 'vase', col: '#aabbcc' }, { item: 'vase', col: '#ddeeff' }];

  handle(p, { t: 'place', r: 0, item: 'vase', x: 0, y: 0, crafted: true });
  const placed = p.rooms[0].furniture.find((f) => f.item === 'vase');
  assert.ok(placed, 'the vase was not placed');
  assert.equal(placed.col, '#aabbcc'); // the oldest match goes first
  assert.deepEqual(p.crafted, [{ item: 'vase', col: '#ddeeff' }]);
});

test('a normal place from counted inventory is unchanged', () => {
  const p = playerWith('craft-place2', { coins: 10 });
  p.inventory.vase = 1;
  handle(p, { t: 'place', r: 0, item: 'vase', x: 0, y: 0 });
  assert.equal(p.inventory.vase, 0);
  const placed = p.rooms[0].furniture.find((f) => f.item === 'vase');
  assert.equal(placed.col, undefined);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test server/store.test.js`
Expected: FAIL — `crafted: true` is ignored and `p.crafted` still holds both entries.

- [ ] **Step 3: Write the minimal implementation**

In the `place` case in `server/index.js`, before the inventory check, add a crafted branch:

```js
case 'place': {
  if (!has(ITEMS, m.item)) return;
  if (m.crafted) {
    const list = p.crafted ?? [];
    const at = list.findIndex((e) => e.item === m.item);
    if (at < 0) return;
    const piece = list[at];
    if (!canPlace(room, m.item, m.x, m.y)) return;
    p.crafted = [...list.slice(0, at), ...list.slice(at + 1)];
    room.furniture.push({ item: m.item, x: m.x, y: m.y, col: piece.col });
    save();
    break;
  }
  if (!(p.inventory[m.item] > 0)) return;
  const out = placeSwaps(room, m.item, m.x, m.y);
  if (!out) return;
  p.inventory[m.item]--;
  for (const f of room.furniture.filter((_, i) => out.includes(i))) p.inventory[f.item] = (p.inventory[f.item] ?? 0) + 1;
  room.furniture = room.furniture.filter((_, i) => !out.includes(i));
  room.furniture.push({ item: m.item, x: m.x, y: m.y, ...(isPlant(m.item) ? { wateredAt: Date.now() } : {}) });
  break;
}
```

The crafted branch keeps its existing `placeSwaps` behaviour out, because a crafted piece is a specific instance and should not be swapped away silently.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test server/store.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/index.js server/store.test.js
git commit -m "place a crafted piece from storage, keeping its colour"
```

---

### Task 5: The client — crafting, the keep-or-gift prompt, and Storage

**Files:**
- Modify: `src/main.ts` (`afterUse` around line 505, `CLICKABLE` around line 502, `decorateBody` around line 1857, `onMessage` around line 315, `Me`/`Member` types around line 35)
- Modify: `src/style.css` (the crafted grid, next to the existing `.grid` rule)
- Modify: `src/draw.ts` (a making animation)

**Interfaces:**
- Consumes: `CRAFT`, `CRAFT_COOLDOWN_MS`, `craftedProblem` from Task 1, the `craft` and `crafted` messages from Task 3, `place` with `crafted: true` from Task 4.
- Produces: a craft panel with keep-or-gift, a `crafted` handler, and a Storage grid that shows crafted pieces.

- [ ] **Step 1: Add the client types**

In `src/main.ts`, extend the local `Me` type:

```ts
crafted?: { item: string; col: string }[];
```

- [ ] **Step 2: Handle the `crafted` reply**

In `onMessage`, next to the `reward` branch:

```ts
} else if (m.t === 'crafted') {
  if (m.from) toast(`🎁 <b>${esc(m.from)}</b> made you a ${esc(ITEMS[m.piece.item as ItemKey]?.name ?? 'piece')}!`, 'reward');
  else if (m.to) toast(`🎁 Sent to your housemate.`);
  else toast(`✨ Made a ${esc(ITEMS[m.piece.item as ItemKey]?.name ?? 'piece')}. It's in Storage.`, 'reward');
  if (openPanel === 'decorate') renderPanel();
}
```

- [ ] **Step 3: Wire the craft click**

In `src/main.ts`, add the five craft pieces to `CLICKABLE` so a craft piece wins a stack over the table it stands on (the sewing table and craft table are `solid`, so this matters only if something is placed on them):

```ts
const CLICKABLE = new Set(['petBall', 'deskCalendar', 'giftBox', 'whiteboard', 'clawMachine',
  'potteryWheel', 'easel', 'loom', 'craftTable', 'sewingTable']);
```

In `afterUse`, before the `isPlant` check:

```ts
if (CRAFT[f.item as keyof typeof CRAFT]) return () => {
  const ready = clawReadyAt(f);
  if (ready) { toast(`⏳ Ready ${fmt(ready - Date.now())} from now.`); return; }
  setPanel('decorate');
  toast(`Pick what to make at the ${(ITEMS[f.item as ItemKey].name).toLowerCase()}.`);
};
```

The panel itself lives in `decorateBody`, where the piece is already selected.

- [ ] **Step 4: Build the keep-or-gift panel**

In `decorateBody`, after the `selBar` block, add a craft section when the selected piece is a craft piece and its cooldown has passed:

```ts
const craftPool = sel ? CRAFT[sel.item as keyof typeof CRAFT] : undefined;
const craftReady = sel ? !clawReadyAt(sel) : false;
const craftBar = craftPool ? `
  <h3>Make something</h3>
  <p class="hint">${craftReady ? 'Free. Ready when you are.' : `Ready ${fmt(clawReadyAt(sel!) - Date.now())} from now.`}</p>
  <div class="row">${craftPool.map((item: string) => `<button class="off" data-act="craft" data-v="${item}" ${craftReady ? '' : 'disabled'}>${icon(item)}${ITEMS[item as ItemKey].name}</button>`).join('')}</div>
  <p class="hint">You choose whether to keep it or send it to a housemate after it is made.</p>` : '';
```

Include `craftBar` in the returned HTML, next to `selBar`.

Handle the action where the other decorate actions are handled:

```ts
case 'craft': {
  const f = myRoom()?.furniture[moving ?? -1];
  if (!f || !CRAFT[f.item as keyof typeof CRAFT]) return;
  send({ t: 'craft', owner: myId, r: editRoom, index: moving!, keep: true });
  return;
}
```

The server picks the item and colour; the client only asks for a craft. The pool buttons are a preview of what the piece can make, not a choice of result, which is what makes the reveal a surprise.

`clawReadyAt` is used for the cooldown check because it is the generic "is this piece's `state.readyAt` still running" helper from the claw plan. If the claw plan has not landed yet, inline the same three lines instead:

```ts
const readyAt = sel?.state?.readyAt ?? 0;
const ready = readyAt > Date.now() ? readyAt : 0;
```

- [ ] **Step 5: Show crafted pieces in Storage**

In `decorateBody`, the Storage grid currently lists counted inventory. Add crafted pieces as cards that show their colour:

```ts
const crafted = (me.crafted ?? []).map((e, i) => ({ ...e, i }));
const craftedCards = crafted.map((e) => `<div class="card crafted">
  <span class="swatch on" style="background:${e.col}" aria-hidden="true"></span>
  <b>${ITEMS[e.item as ItemKey]?.name ?? e.item}</b>
  <button data-act="placeCrafted" data-v="${e.i}">Place</button>
  <button class="off small" data-act="giftCrafted" data-v="${e.i}">Gift</button>
</div>`).join('');
```

Include `craftedCards` in the Storage section's HTML.

Handle both actions:

```ts
case 'placeCrafted': {
  const i = Number(act.dataset.v);
  const piece = me.crafted?.[i];
  if (!piece) return;
  placing = piece.item;
  placingCrafted = i;
  renderPanel();
  return;
}
case 'giftCrafted': {
  const i = Number(act.dataset.v);
  const piece = me.crafted?.[i];
  if (!piece) return;
  setPanel('house');
  toast(`Pick a housemate to send the ${esc(ITEMS[piece.item as ItemKey]?.name ?? 'piece')} to.`);
  gifting = i;
  renderPanel();
  return;
}
```

Add `let placingCrafted = -1; let gifting = -1;` next to `placing`.

When a placed crafted piece is confirmed, pass `crafted: true`:

```ts
if (placeSwaps(myRoom()!, placing, lx, ly) || placingCrafted >= 0) {
  send({ t: 'place', r: editRoom, item: placing, x: lx, y: ly, ...(placingCrafted >= 0 ? { crafted: true } : {}) });
  placing = null; placingCrafted = -1;
}
```

Gifting a **stored** piece is a message of its own, added in Task 3 (`gift_crafted`). When a housemate is picked in the House panel and `gifting >= 0`, send that:

```ts
if (gifting >= 0) {
  send({ t: 'gift_crafted', index: gifting, to: m.id });
  gifting = -1;
  return;
}
```

- [ ] **Step 6: Style the crafted cards**

In `src/style.css`, next to the `.grid .card` rule:

```css
.grid .card.crafted { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
.grid .card.crafted .swatch { width: 14px; height: 14px; border-radius: 3px; border: 2px solid var(--ink); }
```

- [ ] **Step 7: Run the tests and the build**

Run: `npm test`
Expected: PASS, all tests.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 8: Check it by hand**

Run: `npm run dev:all`

Place a pottery wheel, click it, pick a piece. Expected: it appears in Storage with a coloured swatch. Place it: the vase stands in the room in that colour. Craft again and choose Gift: the House panel opens, pick a housemate, and they get an inbox line.

- [ ] **Step 9: Commit**

```bash
git add src/main.ts src/style.css src/draw.ts
git commit -m "craft a piece, then keep it or send it to a housemate"
```