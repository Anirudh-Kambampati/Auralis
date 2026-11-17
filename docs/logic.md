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

A pet within 4 tiles of someone who is singing stops beside them and reacts: it watches, or bounces along with little notes over its head (`singPetAct` in `src/pets.ts`, a hash of the pet's seed and the clock, so every viewer picks the same one every 12 s). Nothing about it is sent to the server.

A pet's name tag is not always on screen. It shows while the pet trots somewhere, for six seconds after it is petted, while it does a trick, and now and then while it idles (`(now + seed * 37) % 27_000 < 3_600`, so housemates' pets never all flicker together).

### Bonding with someone else's pet

A pet keeps a hidden `visitorBonds` map, one number per person who has fussed over it: +1 for a pat, +2 for filling its bowl, +1 for throwing its ball (`GUEST_BOND_STEP` in `shared/game.js`). It is never shown as a number and never chosen by the UI. `guestBondLevel` turns it into what the pet does: level 1 at 4 interactions (it comes over now and then), level 2 at 16 (it also does tricks nearby), level 3 at 36.

### Who a pet goes to

The owner always outranks everyone: a pet with its owner in the room naps beside them while they study, greets them, follows to them if it is a follower, and pads over now and then otherwise. Guests come next, ranked by their own bond: the highest-bonded guest is `fav`, which every client receives, so however many screens are watching, they agree on who that pet seeks out. `fav` is picked among the pet's current housemates: someone who moved out stops being its favourite (their bond is kept, in case they come back), and a favourite who has not been in the house for a while does not leave the pet waiting for someone who is not there. A pet also only goes to somebody standing in the room it is already in, because its walk is a straight line to the goal and a target in the next room would take it through a wall.

With the owner away, the pet goes and hangs out beside `fav` instead of drifting back to an empty room. That is all a guest's client needs: it also has `myBond`, so each person's own visits are theirs without anyone else's numbers on the wire.

A pet that reaches the person it likes (within 1.3 tiles) says so, once every two minutes per pet, in a toast. Patting or feeding one gets an answer in the pet's own words (`PET_LINES` on the server, picked by bond level).

### Saying hello, sunbathing and stealing a chair

Signing in is a small reunion: on the first house state after a login, `petGreet` is stamped for me, so my own pets get up from whatever they were doing and trot over to me. A pet that likes me best greets me too, even though it isn't mine: `petGreetMe` is stamped for every pet whose `fav` is me, and its nap is lifted so it can come — but only if it is in the room I am standing in, since its walk is a straight line. My own pets outrank that, so a pet with its owner and its favourite guest both signing in goes to its owner. Pets also greet an owner who comes online while I'm watching, and do a happy spin when a session ends.

On a clear day (`sky === 'day'`, not rain or snow) a pet now and then picks a floor tile under one of the room's windows and lies in the light for 20–45 seconds (`act: 'sun'`, with a warm gold Zzz). It will not do this at night or in the rain: the light is the whole point.

A pet also sometimes curls up on an empty chair, armchair, sofa or bench (`act: 'chair'`, lifted a few pixels so it reads as on the cushion, with no floor shadow). It stays there — no wandering, no visits — until someone clicks it: any `pat` clears `petSeat` and `petSunAt` on every client, so it gets up for the whole house at once.

A trick is a hop with a side-to-side spin and three gold sparkles (`act: 'trick'` in `src/pets.ts`); a pet with level 2 or more with you may do one near you.

## Camera

- The zoom is the largest whole number at which the current room (with walls) fits the space the HUD, dock, side bar and panels leave free. Whole numbers keep the pixels crisp.
- If the room fits, the camera centres on the room. Otherwise it follows the player. Either way it stops at the edges of the house, so the screen never shows empty space beyond it. It eases between rooms.

## Using furniture

- Items with an `act` (chairs, sofa, armchair, beanbag, gym ball, dumbbells, punching bag, exercise bike, treadmill) can be stood on. When a character stops on one, everyone draws them using it (sitting, bouncing, lifting, punching, cycling, running). Nothing extra is synced: the pose comes from the tile they're on.
- When idle, your character either walks to a random reachable tile (55%: an unused piece of furniture next to a reachable tile instead), with only a short pause between walks. Lounging lasts 8–15 s, workouts 5–10 s.
- `top` items (drinks, pet bed, pet ball) only collide with each other, so they can stand on tables and rugs. On a table they're drawn lifted onto its surface.

## Pet toys

Items with a `pet` action (cat tower: perch on top, doghouse and pet bed: nap, pet ball: chase it in circles) are mixed into a pet's wandering: each 5-second leg has a 45% chance of heading to a toy instead of a floor tile, and the pet plays there while it idles. It's still a pure function of the clock, so every viewer sees the same thing.

## Day and night

Each viewer's local clock sets the sky (`skyNow`): day 8:00–17:00, dusk 6–8 and 17–20, night otherwise. Windows show that sky. At dusk and night the house gets a tint, and light is added back around floor lamps. Anyone studying at a desk after dark gets a desk lamp on the table in front of them, with its own glow.

## Using decor

- Every solid item except desks has a `use` (water, read, cook, strum, game, wash, admire…, 24 in all). Desks are used by sitting in the chair behind them. Idle characters sometimes walk to the tile in front of one, face it and play the matching animation for 4–8 s. The action rides along on the `pos` message, and the server only relays names from `USES`.
- `sing` (mic stand, karaoke machine) is the one action that is purely visual: no sound, no shared “music” tour line. The character holds a mic, breathes a small bob, swaps to an open-mouth face and floats ♪/♫ up, with a faint spotlight cone and pool behind them (`drawSinging` and `drawSingSpotlight` in `src/draw.ts`).
- **Duet:** a second microphone placed within one tile of the singer (not counting the piece directly in front of them) upgrades the pose for everyone: both hands on the mic, a sway, a wider beam and notes from the middle. It is a placement check while drawing, so it needs no new field, message or save slot.
- Beds have `act: 'sleep'`: a character on one is tucked in with z's.

## Furniture styles

Pieces with `looks` are styled in Decorate → Style: sofa, armchair, bed, lamp, plant, rug, bookshelf, wardrobe, dresser, coffee table and karaoke machine. The list is the styles by name, so its length is how many there are — 3 for most, 6 for the bed, 5 for the rug, bookshelf and wardrobe, 4 for karaoke. The choice is stored as `s` on the placed item, checked by the server against that list, and drawn by `ALT[item][s - 1]` in `draw.ts`. Style 0 is the original. Recolouring a piece recolours whichever style it is wearing.

## Pet looks

Each pet kind has free `coats` (fur colours) and can wear one accessory from `PET_ACCS`. Accessories are bought once into `petAccs`, then put on any pet from the You panel (`pet_style`).

## Catalog and shelves

- `SHELVES` in `shared/game.js` sets the shop shelves, and each item names its `shelf`. Twelve shelves hold 20 items each. Items without a shelf (the free desk and chair, and the retired bathroom pieces) aren't sold, but stay valid so rooms that already have them keep them.
- Most items are drawn from shape recipes (`RECIPES` in `draw.ts`): a list of boxes, discs, hearts, and blinking or sliding rect, with `$` standing for the owner's colour. Hand-drawn items keep their own `DRAW` function.
- Pets: 20 kinds and 20 accessories. Pets also eat at food bowls, fountains and treat jars (`pet: 'eat'`).

## Drinks, the claw and crafting

- **Drinks** (`DRINKS` in `shared/game.js`): coffee, the energy can and the coffee machine grant **caffeine** for 10 minutes — faster walking, a flame pass, a HUD chip, and one extra coin per caffeinated focus minute. Wine grants a 2-minute rest and a cosmetic **tipsy** sway. Drinking is free and consumes nothing; the caffeine window is the only limit, and it is the drinker's own: any housemate can drink at any machine, and the window only ever opens on the person who clicked. Every limit like this is per player, so one housemate's drink, play or craft never makes another wait.
- **Claw machine**: 5 coins, a 30-minute wait on the player who plays it, and a weighted prize from `CLAW_PRIZES` — small trinkets and plushes, all existing catalog items. Any housemate can play it; the clicker pays, the clicker gets the prize, and the clicker waits. The prize lands in their `inventory`.
- **Crafting**: the five `use: 'paint'` pieces (`potteryWheel`, `easel`, `loom`, `craftTable`, `sewingTable`) each own a pool of catalog items. Crafting is free, waits 20 minutes on the clicker, and produces one item in a random colour as a real instance stored in the clicker's `crafted` list. Any housemate can use any piece, so a kiln in my room makes something for whoever taps it. That list is private to its owner and rides in `me`, never in `publicPlayer`. A crafted piece can be kept, placed (carrying its colour), gifted to a housemate, or sold for a quarter of catalog price.

  A wait is kept per player, in `p.ready`: a map from `readyKey(room, index, item)` to the moment it ends, sent in `me` and never in `publicPlayer`. Two players can use the same piece at once, and swapping a piece in a slot starts a fresh wait because the item is part of the key.

## Gifting

Three gifting paths exist, and only one is rate-limited:

| Path | Message | Rate limit |
| --- | --- | --- |
| Coins | `gift` | 5 per day per player |
| Stored pieces | `gift_item` | None |
| Handmade pieces | `gift_crafted` | None |

The coin gift sends `GIFT_COINS` (10) and is capped so coins cannot be shovelled between accounts. Item and crafted gifts move a specific instance and have no cap — a player can hand over as many claw prizes or handmade pieces as they own.

## Extra rooms

- Each player has `rooms` (up to `MAX_ROOMS` = 3). Room 2 costs 1,500 coins and room 3 costs 2,500 (`ROOM_COST`). Each room upgrades its size on its own and has its own wallpaper and floor.
- The house grid is every housemate's rooms in order: all of player 1's rooms, then player 2's, and so on, so a player's rooms sit next to each other.
- Room-specific messages (`place`, `move`, `pickup`, `room`, `flip`, `restyle`, `shape`, `expand`) carry `r`, the room index (first room when missing). The server ignores an index the player doesn't own.
- On startup the server moves old single-`room` saves into `rooms[0]`.

## Muting a chat

- A thread can be muted from the bell in its header, beside Leave group or Unfriend: **2 hours**, **8 hours** or **always**. Muted threads offer **Unmute** instead.
- Muting is per player and per thread (`me.mutedThreads`: `0` means always, any other value is the moment it ends). It only lives on your side — the other person can still hear from you.
- A muted thread still counts its messages: the unread badge keeps growing and the chat stays bold, and a crossed-out bell sits beside its name in the list. Only the sound, the speech bubble, the system notification and the push are dropped. A temporary mute simply runs out; nothing has to be undone.
- House chat, groups and private threads are muted the same way.
- Pets live in their owner's first room. Decorate starts on the room you're standing in (if it's yours), and you switch rooms with the chips at the top or by tapping one of your other rooms.
