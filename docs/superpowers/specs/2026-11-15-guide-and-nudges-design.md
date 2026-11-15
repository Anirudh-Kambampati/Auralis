# A Guide To What Auralis Can Do — Design Spec

**Date:** 2026-11-15
**Status:** Approved (brainstorming)
**Scope:** One new content module, one new panel, one new header button, a first-run tour that lists every step at once, and house announcements moved from the House panel into the bell. One new client→server message and one new per-player field.

## Problem

Auralis has 284 items and nine dock panels, and almost none of it is discoverable after the first minute.

The first-run tour (`TOUR` at `src/main.ts:2562`) shows five sentences, writes `localStorage.auralis.tour`, and never appears again — on any device, for any reason. There is no way to replay it and nothing to look things up in.

What the tour does not cover is where the depth is: the coffee machine opens a 10-minute window in which every focus minute pays an extra coin; the claw machine costs 5 coins, cools down for 30 minutes and drops one of 25 catalog prizes; the pottery wheel, easel, loom, craft table and sewing table each make one random piece from their own pool on a 20-minute cooldown; pets bond, do tricks and find coins; crafted pieces can be kept or gifted; claw prizes and stored pieces can be gifted or sold with no cap, while the coin gift stays at five a day; and announcements, exams, to-dos and stats each have a home nobody is told about.

The hover tooltip already names the click — "Water", "Nap", "Play the claw · 5 coins". What it cannot say is the consequence, and the consequence is the part people miss.

## Goals

1. A player who has been here for weeks can find out what they have been missing.
2. A new player is guided on their first visit, and can reopen that guidance at any time.
3. Discovering a notable thing teaches you what it does, once, wherever you are.
4. One place for "things you should know": announcements live with the rest of the notifications.
5. The item data stays the only source of truth for behaviour. Nothing in the Guide can claim an item does something it does not.

## Non-goals

- Prose for all 284 items. The Guide lists only items whose consequence the tooltip cannot express.
- Search, filtering or favourites inside the Guide.
- Any change to how items behave, what they cost or what they pay.
- Toasts as the delivery for a hidden feature. A toast is one line, gone in three seconds, and it marks the thing seen whether or not it was read.

## Design

### What gets listed, and what does not

The rule is: **an item is listed only when the hover tooltip does not already explain the consequence.**

The tooltip already says `Water`, `Study here`, `Nap (5-min break)`, `Play music`, `Send a gift`, `Play the claw · 5 coins`. So plants, chairs, speakers and gift boxes get no row — clicking them tells you. What the tooltip cannot say is what happens next.

That leaves ten item rows in the whole Guide. Everything else is a short prose section about a system.

### The content module

A new `shared/guide.js`, beside `ITEMS`, holding the words the catalog cannot:

```js
export const GUIDE_SECTIONS = [
  { id: 'focus', title: 'Focus', blurb: '…' },
  { id: 'drinks', title: 'Drinks and caffeine', blurb: '…',
    items: [{ item: 'coffeeMachine', text: '…' }] },
  // …
];

export const GUIDE_TIPS = { coffeeMachine: '…', clawMachine: '…' };

export const GUIDE_START = ['…', '…'];
```

- `GUIDE_SECTIONS` — ordered. `blurb` is one or two sentences. `items` is optional; a section without it is pure prose. `steps` is optional and holds plain paragraphs, used only by `start`.
- `GUIDE_TIPS` — keyed by item id, one sentence, shown once when the item is acquired.
- `GUIDE_START` — the five old tour steps, in order, as `start`'s `steps`.

Sections carry no icon. The panel header already shows the `guide` icon, and sixteen section icons would mean sixteen new sprites for very little gain; a card is its title, its blurb, and its item rows.

**Sections, in order:**

| id | Title | Items listed |
|---|---|---|
| `start` | Start here | the five old tour steps, as `GUIDE_START` |
| `focus` | Focus | none |
| `coins` | Coins and the Shop | none |
| `decorate` | Decorate and rooms | none |
| `drinks` | Drinks and caffeine | coffee machine, coffee, energy can, wine |
| `claw` | The claw machine | claw machine |
| `craft` | Crafting | pottery wheel, easel, loom, craft table, sewing table |
| `pets` | Pets | none |
| `lights` | Lights | none |
| `music` | Music and sound | none |
| `gifts` | Gifting and selling | none |
| `house` | House and friends | none |
| `todos` | To-dos, calendar and exams | none |
| `stats` | Stats | none |
| `chat` | Chat | none |
| `notify` | Notifications | none |

The approved table grouped the last three as one row; they are separate systems and became three sections.

**Item rows, with the sentence each will carry.** The wording below is the intent; the final phrasing is written during implementation, but each one must state the consequence, not the click.

- **Coffee machine** — clicking brews. Free and never used up; opens a 10-minute caffeine window, and every focus minute inside that window pays one extra coin (`caffeineMinutes`, `server/index.js:530`).
- **Coffee** — a cup from the machine; the same 10-minute window.
- **Energy can** — the same 10-minute window.
- **Wine** — two minutes of rest and a cosmetic sway. Nothing is consumed (`DRINKS.wine`, `shared/game.js:410`).
- **Claw machine** — 5 coins a play, 30-minute cooldown, one of 25 catalog prizes: mostly small trinkets, rarely a giant teddy (`CLAW_PRIZES`, `CLAW_COST`, `CLAW_COOLDOWN_MS`).
- **Pottery wheel** — free, 20-minute cooldown, makes one random piece of vase, sculpture, bust or mushroom pot (`CRAFT.potteryWheel`).
- **Easel** — free, 20-minute cooldown, makes a photo frame, vase, sculpture or bust.
- **Loom** — free, 20-minute cooldown, makes a rug: round, oval or runner.
- **Craft table** — free, 20-minute cooldown, makes candles, photo frames or a snow globe.
- **Sewing table** — free, 20-minute cooldown, makes a plush, giant teddy or big shark plush.

### The button

`index.html` gains a `chip` button immediately after the coin chip (currently `index.html:115`), holding a new `guide` icon. No text.

The icon is a new 12×12 entry in `UI_ICONS` (`src/draw.ts:3350`), a small book, following the existing pixel style and the 12-wide assertion already at `src/draw.ts:3556`. The same icon serves the button and the panel header.

Clicking runs `setPanel(openPanel === 'guide' ? null : 'guide')`. `setPanel` today toggles `.on` on `#dock button` only (`src/main.ts:2609`); it gains one line to light up `#help` the same way.

### The panel

A new `THEMES.guide` entry (`src/main.ts:1603`) and a `guideBody()` branch in `panelBody` (`src/main.ts:2013`).

The body is a vertical list of cards in `GUIDE_SECTIONS` order. Tapping a card expands it in place: an accordion, one open at a time, with the open id in `guideOpen: string | null`. It is client state, so a house update rebuilds the panel without collapsing what is being read.

Each card shows its title, then its blurb, then either its item rows (item icon, name, sentence) or, for `start`, its `steps` as a numbered list.

`start` is simply the first card.

### The tour

On every `state`, the client compares `me.inventory` against `me.tipsSeen`:

```
const fresh = unseenTips(me.inventory, me.tipsSeen ?? []);   // shared/guide.js
if (fresh.length && !tourRows.length) openTour(fresh.map((s) => ({ item: s.item, text: s.text })));
```

This hooks in beside the existing notes check at `src/main.ts:186`.

It deliberately does **not** diff inventory on the server. Every acquisition path — buying, a claw prize, a craft piece gifted by a housemate, a claw prize handed over — is covered by the same check, with no per-event plumbing.

**The tour lists every step at once.** The dialog is a scrollable column of rows: the current one expanded to its sentence, the rest collapsed to their titles, with `n / total`, Back, Next and Got it. Any row can be tapped to jump to it. This is the answer to the failure of the toasts this replaces: they showed one line at a time, three seconds each, and marked every tip as seen before it was shown — a player who owned ten of these things saw two and lost the other eight. Here nothing is marked seen unless it is on screen.

Opening the tour is what consumes the tips: `openTour` calls `markTipSeen` for every row it shows, which updates `me.tipsSeen` locally and sends `tip_seen`. One tour at a time — if the dialog is already open, a new set waits, and `finishTour` picks it up on close, which is what makes a purchase while a tour is open still get its own tour.

One consequence is intended: a player who already owned a coffee machine the day this ships gets its step on their next login, because the check is "in the inventory and not yet seen", not "acquired while I was watching". After that first login they are exactly as caught up as anyone else.

### First visit

`welcome()` (`src/main.ts:2594`) runs when the first `state` of a session arrives and `localStorage.auralis.tour` is absent. It writes the flag, opens the Guide on `start` behind the dialog, and opens the tour on the five `GUIDE_START` steps — a new player owns nothing worth a tip yet, so the intro is all there is.

Players who already dismissed the tour keep that flag. They still get the item tour on their first load, because that is driven by `tipsSeen` on the server rather than by the local flag, and for everyone it is empty until the tour ships.

### Announcements into the bell

Announcements are already client state — `houseAnnouncements` arrives in every `state` (`server/index.js:306`) and is stored at `src/main.ts:168` — and posting and deleting already work through `announcement_add` and `announcement_del`.

So the move is presentational:

- Delete the `announcementsHtml` block from the House panel (`src/main.ts:2075–2081`, rendered at `2089`).
- Render it at the top of the bell, above the notifications list, only when the house has any.

Each announcement keeps its text, author, time, and a Delete button for the owner. The owner also gets a ＋ Post button that opens the existing `announcementModal`. Non-owners see the announcements and no buttons, which is the rule already applied at `src/main.ts:2078`.

Announcements **do** join the bell's unread number, so a house post nags like any other notification rather than sitting quietly at the top of a menu nobody opens. They reuse the state that already exists:

- `renderBell` counts announcements with `at > me.inboxSeen` alongside the unread inbox entries (`src/main.ts:3351`). `inboxSeen` already means "last time I opened the bell", so no new per-player field is needed.
- `toggleBell` currently sends `inbox_read` only when an inbox item is new (`src/main.ts:3368`). It gains announcements in that `some()` check, so opening the bell with only a new announcement still clears it.
- The bell's per-entry "new" highlight uses `bellOpenSeen`, which is snapshotted from the same `inboxSeen`, so a fresh announcement highlights while the menu is open.

The accepted cost: someone joining a house that already has ten announcements sees a badge of ten on their first login. That reads as "here is what you missed", which is the intent.

### Data flow

One client→server message, validated through the existing `has()` guard (`server/index.js:244`):

| Message | Payload | Effect |
|---|---|---|
| `tip_seen` | `{ id }` | adds `id` to `p.tipsSeen` when `GUIDE_TIPS` has it; otherwise a no-op |

One new per-player field:

- `p.tipsSeen: string[]`, sent in the `me` payload beside `inboxSeen` (`server/index.js:311`).

`tipsSeen` is private. It is never added to `publicPlayer`.

Nothing else changes on the wire. Nudges are derived on the client, and announcements reuse `inboxSeen` and `inbox_read` rather than adding a protocol of their own.

### Error handling

- `p.tipsSeen ??= []` on the way in, so an account saved before this ships loads cleanly.
- An unknown or repeated `tip_seen` is a no-op, not an error toast.
- `guideBody` does not assume a section exists; a section whose every item is missing from `ITEMS` is skipped rather than throwing.
- `guideOpen` falls back to the first section when the remembered id is gone.

### Testing

**`shared/guide.test.js`** — what stops the content drifting:

- every section id is unique
- every item named in a section exists in `ITEMS`
- every `GUIDE_TIPS` key exists in `ITEMS`
- every tipped item appears in some section
- `GUIDE_START` is non-empty
- the tour is every tipped thing the player owns, and nothing they do not
- a tour only shows what has not been shown yet
- a player with nothing to teach gets no tour

**`scripts/e2e-tips.js`**, following `scripts/e2e-bell.js` and spawning its own throwaway server:

- a valid `tip_seen` adds the id, and sending it again does not duplicate it
- a bogus id changes nothing
- `tipsSeen` survives a reconnect
- another player's public view does not contain `tipsSeen`

**Playwright:**

- owning two tipped things opens the tour on its own, and lists both at once
- Next moves the tour on and the open row follows; a row can be tapped to jump
- Got it closes it, and a reload does not bring it back
- buying a third tipped thing afterwards opens a tour of just that one
- the `?` button opens the Guide
- a card expands
- the House panel no longer shows announcements
- a new announcement raises the bell's count, and opening the bell clears it

## Files touched

| File | Change |
|---|---|
| `shared/guide.js` | new: `GUIDE_SECTIONS`, `GUIDE_TIPS`, `GUIDE_START`, `tourSteps`, `unseenTips` |
| `shared/guide.test.js` | new: content integrity, and the tour's membership |
| `shared/game.js` | unchanged |
| `shared/types.ts` | `tipsSeen` on `MeState`; `tip_seen` in the message union |
| `server/index.js` | `tipsSeen` in `me`; `tip_seen` case |
| `index.html` | `?` button beside the coin chip; the `#tour` dialog |
| `src/draw.ts` | `guide` icon in `UI_ICONS` |
| `src/main.ts` | `THEMES.guide`, `guideBody`, `guideOpen`, `#help` handler and `.on`, the tour and its triggers, `welcome()` replaced, announcements moved to the bell and counted in its badge |
| `src/style.css` | the Guide cards, the tour, and the bell's announcements block |
| `package.json` | `test` script gains `shared/guide.test.js` |
| `scripts/e2e-tips.js` | new: the `tip_seen` round trip |