# Game logic

All rules live in `shared/game.js` and `shared/stats.js`, so the browser and the server agree. Tests: `shared/*.test.js`.

## House layout (`buildGrid`)

- A room is `w × h` floor tiles: 10×8 to start, then 12×9, 14×10 and 16×11 after paid upgrades costing 250, 600 and 1,200 coins.
- Each room has a **two-tile-tall back wall** and one-tile side and bottom walls.
- Rooms sit in a square grid that grows with the house: 1 room is 1×1, 2–4 rooms 2×2, 5–9 rooms 3×3, and so on. Rooms fill a row before starting the next. In a row they pack side by side by their real size, and neighbours share one wall column. Each row starts below the tallest room of the row above.
- When the grid grows or a room moves, characters move along with the room they were standing in.
- **Side-by-side rooms open into each other.** The shared wall becomes an opening (`DOOR` cells) across every floor row both rooms have, except the first and last, which stay as posts. The back wall above stays too, so each room keeps its wallpaper. The opening's floor shows each room's own floor on its half, with a trim seam in the middle.
- **Rows link with a 2-tile doorway** where the floors overlap, so back walls with their windows stay whole.
- The grid also records which room owns each floor tile, so floors, wallpaper and pets know whose room they're in.

## Placement (`canPlace`)

- The item must be in the catalog, at whole-tile coordinates, and fully inside the room's current size.
- Solid items can't overlap solid items. Rugs (non-solid) can't overlap rugs but can sit under furniture.
- Moving checks placement against the room *without* the item being moved.

## Focus and rewards

- Allowed lengths: 15, 25, 45 and 60 minutes. The server stores `endsAt` and accepts `focus_done` only after it has passed (2 s grace).
- Reward = minutes, plus 25% (rounded up) if another housemate is focusing or finished within the last 2 minutes.
- When a session starts, the client walks the character to a chair directly behind a desk (or any chair) and seats them facing the viewer.

## Stats (`shared/stats.js`)

- Sessions are `{ at, minutes, tag }`, where `at` is when the session finished. Bucketing uses the viewer's local time.
- Day = 24 hourly bars, Week = Sun–Sat, Month = one bar per day, Year = Jan–Dec. Arrows move the range with `shift()`, which clamps month changes (Jan 31 + 1 month = Feb 1).
- Streak = consecutive days with at least one session, counted back from today, or from yesterday if nothing is finished yet today.
- Leaderboard = sum of minutes in the last 7 days (or all-time totals), for the house or every player.

## Subjects

Quick picks = subjects you saved with ★, plus any subject used at least twice, most-used first (up to 10). Removing a chip hides it until you use that subject again.

## Pets

Each pet's position is a pure function of `(owner id, pet slot, current time, walkable floor tiles of that room)`. Every 5 seconds it picks a new tile from a seeded hash, trots there with easing, then idles. All viewers compute the same path without any syncing.

## Camera

- The zoom is the largest whole number at which the current room (with walls) fits the space the HUD, dock, side bar and panels leave free. Whole numbers keep the pixels crisp.
- If the room fits, the camera centres on the room. Otherwise it follows the player. It eases between rooms.

## Using furniture

- Items with an `act` (chairs, sofa, armchair, beanbag, gym ball, dumbbells, punching bag, exercise bike, treadmill) can be stood on. When a character stops on one, everyone draws them using it (sitting, bouncing, lifting, punching, cycling, running). Nothing extra is synced: the pose comes from the tile they're on.
- When idle, your character either walks to a random reachable tile (55%: an unused piece of furniture next to a reachable tile instead), with only a short pause between walks. Lounging lasts 8–15 s, workouts 5–10 s.
- `top` items (drinks, pet bed, pet ball) only collide with each other, so they can stand on tables and rugs. On a table they're drawn lifted onto its surface.

## Pet toys

Items with a `pet` action (cat tower: perch on top, doghouse and pet bed: nap, pet ball: chase it in circles) are mixed into a pet's wandering: each 5-second leg has a 45% chance of heading to a toy instead of a floor tile, and the pet plays there while it idles. It's still a pure function of the clock, so every viewer sees the same thing.

## Day and night

Each viewer's local clock sets the sky (`skyNow`): day 8:00–17:00, dusk 6–8 and 17–20, night otherwise. Windows show that sky. At dusk and night the house gets a tint, and light is added back around floor lamps. Anyone studying at a desk after dark gets a desk lamp on the table in front of them, with its own glow.

## Using decor

- Every solid item except desks has a `use` (water, read, cook, strum, game, wash, admire…, 23 in all). Desks are used by sitting in the chair behind them. Idle characters sometimes walk to the tile in front of one, face it and play the matching animation for 4–8 s. The action rides along on the `pos` message, and the server only relays names from `USES`.
- Beds have `act: 'sleep'`: a character on one is tucked in with z's.

## Furniture styles

Items with `looks` (sofa, armchair, bed, lamp, plant, rug, bookshelf, wardrobe, coffee table) have 3 styles each, stored as `s` on the placed item and picked in Decorate → Style. They're drawn by `ALT[item][s - 1]` in `draw.ts`. Style 0 is the original.

## Pet looks

Each pet kind has free `coats` (fur colours) and can wear one accessory from `PET_ACCS`. Accessories are bought once into `petAccs`, then put on any pet from the You panel (`pet_style`).

## Catalog and shelves

- `SHELVES` in `shared/game.js` sets the shop shelves, and each item names its `shelf`. Twelve shelves hold 20 items each. Items without a shelf (the free desk and chair, and the retired bathroom pieces) aren't sold, but stay valid so rooms that already have them keep them.
- Most items are drawn from shape recipes (`RECIPES` in `draw.ts`): a list of boxes, discs, hearts, and blinking or sliding rects, with `$` standing for the owner's colour. Hand-drawn items keep their own `DRAW` function.
- Pets: 20 kinds and 20 accessories. Pets also eat at food bowls, fountains and treat jars (`pet: 'eat'`).

## Extra rooms

- Each player has `rooms` (up to `MAX_ROOMS` = 3). Room 2 costs 1,500 coins and room 3 costs 2,500 (`ROOM_COST`). Each room upgrades its size on its own and has its own wallpaper and floor.
- The house grid is every housemate's rooms in order: all of player 1's rooms, then player 2's, and so on, so a player's rooms sit next to each other.
- Room-specific messages (`place`, `move`, `pickup`, `room`, `flip`, `restyle`, `shape`, `expand`) carry `r`, the room index (first room when missing). The server ignores an index the player doesn't own.
- On startup the server moves old single-`room` saves into `rooms[0]`.
- Pets live in their owner's first room. Decorate starts on the room you're standing in (if it's yours), and you switch rooms with the chips at the top or by tapping one of your other rooms.
