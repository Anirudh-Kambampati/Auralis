# Drinks, Claw Machine and Crafting — Design Spec

**Date:** 2026-11-15
**Status:** Approved (brainstorming)
**Scope:** Client and server. Adds three interaction behaviours to existing furniture, two player fields, one furniture field, and three messages. No new catalog entries; all rewards are existing items.

## Problem

Furniture currently has one interaction shape: `act` (a pose taken from the tile you stand on) or `use` (walk up, play a 4–8 s animation, fire a one-shot effect through `afterUse` in `src/main.ts:505`). Nothing remembers, nothing costs, and nothing produces an item.

Drinks are a good example of the gap. `coffeeMachine`, `coffee`, `energyCan` and `wine` all exist and are all `top` items, but clicking any of them does nothing beyond a generic animation — and until the click-through fix in `502d5d9`, a drink on a desk could not even be clicked.

## Goals

1. Coffee, the energy can and the coffee machine all grant one shared **caffeine** effect: 10 minutes, visible to the player and to housemates.
2. Caffeine pays a focus bonus, including to a session already running.
3. Wine grants a 2-minute rest and a cosmetic **tipsy** sway.
4. The claw machine plays for 5 coins and yields a plushe or small decor piece.
5. Five craft pieces yield an existing decor item in a random colour, which the player keeps or gifts.
6. Nothing is consumed by drinking; cooldowns are the only gate.

## Design

### Drinks

One table in `shared/game.js`, next to `USES`:

```js
// What clicking a drink does. caffeine: minutes of the shared effect. rest: minutes of break. tipsy: cosmetic sway.
export const DRINKS = {
  coffeeMachine: { caffeine: 10 },
  coffee: { caffeine: 10 },
  energyCan: { caffeine: 10 },
  wine: { rest: 2, tipsy: true },
};
```

`interact` in `src/main.ts` checks `DRINKS[f.item]` before the generic `use` path, so a drink never needs an entry in `USE_LABELS` or `USE_LOOK`.

Drinking costs nothing and consumes nothing. The machine and the cup stay where they are.

### Caffeine window

Two fields on `Member`, so every viewer sees the same effect:

```ts
caffeineSince?: number;   // when the current caffeinated stretch began
caffeineUntil?: number;   // when it ends
```

Drinking sets `caffeineSince = now` only if not already caffeinated, then `caffeineUntil = max(caffeineUntil, now + 10 * 60_000)`. Drinking while already caffeinated therefore tops the timer back up to ten minutes from now without creating a second window.

While caffeinated:

- **Walk speed** rises from 3.2 to about 4.2 tiles per second (`speed` at `src/main.ts:1057`).
- **The character is on fire** — a flame pass drawn around the sprite in the render loop, built from the existing `particle` helper in `src/draw.ts:2581`.
- **A HUD chip** counts down, following the pattern of `#breakChip` in `index.html:122` and `tickTimers` in `src/main.ts:1587`.
- **Focus pays double** for caffeinated minutes (see below).

The flame and the chip are cosmetic and are driven by the clock, so they run out on their own with no message.

### Caffeine and focus reward

The bonus applies to the overlap between the session and the caffeine window, so a running session benefits and an old session does not.

At `focus_done` (`server/index.js:515`):

```js
const cafMs = Math.max(0, Math.min(focusEnd(p.focus, now), p.caffeineUntil ?? 0)
                         - Math.max(focusStart(p.focus), p.caffeineSince ?? 0));
const cafMinutes = Math.floor(cafMs / 60_000);
const reward = focusReward(p.focus.minutes, buddies) + Math.ceil(p.focus.minutes * streakBonus(streak)) + cafMinutes;
```

`focusStart(f)` is `focusEnd(f) - f.minutes * 60_000`. Caffeinated minutes pay one extra coin each, so an hour-long session with coffee drunk five minutes in pays ten extra.

`quitReward` (`shared/game.js:649`) uses the same overlap, so leaving early cannot be used to claim a bonus that was not earned.

The client shows the bonus in the focus deck's note line (`#deckNote`, `src/main.ts:1615`), so the player can see what the coffee is worth.

The reward is computed at `focus_done` from `p.caffeineSince`/`p.caffeineUntil` on the server, so a client cannot claim it by editing its own clock. The client-side countdown is display only.

Because the window is stored rather than the bonus, the extra coins can be shown live while the session runs: the deck note adds the overlap so far to the projected total.

### Tipsy

Wine sets `tipsyUntil = now + 2 * 60_000` and starts the existing snack break (`startBreak(2 * 60_000, …)`, which already chimes and stands the player up).

**Tipsy** — the character sways: a side-to-side offset and a one-pixel bob, on the same draw path as any other pose. Purely cosmetic, no gameplay effect.

`tipsyUntil` is a third field on `Member`, and rides along the same way as the caffeine window. Because it is short, it is refreshed on the `pos` message rather than broadcast separately.

### Claw machine

`clawMachine` is `solid` and already on the games shelf. One click:

1. Server checks the player has 5 coins and the piece is off cooldown.
2. Server charges 5 coins and sets `state.readyAt = now + 10 * 60_000`.
3. Client plays a 5-second claw animation over the prize pool.
4. Server picks a prize by weight and adds it to `inventory`.

Prize pool (plushes and small decor, all existing catalog items):

| Item | Weight |
| --- | --- |
| `plush` | 30 |
| `snowGlobe` | 20 |
| `sculpture` | 18 |
| `discoBall` | 12 |
| `easterBunny` | 10 |
| `reindeer` | 6 |
| `sharkPlush` | 3 |
| `bigTeddy` | 1 |

The cooldown needs one new field:

```ts
// on Furniture
state?: { readyAt?: number };
```

### Crafting

Five pieces already carry `use: 'paint'`: `potteryWheel`, `easel`, `loom`, `craftTable`, `sewingTable`. Each gets its own pool:

| Piece | Yields |
| --- | --- |
| Pottery wheel | `vase`, `sculpture`, `bust`, `mushrooms` |
| Easel | `photoFrames`, `vase`, `sculpture`, `bust` |
| Loom | `rug`, `roundRug`, `ovalRug`, `runnerRug` |
| Craft table | `candles`, `photoFrames`, `snowGlobe` |
| Sewing table | `plush`, `bigTeddy`, `sharkPlush` |

The colour is a random pick from the piece's own palette when it has one (`colorsFor`), and from `PASTELS` when it does not, so a hand-thrown vase can come out in any of the sixteen pastels while a rug stays in its rug colours.

The craft finishes in one step: the server picks the item and colour and the client plays the making animation while it waits for the reply. There is no multi-stage progress to persist.

Crafting costs nothing and is gated by a per-piece cooldown (`state.readyAt`, 5 minutes).

Each craft produces one item in a random colour, as a real instance rather than a count. `inventory` is `Record<string, number>` and cannot hold a colour, so the player gains a parallel list:

```ts
crafted?: { item: string; col: string }[];
```

This list lives on the player row, not on `Member`, so it is private to its owner and is never sent in the house state.

The player then chooses:

- **Keep** — the piece moves into `crafted` and appears in Decorate's Storage grid beside counted items, showing its colour. Placing it consumes that entry and sets `col` on the placed furniture.
- **Gift** — the piece is appended to a housemate's `crafted` and they get an inbox line naming the sender and the item, via the existing `inbox` helper (`server/index.js:283`).

### Messages

Three new client-to-server messages, all validated against `ITEMS` and ownership like the existing ones:

```ts
brew:    { t: 'brew'; owner: string; r: number; index: number }
claw:    { t: 'claw'; owner: string; r: number; index: number }
craft:   { t: 'craft'; owner: string; r: number; index: number; keep: boolean; to?: string }
```

The server replies with the existing `reward` message for coins and a new `crafted` message carrying the piece, so the client can show what was made.

`brew` carries no cost field because the coffee machine is free; the server treats all three messages as intents and decides for itself.

`crafted` is added to the `me` payload in `broadcastHouse` (`server/index.js:308`), so its owner sees their own pieces. It is not part of `publicPlayer`, so housemates never see another player's storage.

A gift therefore works in two steps: `craft` with `keep: false` and a target appends to that housemate's `crafted` and files an inbox line through the existing `inbox` helper (`server/index.js:283`); the recipient's own `me` payload then carries the piece.

Placing a crafted piece consumes the matching entry in `crafted` and sets `col` on the placed furniture. The server matches on item and colour, and removes the oldest match if several are identical.

### Data flow

```
click a drink
   |
   +-- DRINKS[item] --> caffeineSince/caffeineUntil on the member --> broadcast
   |                        |                                   |
   |                        +-- flame pass, HUD chip, speed     +-- housemates see the flame
   |
   +-- wine --> tipsyUntil + startBreak(2 min) --> sway

click the claw machine
   |
   +-- server: 5 coins, state.readyAt, weighted prize --> inventory

click a craft piece
   |
   +-- server: cooldown, random item + colour --> keep? crafted : housemate's crafted + inbox
```

## Files touched

- `shared/types.ts` — `caffeineSince`, `caffeineUntil`, `tipsyUntil` on `Member`; `state` on `Furniture`; `crafted` on the player; three message types.
- `shared/game.js` — `DRINKS`, `CRAFT` pools, `focusStart`, caffeine overlap helper, `quitReward` overlap.
- `server/index.js` — `brew`, `claw`, `craft` handlers; `crafted` in the `me` payload; broadcast on brew.
- `src/main.ts` — drink interaction, HUD chip, flame and sway passes, claw and craft panels, Storage grid showing crafted pieces.
- `src/draw.ts` — flame pass, claw animation.
- `index.html` — the caffeine chip.
- `src/style.css` — the chip and the Storage grid.

## What does NOT change

- The catalog gains no items; every reward already exists.
- `furnitureAt`, `pickAt` and the click-through fix from `502d5d9` are untouched.
- `canPlace`, `placeSwaps`, the save format and every existing message keep their shape.
- Drinking is free and consumes nothing.

## Error handling

- Drinks have no cooldown of their own: the caffeine window is the limit, and drinking again only tops it up. Wine's limit is the break it starts, which `startBreak` already refuses while a focus session is running.
- Drinking during a session is allowed and takes effect immediately, which is why the reward is computed from the stored window at `focus_done` rather than at `focus_start`.
- A craft with an unknown target housemate falls back to keeping the piece rather than losing it.
- A malformed `crafted` entry (unknown item, or a colour that is not a six-digit hex) is dropped on load, the same way unknown inventory keys are dropped at `server/index.js:1447`.
- A stale `caffeineUntil` in the past simply means no overlap, so an old save cannot claim a bonus.
- The claw machine refuses a play without 5 coins or while `state.readyAt` is in the future, and says which.

## Testing

- Caffeine overlap: session entirely inside the window, entirely outside, straddling both edges, and a session that ends before the coffee is drunk.
- Drinking twice tops up rather than stacking.
- Quitting early pays the overlap, not the full session.
- Claw weights sum to 100 and always yield a catalog item.
- Every craft pool item exists in `ITEMS`.
- All 40 existing tests continue to pass; `npm run build` is clean.