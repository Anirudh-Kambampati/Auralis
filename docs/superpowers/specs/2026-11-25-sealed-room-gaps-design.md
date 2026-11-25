# Sealing the gaps between rooms

## Why

`buildGrid()` packs rooms by their real size and lays each row out by its **tallest** room
(`rowY += rowH + 1 + WALL_H`). A room shorter than its row therefore leaves cells below its floor that
no room owns. Those cells stay `VOID`, and the renderer draws nothing for `VOID`
(`if (!k) continue`), so `drawPaper()` — the page backdrop — shows through as a dark slab inside the
house.

The size of the hole depends on how differently the rooms are built:

| House | `VOID` cells inside the house |
| --- | --- |
| 9 rooms, levels `2,3,1,3,2,1,1,2,3` | 12 |
| 6 rooms, first one grand (`3`), the rest basic | 12 (a 4×3 courtyard at x 18–21, y 11–13) |
| 9 rooms, all basic | 0 |

A grand room over narrower rooms below is the shape in the report: a wide room's row is taller than
its neighbours, and the strip under it becomes a hole rather than building.

## The rule

One pass at the end of `buildGrid()`, after doorways and furniture:

1. Flood-fill `VOID` from the border of the grid's bounding box, four neighbours, iterative stack.
   Every `VOID` cell it reaches is **outside** (the page, the ragged dollhouse edge).
2. Every `VOID` cell it never reached is enclosed by the house, so set it to `WALL`.

Nothing else changes: floors, walls, blocked cells, doorways, `origins`, `sizes`, `w` and `h` are what
they were.

Why not fill every `VOID` cell: the ragged outer edge is the dollhouse silhouette the design is built
on, and the existing test `an upgraded room packs snugly next to a small one` asserts that the space
*below* a small room, open to the page, stays `VOID`. Sealing by reachability keeps both.

## What it looks like

Filled cells are ordinary wall tiles, so the renderer needs no change:

- Where a room sits below the fill, `drawWallFace` / `drawWallTop` carry that room's wallpaper and
  trim, exactly like the wall band around it.
- Where no room does, `drawWall` gives the plain panel and its base trim.
- The ink outline pass runs around the outside of the filled block instead of tracing the hole, and
  the diorama drop shadow covers it.

The house reads as one thick-walled building at the pockets, while the outer silhouette stays ragged.

## What does not change

- Walkability: `VOID` was never walkable, so paths, pets, seats and the `walkable` check are unaffected.
- The camera: `houseFit` fits `grid.w` × `grid.h`, which the fill does not alter.
- Doors, room walls, furniture placement, room names and room outlines.
- The server: `buildGrid` is a client-side/index construction; the server validates placement room by
  room and reads no grid cells.

## Tests

Add to `shared/game.test.js`:

1. **A grand room over basic ones seals the strip below it**: `buildGrid` with levels
   `[3, 0, 0, 0, 0, 0]` returns `WALL` for every cell of the 4×3 pocket (x 18–21, y 11–13) instead of
   `VOID`.
2. **Outside stays outside**: in the same house, a `VOID` cell reachable from the border (for example
   the open space right of the second row) is still `VOID`.
3. **Nothing to seal changes nothing**: a 9-room all-basic house still has no `VOID` cells and the same
   `w`/`h` as before.

The existing grid tests (doorways, reachability, furniture blocking, the small-room test) must pass
unchanged.

## Docs

- `docs/logic.md`, house layout: cells no room reaches are wall, sealed by the border flood fill; the
  outer edge is still paper.
- `docs/design.md`: the house reads as one building and never shows the page between rooms.
- `docs/choices.md`: why reachability (and not a rectangular footprint) is the rule, and what would
  change it.

## Not in scope

- Repacking rooms, changing room sizes, or removing the one-tile wall gap between rooms.
- Filling the outer ragged edge; a notch open to the page on one cell stays paper on purpose.
- Giving the filled cells a wallpaper of their own: they take what the existing wall renderer picks
  from the room below, or plain wall.
