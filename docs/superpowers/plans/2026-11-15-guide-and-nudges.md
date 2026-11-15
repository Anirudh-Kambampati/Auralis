# A Guide To What Auralis Can Do — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every player a browsable Guide to what Auralis can do, nudge them once when they acquire something whose consequence the hover tooltip cannot express, and move house announcements into the bell where they are actually read.

**Architecture:** One new content module (`shared/guide.js`) holds the prose; `ITEMS` stays the only source of truth for behaviour. The server stores a per-player `tipsSeen` list and returns it in `me`. The client derives nudges from inventory minus `tipsSeen`, renders the Guide as an accordion panel behind a new `?` button, and folds the old first-run tour into the Guide's first card. Announcements move from the House panel into the bell and ride on the existing `inboxSeen` for their unread count.

**Tech Stack:** Plain ES modules for `shared/` and `server/`, TypeScript for the client, `node --test` for unit tests, Playwright for UI e2e, Vite for the client build.

## Global Constraints

- Plain ES modules in `shared/`; no build step for shared or server code.
- TypeScript for `src/` only. The client imports shared code from `../shared/`.
- A colour is a six-digit hex string, matching `/^#[0-9a-fA-F]{6}$/`.
- `crafted` is private to its owner and never appears in `publicPlayer`. `tipsSeen` is private in the same way.
- Every client message must be validated on the server. The client is a fast preview, not a source of truth.
- Do not fork a rule into one side. If a rule needs to exist on both, it lives in `shared/`.
- `npm test` runs the unit tests and must pass before every commit.
- Commit after every task, with a lowercase message describing what changed.

---

## File Structure

| File | Responsibility |
|---|---|
| `shared/guide.js` | **New.** The Guide's words: sections, item rows, nudge text, the five old tour steps. No logic. |
| `shared/guide.test.js` | **New.** Guards the content against `ITEMS`: ids unique, items real, tips described. |
| `shared/types.ts` | `tipsSeen` on `MeState`; `tip_seen` in the client message union. |
| `server/index.js` | Stores `tipsSeen`, returns it in `me`, handles `tip_seen`. |
| `scripts/e2e-tips.js` | **New.** Throwaway-server round trip for `tip_seen`. |
| `src/draw.ts` | The `guide` UI icon, one entry in `UI_ICONS`. |
| `index.html` | The `?` button beside the coin chip. |
| `src/main.ts` | Guide panel, nudge check, first-visit open, announcements in the bell. |
| `src/style.css` | Guide cards. Announcements reuse the existing `.announcements` styles. |
| `package.json` | `test` script gains `shared/guide.test.js`. |

---

### Task 1: The Guide content module

**Files:**
- Create: `shared/guide.js`
- Create: `shared/guide.test.js`
- Modify: `package.json` (the `test` script)

**Interfaces:**
- Consumes: `ITEMS` from `./game.js`.
- Produces:
  - `GUIDE_SECTIONS: { id: string; title: string; blurb: string; items?: { item: string; text: string }[]; steps?: string[] }[]`
  - `GUIDE_TIPS: Record<string, string>`
  - `GUIDE_START: string[]`

- [ ] **Step 1: Write the failing test**

Create `shared/guide.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS } from './game.js';
import { GUIDE_SECTIONS, GUIDE_TIPS, GUIDE_START } from './guide.js';

test('every section id is unique', () => {
  const ids = GUIDE_SECTIONS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every item named in a section is a real catalog item', () => {
  for (const s of GUIDE_SECTIONS) {
    for (const row of s.items ?? []) {
      assert.ok(ITEMS[row.item], `${s.id} names ${row.item}, which is not in ITEMS`);
    }
  }
});

test('every tip names a real catalog item', () => {
  for (const id of Object.keys(GUIDE_TIPS)) {
    assert.ok(ITEMS[id], `${id} is tipped but is not in ITEMS`);
  }
});

test('every tipped item is described somewhere in the guide', () => {
  const listed = new Set(GUIDE_SECTIONS.flatMap((s) => (s.items ?? []).map((r) => r.item)));
  for (const id of Object.keys(GUIDE_TIPS)) {
    assert.ok(listed.has(id), `${id} is tipped but never described`);
  }
});

test('start carries the five old tour steps', () => {
  assert.equal(GUIDE_START.length, 5);
  const start = GUIDE_SECTIONS.find((s) => s.id === 'start');
  assert.ok(start, 'there is a start section');
  assert.deepEqual(start.steps, GUIDE_START);
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `node --test shared/guide.test.js`

Expected: FAIL, `Cannot find module '.../shared/guide.js'`.

- [ ] **Step 3: Add the test file to the npm test script**

In `package.json`, change the `test` script to:

```json
"test": "node --test shared/game.test.js shared/guide.test.js shared/daynight.test.js shared/watch.test.js shared/stats.test.js server/store.test.js"
```

- [ ] **Step 4: Write `shared/guide.js`**

Create `shared/guide.js`:

```js
// The Guide: the words for what the catalog cannot say.
//
// `ITEMS` says what a thing is, and the hover tooltip says what a click does. Neither can say the
// consequence: that a coffee buys ten minutes of extra pay, that the claw waits half an hour between
// plays. That is what this file holds.
//
// An item gets a row only when the tooltip does not already explain it. `Water`, `Nap`, `Play music`
// and `Send a gift` are all on the tooltip, so plants, chairs, speakers and gift boxes are not listed.

// The five steps the first-run tour used to show, now the Guide's opening card.
export const GUIDE_START = [
  '👋 Welcome to Auralis! This is your room. Your little buddy wanders around and uses things on their own.',
  '🖱️ Click furniture to use it: sit, nap, work out, water plants, play music… Hover (or tap) to see what a click does.',
  '⏰ Open <b>Focus</b> in the dock to study. Your buddy sits at the desk and you earn a coin a minute.',
  '🛍️ Spend coins in the <b>Shop</b>, then arrange your room in <b>Decorate</b>.',
  "🏠 Share your house code (top right) so friends' rooms join yours. Study at the same time for up to ×2 coins!",
];

// Ordered. A section is prose, item rows, or both. `steps` is a numbered list, used by `start` only.
export const GUIDE_SECTIONS = [
  { id: 'start', title: 'Start here', blurb: 'Five things worth knowing before you potter about.', steps: GUIDE_START },
  {
    id: 'focus',
    title: 'Focus',
    blurb: 'Finish a session and you are paid a coin a minute. Study at the same time as a housemate and you both earn a quarter more each, up to double. Three days in a row adds 10%, seven adds 25%, thirty adds 50%.',
  },
  {
    id: 'coins',
    title: 'Coins and the Shop',
    blurb: 'Coins come from finished focus sessions, from house to-dos the whole house finished, and now and then from a pet. Spend them in the Shop on furniture, pets, pet style and more room.',
  },
  {
    id: 'decorate',
    title: 'Decorate and rooms',
    blurb: 'Pick a room, then drag furniture to move it and tap it for rotate, flip, colour and put away. Wallpaper, pattern, floor and floor style are yours to change, and any colour you like is one swatch away. Up to three rooms each; a bigger room costs coins.',
  },
  {
    id: 'drinks',
    title: 'Drinks and caffeine',
    blurb: 'Click a drink to use it. Drinks are free and never run out — the window they open is the only limit.',
    items: [
      { item: 'coffeeMachine', text: 'Click to brew. Free and never used up; it opens a ten-minute window in which every focus minute pays one extra coin.' },
      { item: 'coffee', text: 'A cup from the machine. The same ten-minute window.' },
      { item: 'energyCan', text: 'The same ten-minute window as coffee.' },
      { item: 'wine', text: 'Two minutes of rest, and a sway. Nothing is used up.' },
    ],
  },
  {
    id: 'claw',
    title: 'The claw machine',
    blurb: 'Five coins a play, then half an hour while it resets. It drops one of 25 catalog prizes: mostly small trinkets, rarely a giant teddy.',
    items: [
      { item: 'clawMachine', text: 'Click to play. Five coins, one prize, then a thirty-minute wait.' },
    ],
  },
  {
    id: 'craft',
    title: 'Crafting',
    blurb: 'Each making piece is free and cools down for twenty minutes. It makes one thing from its own pool, chosen at random — you do not pick which. Keep the piece or send it to a housemate.',
    items: [
      { item: 'potteryWheel', text: 'Free, twenty-minute cooldown, and one random piece: vase, sculpture, bust or mushroom pot.' },
      { item: 'easel', text: 'Free, twenty-minute cooldown, and one random piece: photo frames, vase, sculpture or bust.' },
      { item: 'loom', text: 'Free, twenty-minute cooldown, and one random rug: round, oval or runner.' },
      { item: 'craftTable', text: 'Free, twenty-minute cooldown, and one random piece: candles, photo frames or a snow globe.' },
      { item: 'sewingTable', text: 'Free, twenty-minute cooldown, and one random plush: plush bear, giant teddy or big shark.' },
    ],
  },
  {
    id: 'pets',
    title: 'Pets',
    blurb: 'Pets wander, climb and nap on their own. Study with one out to grow its bond; bonded pets do tricks and sometimes find coins. Up to four, and you can dress them from the You panel.',
  },
  {
    id: 'lights',
    title: 'Lights',
    blurb: 'Click a lamp to switch it on or off. The switch belongs to the house: anyone in it can reach any room\'s lamps.',
  },
  {
    id: 'gifts',
    title: 'Gifting and selling',
    blurb: 'Send a housemate ten coins, up to five times a day. Stored pieces and handmade pieces can be given away too. Selling something back returns half its price, or a quarter for a handmade piece.',
  },
  {
    id: 'house',
    title: 'House and friends',
    blurb: 'Your house code never changes. Share it and friends\' rooms open into yours as one big house. The owner can post announcements and remove people; removed people can be let back in.',
  },
  {
    id: 'todos',
    title: 'To-dos, calendar and exams',
    blurb: 'To-dos can be the whole house\'s or just yours, with a date, a time, a repeat and a priority. Finish one and the house earns coins. A desk calendar shows your next exam to housemates.',
  },
  {
    id: 'stats',
    title: 'Stats',
    blurb: 'Ranked by focused minutes from finished sessions: your house, your friends, or everyone. Plus charts of your own sessions by subject.',
  },
  {
    id: 'chat',
    title: 'Chat',
    blurb: 'House chat, private messages and groups. Friends from other houses can be messaged and visited.',
  },
  {
    id: 'notify',
    title: 'Notifications',
    blurb: 'The bell collects what happened while you were away, with house announcements at the top. In its settings you can allow browser pop-ups, and push messages for when Auralis is closed.',
  },
];

// Shown once, when the item first turns up in the inventory. One sentence each, no more.
export const GUIDE_TIPS = {
  coffeeMachine: 'The coffee machine is yours: click it for a ten-minute window in which every focus minute pays an extra coin.',
  coffee: 'Coffee: click it for a ten-minute window in which every focus minute pays an extra coin.',
  energyCan: 'Energy drink: the same ten-minute window as coffee.',
  wine: 'Wine: two minutes of rest, and a sway. Nothing is used up.',
  clawMachine: 'The claw machine is yours: five coins a play, then half an hour while it resets.',
  potteryWheel: 'The pottery wheel is yours: click it to make one random piece, free, every twenty minutes.',
  easel: 'The easel is yours: click it to make one random piece, free, every twenty minutes.',
  loom: 'The weaving loom is yours: click it to make one random rug, free, every twenty minutes.',
  craftTable: 'The craft table is yours: click it to make one random piece, free, every twenty minutes.',
  sewingTable: 'The sewing table is yours: click it to make one random plush, free, every twenty minutes.',
};
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `node --test shared/guide.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS, all tests including the 5 new ones.

- [ ] **Step 7: Commit**

```bash
git add shared/guide.js shared/guide.test.js package.json
git commit -m "add the guide content: sections, item rows and one-time nudges"
```

---

### Task 2: Remembering which nudges were shown

**Files:**
- Modify: `shared/types.ts` (`MeState`, the client message union)
- Modify: `server/index.js` (import, `me` payload, message case)
- Create: `scripts/e2e-tips.js`

**Interfaces:**
- Consumes: `GUIDE_TIPS` from `../shared/guide.js`; `has()` at `server/index.js:244`.
- Produces:
  - `MeState.tipsSeen?: string[]`
  - client message `tip_seen: { t: 'tip_seen'; id: string }`
  - server field `p.tipsSeen: string[]`

- [ ] **Step 1: Add the types**

In `shared/types.ts`, add to `MeState` (beside `inboxSeen`):

```ts
  tipsSeen?: string[];
```

In the client message union, beside `inbox_read`:

```ts
  // Guide
  tip_seen: { t: 'tip_seen'; id: string };
```

- [ ] **Step 2: Import the tips on the server**

In `server/index.js`, add to the import list from `'../shared/game.js'`'s neighbour — a new import line after the `game.js` import block (which ends at line 18):

```js
import { GUIDE_TIPS } from '../shared/guide.js';
```

- [ ] **Step 3: Write the failing e2e test**

Create `scripts/e2e-tips.js`:

```js
// End-to-end check of the Guide's one-time nudges: a valid id sticks, a repeat does not duplicate it,
// a bogus id changes nothing, and the list is private.
//
// Usage: start a throwaway server (DB_FILE=/tmp/t.db PORT=8793 node server/index.js), then:
//   API=http://localhost:8793 node scripts/e2e-tips.js
import crypto from 'node:crypto';
import WebSocket from 'ws';

const base = process.env.API ?? 'http://localhost:8787';
const ok = (label, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`); if (!cond) process.exitCode = 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function player(name) {
  const username = `t_${name}_${crypto.randomBytes(3).toString('hex')}`, password = crypto.randomBytes(12).toString('base64url');
  const res = await fetch(`${base}/api/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password, email: `${username}@example.test` }) });
  const { token } = await res.json();
  const p = { name, token, state: null };
  p.connect = async () => {
    p.state = null;
    p.ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws');
    await new Promise((r, j) => { p.ws.on('open', r); p.ws.on('error', j); });
    p.ws.on('message', (raw) => { const m = JSON.parse(raw); if (m.t === 'state') p.state = m; });
    p.ws.send(JSON.stringify({ t: 'hello', token }));
    while (!p.state) await sleep(50);
  };
  p.send = (m) => p.ws.send(JSON.stringify(m));
  p.tips = () => p.state.me.tipsSeen ?? [];
  await p.connect();
  p.id = p.state.me.id;
  return p;
}

const [A, B] = await Promise.all(['ana', 'ben'].map(player));
B.send({ t: 'join', code: A.state.house.code });
await sleep(800);
ok('both in one house', B.state.house.code === A.state.house.code);

// Nothing is seen yet.
ok('a fresh account has seen no tips', A.tips().length === 0, JSON.stringify(A.tips()));

// A buys a coffee machine (25 of its 30 starting coins).
A.send({ t: 'buy', item: 'coffeeMachine' });
await sleep(400);
ok('the coffee machine is in the inventory', (A.state.me.inventory.coffeeMachine ?? 0) === 1);

// Marking a real tip sticks.
A.send({ t: 'tip_seen', id: 'coffeeMachine' });
await sleep(400);
ok('a real tip is remembered', A.tips().includes('coffeeMachine'), JSON.stringify(A.tips()));

// A repeat does not duplicate it.
A.send({ t: 'tip_seen', id: 'coffeeMachine' });
await sleep(400);
ok('sending it twice does not duplicate', A.tips().filter((x) => x === 'coffeeMachine').length === 1);

// A bogus id changes nothing.
A.send({ t: 'tip_seen', id: 'notAnItem' });
A.send({ t: 'tip_seen', id: '__proto__' });
await sleep(400);
ok('a bogus tip changes nothing', A.tips().length === 1, JSON.stringify(A.tips()));

// It survives a reconnect.
await A.connect();
ok('the list survives a reconnect', A.tips().includes('coffeeMachine'));

// It is private: B, in the same house, cannot see it.
ok('a housemate never sees the list', !('tipsSeen' in (B.state.house.members.find((m) => m.id === A.id) ?? {})));

for (const q of [A, B]) q.ws.close();
```

- [ ] **Step 4: Run the e2e test and watch it fail**

Start a throwaway server in one shell:

```bash
DB_FILE=/tmp/auralis-tips.db PORT=8793 node server/index.js
```

In another:

```bash
API=http://localhost:8793 node scripts/e2e-tips.js
```

Expected: FAIL — `a fresh account has seen no tips` fails because `me.tipsSeen` is undefined, and `a real tip is remembered` fails because `tip_seen` is not handled.

- [ ] **Step 5: Store the list and handle the message**

In `server/index.js`, add `tipsSeen` to the `me` payload in `broadcastHouse` (the object literal beginning `me: { id: p.id, home: p.home,` at line 311). Add it next to `inboxSeen`:

```js
inbox: p.inbox ?? [], inboxSeen: p.inboxSeen ?? 0, tipsSeen: p.tipsSeen ?? [],
```

Add the handler beside `inbox_read` (line 749):

```js
    case 'tip_seen': // the Guide showed a nudge: remember it so it never shows again
      if (!has(GUIDE_TIPS, m.id)) return;
      p.tipsSeen = [...new Set([...(p.tipsSeen ?? []), m.id])];
      save();
      return;
```

- [ ] **Step 6: Run the e2e test and watch it pass**

```bash
API=http://localhost:8793 node scripts/e2e-tips.js
```

Expected: PASS, all eight checks.

- [ ] **Step 7: Run the unit suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add shared/types.ts server/index.js scripts/e2e-tips.js
git commit -m "remember which guide nudges a player has seen"
```

---

### Task 3: The `?` button and the Guide panel

**Files:**
- Modify: `src/draw.ts` (`UI_ICONS`)
- Modify: `index.html` (the header)
- Modify: `src/main.ts` (imports, `THEMES`, `guideOpen`, `guideBody`, `panelBody`, `setPanel`, `#help` listener, `welcome`)

**Interfaces:**
- Consumes: `GUIDE_SECTIONS`, `GUIDE_START` from `../shared/guide.js`; `icon()` at `src/main.ts:1721`; `esc()`.
- Produces:
  - a `guide` entry in `UI_ICONS`
  - `#help` in the header
  - `THEMES.guide`
  - `guideOpen: string | null`
  - `guideBody(): string`

- [ ] **Step 1: Add the `guide` icon**

In `src/draw.ts`, add to `UI_ICONS` (the object opening at line 3350), after the `house` entry:

```ts
  guide: { // a lavender book with cream pages
    rows: [
      '............',
      '..oooooooo..',
      '.oppppppppo.',
      '.opwwwwwwpo.',
      '.opwwwwwwpo.',
      '.opwwwwwwpo.',
      '.opwwwwwwpo.',
      '.opwwwwwwpo.',
      '.oppppppppo.',
      '..oooooooo..',
      '............',
      '............',
    ],
    pal: { o: OUT, p: '#b89af0', w: '#fff4e6' },
  },
```

- [ ] **Step 2: Add the button to the header**

In `index.html`, immediately after the coin chip on line 115:

```html
      <button class="chip help" id="help" aria-label="Guide" title="Guide"><img data-icon="guide" alt="" /></button>
```

The `data-icon` images are hydrated by the loop at `src/main.ts:1625`, so no extra wiring is needed for the picture.

- [ ] **Step 3: Register the panel**

In `src/main.ts`, add to `THEMES` (line 1603):

```ts
  guide: { title: 'Guide', icon: 'guide', color: '#dce7ea' },
```

Add the import. `src/main.ts` line 7 currently ends the `../shared/game.js` import; add a new line after it:

```ts
import { GUIDE_SECTIONS } from '../shared/guide.js';
```

Add the open state beside the other panel state near `let openPanel: string | null = null;` (line 96):

```ts
let guideOpen: string | null = null; // which Guide card is expanded, or null
```

- [ ] **Step 4: Write the panel body**

In `src/main.ts`, add above `panelBody` (line 2013):

```ts
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
  }).join('')}</div>`;
}
```

Add the branch at the top of `panelBody` (line 2013), before the `stats` check:

```ts
  if (openPanel === 'guide') return guideBody();
```

- [ ] **Step 5: Handle the expand tap and the button**

In the `panel.addEventListener('click', ...)` switch (the one with `case 'announcement-del'` at line 2356), add:

```ts
    case 'guide':
      guideOpen = guideOpen === v ? null : v;
      renderPanel();
      break;
```

In `setPanel` (line 2597), beside the dock toggle at line 2609, add:

```ts
  $<HTMLButtonElement>('#help').classList.toggle('on', name === 'guide');
```

Add the button listener next to the dock wiring (after the block at line 2622):

```ts
$<HTMLButtonElement>('#help').addEventListener('click', () => setPanel(openPanel === 'guide' ? null : 'guide'));
```

- [ ] **Step 6: Open the Guide on a first visit**

Replace `welcome()` (line 2570) and the `TOUR` constant above it (line 2562) with:

```ts
// ---------- first visit: open the Guide on its first card ----------
function welcome() {
  if (localStorage.getItem('auralis.tour')) return;
  localStorage.setItem('auralis.tour', 'done');
  guideOpen = 'start';
  setPanel('guide');
}
```

`GUIDE_START` now lives in `shared/guide.js`; delete the old `TOUR` array.

- [ ] **Step 7: Style the cards**

In `src/style.css`, after the `.modal` block (around line 1006):

```css
/* The Guide: one card per system, expanded in place */
.guide { display: flex; flex-direction: column; gap: 8px; }
.guide-card { background: #fff; border: 2px solid var(--ink); border-radius: 12px; }
.guide-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; padding: 10px 12px; font: inherit; color: var(--ink); text-align: left; background: none; border: none; }
.guide-head .chev { color: var(--muted); }
.guide-card.open .guide-head { border-bottom: 2px solid var(--ink); }
.guide-body { padding: 10px 12px 12px; }
.guide-body > p { margin: 0 0 8px; font-size: 13px; color: var(--muted); }
.guide-steps { margin: 0; padding-left: 18px; font-size: 13px; }
.guide-steps li { margin-bottom: 6px; }
.guide-items { display: flex; flex-direction: column; gap: 10px; margin: 10px 0 0; padding: 0; list-style: none; }
.guide-items li { display: flex; align-items: flex-start; gap: 10px; }
.guide-items .icon { width: 32px; height: 32px; flex: none; image-rendering: pixelated; }
.guide-items b { display: block; font-size: 13px; }
.guide-items p { margin: 2px 0 0; font-size: 12px; color: var(--muted); }
```

- [ ] **Step 8: Typecheck and build**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm run build`
Expected: built with no errors.

- [ ] **Step 9: Check it in a browser**

Run: `npm run dev:all`

Open the app, sign in, and check:

- the `?` button sits right of the coin count
- clicking it opens a Guide panel with fifteen cards
- clicking a card expands it, clicking again collapses it
- `start` shows the five numbered steps
- `drinks` shows four item rows with their pictures
- no console errors

- [ ] **Step 10: Commit**

```bash
git add src/draw.ts index.html src/main.ts src/style.css
git commit -m "add a guide panel behind a ? button, and open it on a first visit"
```

---

### Task 4: The nudge

**Files:**
- Modify: `src/main.ts` (the `state` handler)

**Interfaces:**
- Consumes: `GUIDE_TIPS` from `../shared/guide.js`; `me.tipsSeen` from Task 2; `toast()`.
- Produces: nothing. Sends `tip_seen` for each nudge it shows.

- [ ] **Step 1: Add the import**

In `src/main.ts`, extend the import added in Task 3:

```ts
import { GUIDE_SECTIONS, GUIDE_TIPS } from '../shared/guide.js';
```

- [ ] **Step 2: Show the nudges**

In the `state` handler, after the notes block that ends at line 192 (`send({ t: 'notes_read' });`), add:

```ts
    // Something I own has something to teach, and I have not been taught it yet.
    const seen = me.tipsSeen ?? [];
    for (const id of Object.keys(GUIDE_TIPS)) {
      if (!me.inventory[id] || seen.includes(id)) continue;
      toast(GUIDE_TIPS[id]);
      send({ t: 'tip_seen', id });
    }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Check it in a browser**

Run: `npm run dev:all`

Sign in as a player who owns a coffee machine but has an empty `tipsSeen`:

- a toast naming the coffee machine appears once
- reloading does not show it again
- opening the Guide's `drinks` card shows the same words

- [ ] **Step 5: Fix the check that still expects the old gift button**

`scripts/e2e-ui.js:73` asserts the housemate buttons say "Give" while gifting. That label was removed, so the assertion now fails. Replace it:

```js
  ok('the housemate buttons show only the present while gifting', labels.every((t) => t.trim() === '🎁'), JSON.stringify(labels));
```

- [ ] **Step 6: Extend the Playwright check**

In `scripts/e2e-ui.js`, add beside the other checks:

```js
  // --- the Guide explains what the tooltip cannot ---
  await page.locator('#help').click();
  await page.waitForTimeout(500);
  await page.locator('.guide-head', { hasText: 'Drinks' }).click();
  await page.waitForTimeout(300);
  const guideText = await page.locator('#panel').innerText();
  ok('the Guide explains the coffee machine', /focus minute pays one extra coin/i.test(guideText), guideText.slice(0, 80));
```

- [ ] **Step 7: Run it**

```bash
node scripts/e2e-ui.js devtester dev-4a28df984dd0
```

Expected: PASS. If the sign-in password differs, use the tester's own.

- [ ] **Step 8: Commit**

```bash
git add src/main.ts scripts/e2e-ui.js
git commit -m "nudge once when something worth knowing turns up in storage"
```

---

### Task 5: Announcements into the bell

**Files:**
- Modify: `src/main.ts` (House panel, `renderBell`, `toggleBell`, the bell click switch)

**Interfaces:**
- Consumes: `houseAnnouncements` (already in state, `src/main.ts:168`), `linkify()`, `esc()`, `ago()`, `houseCode`, `myId`, `announcementModal` (`src/main.ts:3213`).
- Produces: nothing new on the wire. Reuses `inboxSeen` and `inbox_read`.

- [ ] **Step 1: Take announcements out of the House panel**

In `src/main.ts`, delete the `announcementsHtml` constant (lines 2074–2081) and remove `${announcementsHtml}` from the returned template (line 2089).

- [ ] **Step 2: Put them at the top of the bell**

Replace `renderBell` (line 3350) with:

```ts
function renderBell() {
  const list = me.inbox ?? [], seen = me.inboxSeen ?? 0;
  const fresh = houseAnnouncements.filter((a) => a.at > seen).length;
  const count = list.filter((n) => n.at > seen).length + fresh;
  $('#bellCount').textContent = count > 9 ? '9+' : String(count);
  $('#bellCount').hidden = !count;
  bellBtn.ariaLabel = bellBtn.title = count ? `Notifications (${count} new)` : 'Notifications';
  if (bellMenu.hidden) return;
  const owner = !!houseOwnerName && houseOwnerName === members.find((m) => m.id === myId)?.name;
  const notes = houseAnnouncements.length ? `<div class="bell-head"><h3>📢 Announcements</h3>${owner ? '<button class="small off" data-bell="announce">＋ Post</button>' : ''}</div>
    <div class="announcements">${houseAnnouncements.map((a) => `<div class="announcement"><p>${linkify(a.text)}</p><small>— ${esc(a.by)} · ${new Date(a.at).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</small>${owner ? `<button class="off small" data-bell="announce-del" data-v="${a.id}">Delete</button>` : ''}</div>`).join('')}</div>`
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
```

This reuses the existing `.announcements` and `.announcement` styles, so no new CSS is needed.

The owner check is the same name comparison the Post button already used at `src/main.ts:2080`. The House panel's Delete button used a different check — `myId === houseCode.split(':')[0]`, which compares a player id to a five-character house code and is therefore never true, so Delete never rendered. Moving to the bell with one correct check fixes that as a side effect.

- [ ] **Step 3: Clear the badge when only an announcement is new**

In `toggleBell` (line 3364), replace the `inbox_read` condition:

```ts
  if ((me.inbox ?? []).some((n) => n.at > bellOpenSeen) || houseAnnouncements.some((a) => a.at > bellOpenSeen)) { me.inboxSeen = Date.now(); send({ t: 'inbox_read' }); }
```

- [ ] **Step 4: Wire the two new bell buttons**

In the `bellMenu.addEventListener('click', ...)` switch (line 3379), add:

```ts
    case 'announce': announcementModal.showModal(); break;
    case 'announce-del': if (confirm('Delete this announcement?')) send({ t: 'announcement_del', id: Number(v) }); break;
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Check it in a browser**

Run: `npm run dev:all`

Sign in as the house owner:

- the House panel has no announcements section
- the bell shows an Announcements block with a ＋ Post button
- posting an announcement raises the bell count
- opening the bell clears the count
- a non-owner sees the announcements and no buttons

- [ ] **Step 7: Extend the Playwright check**

In `scripts/e2e-ui.js`, add:

```js
  // --- announcements live in the bell now ---
  ok('the House panel no longer shows announcements', (await page.locator('#panel .announcements').count()) === 0);
  await page.locator('#bell').click();
  await page.waitForTimeout(400);
  const bellText = await page.locator('#bellList').innerText();
  ok('the bell has an announcements block', /Announcements/i.test(bellText), bellText.slice(0, 80));
```

- [ ] **Step 8: Run the whole suite**

Run: `npm test`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm run build`
Expected: built with no errors.

- [ ] **Step 9: Commit**

```bash
git add src/main.ts scripts/e2e-ui.js
git commit -m "move house announcements into the bell, and count them as unread"
```

---

## Self-Review

**Spec coverage**

| Spec section | Task |
|---|---|
| What gets listed, and what does not | Task 1 (`GUIDE_TIPS`, `items`) |
| The content module | Task 1 |
| The button | Task 3 (icon, button, `setPanel`) |
| The panel | Task 3 (`guideBody`, `THEMES.guide`, accordion) |
| The nudge | Task 4 |
| First visit | Task 3 (Step 6) |
| Announcements into the bell | Task 5 |
| Announcements in the badge | Task 5 (Steps 2 and 3) |
| Data flow | Task 2 (`tip_seen`, `tipsSeen`) |
| Error handling | Task 3 (Step 4 filters unknown items), Task 5 (Step 3) |
| Testing | Tasks 1–5, each with its own check |

**Type consistency**

- `GUIDE_SECTIONS`, `GUIDE_TIPS`, `GUIDE_START` — defined in Task 1, imported in Task 3 and Task 4 with the same names.
- `guideOpen: string | null` — declared in Task 3 Step 3, used in Task 3 Steps 4 and 5.
- `tipsSeen?: string[]` — declared in Task 2 Step 1, read in Task 4 Step 2.
- `tip_seen: { t: 'tip_seen'; id: string }` — declared in Task 2 Step 1, sent in Task 4 Step 2, handled in Task 2 Step 5.
- `#help`, `#bellCount`, `#bellList`, `bellOpenSeen`, `announcementModal` — all already exist in `src/main.ts` and are used unchanged.