# Clicking Things That Stand On Other Things — Design Spec

**Date:** 2026-11-15
**Status:** Approved (brainstorming)
**Scope:** Client-side hit-testing fix only. No server protocol, no new furniture, no new behaviour, no save-format change.

## Problem

An object placed on a table, counter or shelf cannot be clicked. Clicking it selects the table underneath instead.

`furnitureAt` in `src/main.ts` collected every piece whose footprint covered the tile, then returned the first `solid` one:

```ts
return (hits.find(({ f }) => ITEMS[f.item as ItemKey].solid) ?? hits[0])?.i ?? -1;
```

Tabletop items are `top: true` and `solid: false` (`shared/game.js`, e.g. `coffeeMachine`, `teapot`, `laptop`, `toaster`). A `top` item never wins that search, so the piece it stands on always takes the click.

## Goals

1. An object on a table is clickable in its own right.
2. The table underneath stays reachable **without** moving or putting away what stands on it.
3. Hover labels and the touch tooltip agree with what a click does.
4. Nothing that already works changes: 40 existing tests pass, build clean.

## Design

### Hit-testing: rank by layer, then fall through the inert

The renderer already draws `top` items above `solid` ones, and `canPlace` in `shared/game.js` already treats them as separate layers (`layer(it) = it.top ? 2 : it.solid ? 1 : 0`). Hit-testing now uses the same order.

`furnitureHits(room, lx, ly)` returns **every** piece covering the tile, sorted topmost first: `top` (2) → `solid` (1) → neither (0). It replaces the old single-pick function as the shared primitive.

`furnitureAt(room, lx, ly)` keeps its signature and remains "what a click uses". It takes the topmost hit that actually *does* something, falling back to the topmost hit overall:

```ts
function isInteractive(f: Furniture) {
  const it = ITEMS[f.item as ItemKey];
  return !!it && (!!it.act || !!it.use || LIGHTS.has(f.item) || CLICKABLE.has(f.item) || !!soundName(f.item));
}
```

`isInteractive` mirrors the special cases `tapAt` already handles: `act`/`use` from the catalog, `LIGHTS` (switchable lamps), the `CLICKABLE` set (`petBall`, `deskCalendar`, `giftBox`, `whiteboard`), and `soundName` (things that toggle a sound).

This matters for a mug on a desk. A mug has no `act`, `use`, light, sound or special-case, so it is not interactive — the click falls through to the desk. A coffee machine *is* interactive, so it takes the click.

### Decorate: tap a stack again to reach what is underneath

Ranking alone would make the counter under a machine unreachable in Decorate, which is where furniture is moved. `pickAt(room, lx, ly)` adds depth:

- Tapping the same tile within **3 seconds** steps down the stack: machine → counter → (next) → wrap to the top.
- Tapping a different tile, or waiting longer than 3 seconds, starts again at the top.
- The depth wraps, so the list is a cycle rather than a dead end.

`pickAt` is used **only** in Decorate, on the tile under the pointer. Outside Decorate, `furnitureAt` is unchanged and has no notion of depth — a click there always means "the topmost interactive thing".

The Decorate hint text now says: *"Tap a stack again to reach what is underneath."* When a stack has more than one piece, a toast names the piece selected and says whether to tap again for the next one down.

### Data flow

```
pointer tap
   |
   +-- Decorate? -- yes --> pickAt(room, lx, ly) --> furnitureHits --> depth cycle --> select piece
   |                                                          (top > solid > neither)
   +-- no ----> furnitureAt(room, lx, ly) --> furnitureHits --> topmost interactive --> act / use / light / sound / special
```

## Files touched

- `src/main.ts`
  - `furnitureHits` — new; every hit under a tile, topmost first.
  - `isInteractive` — new; mirrors the `tapAt` special cases.
  - `furnitureAt` — now "topmost interactive, else topmost".
  - `pickAt` — new; depth-cycling picker for Decorate.
  - `CLICKABLE` — new constant next to `TVS`.
  - `tapAt` — Decorate branch uses `pickAt`; reports the depth cycle.
  - `decorateBody` — hint text mentions stacking.

`clickLabel` and the touch tooltip already call `furnitureAt`, so they need no change and follow automatically.

## What does NOT change

- `furnitureAt`'s signature and return type (`number`, an index or `-1`).
- The catalog, `Furniture`, `canPlace`, `placeSwaps`, the save format, and every server message.
- Decorate's drag-to-move, `Put away`, arrow-key nudge, and the selection panel.
- The renderer's layer order, which already drew `top` above `solid`.

## Error handling

- A tile with no furniture returns `-1`, as before; callers already treat that as "just walk there".
- A stale depth index past the end of a stack wraps to 0, so a piece put away mid-cycle cannot leave a dangling selection.
- `ITEMS[f.item]` missing from the catalog ranks as layer 0 and is not interactive; the old code had the same tolerance.

## Testing

- Existing suite: `npm test` — 40 tests pass.
- Typecheck and build: `npm run build` (runs `tsc --noEmit` then `vite build`).
- Manual: place a coffee machine on a kitchen counter. Click it — the machine responds, not the counter. Enter Decorate and tap the same tile twice — the selection moves to the counter. Put a mug on a desk and click it — the desk responds.