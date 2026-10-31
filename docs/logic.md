# Game logic

All rules live in `shared/game.js` and `shared/stats.js`, so the browser and the server agree. Tests: `shared/*.test.js`.

## House layout (`buildGrid`)

- A room is `w × h` floor tiles: 10×8 to start, then 12×9, 14×10 and 16×11 after paid upgrades costing 250, 600 and 1,200 coins.
- Each room has a **two-tile-tall back wall** and one-tile side and bottom walls.
- Rooms pack side by side by their real size, 3 per row, and neighbours share one wall column. Each row starts below the tallest room of the row above.
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
