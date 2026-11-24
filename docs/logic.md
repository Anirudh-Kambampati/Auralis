# Game logic

All rules live in `shared/game.js` and `shared/stats.js`, so the browser and the server agree. Tests: `shared/*.test.js`.

## House layout (`buildGrid`)

- A room is `w × h` floor tiles: 10×8 to start, then 12×9, 14×10 and 16×11 after paid upgrades costing 250, 600 and 1,200 coins.
- Each room has a **two-tile-tall back wall** and one-tile side and bottom walls.
- Rooms sit in a square grid that grows with the house: 1 room is 1×1, 2–4 rooms 2×2, 5–9 rooms 3×3, and so on. Rooms fill a row before starting the next. In a row they pack side by side by their real size, and neighbours share one wall column. Each row starts below the tallest room of the row above.
- When the grid grows or a room moves, characters move along with the room they were standing in.
- **Side-by-side rooms open into each other.** The shared wall becomes an opening (`DOOR` cells) across every floor row both rooms have, except the first and last, which stay as posts. The back wall above stays too, so each room keeps its wallpaper. The opening's floor shows each room's own floor on its half, with a trim seam in the middle.
- **Rows link with a doorway** across the wall band wherever the two rooms' floors overlap, with two tiles of wall kept at each end so the upper room's wallpaper stays whole. When the shared stretch is too narrow for both end walls and a doorway you can see (fewer than six tiles of overlap), the end walls are dropped and the whole stretch opens, so no room below is left with a one-tile slot or sealed. A room below links to the room above it shares the most floor with, not to the same column: rooms in one column drift apart once the rows hold different sizes, and pairing by index used to leave the right-hand rooms with no entrance at all.
- The grid also records which room owns each floor tile, so floors, wallpaper and pets know whose room they're in.

## Placement (`canPlace`)

- The item must be in the catalog, at whole-tile coordinates, and fully inside the room's current size.
- Solid items can't overlap solid items. Rugs (non-solid) can't overlap rugs but can sit under furniture.
- **Wall pieces** are the items marked `wall: true` in `ITEMS` (the air conditioner). They hang in the two wall tiles above the room's floor row instead of taking floor: room-local `y` is `-1` for the tile against the floor or `-2` for the one above it, and `x + w` must still fit inside the room's width. They collide only with other wall pieces, so a lamp or a rug on the floor under one is fine, and the floor tile beneath stays walkable. A wall piece can't be put on the floor and a floor piece can't be hung, which is what keeps `y < 0` meaningful in a saved room.
- Moving checks placement against the room *without* the item being moved.

## Focus and rewards

- Allowed lengths: 15, 25, 45 and 60 minutes. The server stores `endsAt` and accepts `focus_done` only after it has passed (2 s grace).
- Reward = minutes, plus 25% (rounded up) if another housemate is focusing or finished within the last 2 minutes, plus the streak bonus from the Stats section below, plus one coin per caffeinated minute.
- Every finished session — and one ended early — is appended to the session log (`recordSession` in `server/index.js`). The row is the only copy: nothing reads a session history off a player row any more.
- When a session starts, the client walks the character to a chair directly behind a desk (or any chair) and seats them facing the viewer.

## Stats (`shared/stats.js`)

- A session is `{ at, minutes, tag }` (`at` is when it finished; `early: true` when it was cut short), and a **rolled-up day** is the same shape with `n` — how many sessions it stands for. Bucketing uses the viewer's local time.
- Sessions are an append-only log in their own table (`sessions`), never part of a player row and never updated once written: each finished or ended-early session adds one row, and the player row keeps only `totalMinutes`.
- Anything older than **90 days** is folded into `session_days` — one row per player, UTC day and subject, accumulating (`n` remembers the count) — once at boot and then every six hours. The panel and the leaderboard read both tables, so totals, streaks, subject splits and the year chart reach back forever while the per-session detail covers about a term.
- A rolled-up day keeps the day and the subject but not the hour or the session, so **past the window the day chart has no per-hour bars** and a day shows its minutes on its date.
- Day = 24 hourly bars, Week = Sun–Sat, Month = one bar per day, Year = Jan–Dec. Every bar is divided by subject too: `stacks` carries one number per tag per bar, in the same order as `tags`, so the subject list under the chart is also its key. A session with no tag counts as `Study`. Arrows move the range with `shift()`, which clamps month changes (Jan 31 + 1 month = Feb 1).
- Streak = consecutive days with at least one session, counted back from today, or from yesterday if nothing is finished yet today. A rolled-up day still counts, so a streak is never broken by the window. Finishing a session pays a streak bonus in coins (`streakBonus` in `shared/game.js`): +10% at 3 days, +25% at 7, +50% at 30.
- Leaderboard = sum of minutes in the last 7 days (or all-time totals), for the house or every player, summed from the log and the roll-up rather than from a number kept on a row.
- The same board can rank by **coins** instead (`metric: 'coins'`): the balance each player holds right now, read from the `accounts` table (a player who is offline is only a stub in the world), so the period does not apply and a player spending coins moves down the board. Houses show their members' coins added up.

## Subjects

Quick picks = subjects you saved with ★, plus any subject used at least twice, most-used first (up to 10). Removing a chip hides it until you use that subject again.

## Pets

Each pet's position is a pure function of `(owner id, pet slot, current time, walkable floor tiles of that room)`. Every 5 seconds it picks a new tile from a seeded hash, trots there with easing, then idles. All viewers compute the same path without any syncing.

A pet within 4 tiles of someone who is singing stops beside them and reacts: it watches, or bounces along with little notes over its head (`singPetAct` in `src/pets.ts`, a hash of the pet's seed and the clock, so every viewer picks the same one every 12 s). Nothing about it is sent to the server.

A pet's name tag is not always on screen. It shows while the pet trots somewhere, for six seconds after it is petted, while it does a trick, and now and then while it idles (`(now + seed * 37) % 27_000 < 3_600`, so housemates' pets never all flicker together).

### Bonding with someone else's pet

A pet keeps a hidden `visitorBonds` map, one number per person who has fussed over it: +1 for a pat, +2 for filling its bowl, +1 for throwing its ball (`GUEST_BOND_STEP` in `shared/game.js`). It is never shown as a number and never chosen by the UI. `guestBondLevel` turns it into what the pet does: level 1 at 4 interactions (it comes over now and then), level 2 at 16 (it also does tricks nearby), level 3 at 36.

### Who a pet goes to

The owner always outranks everyone: a pet with its owner in the room naps beside them while they study, greets them, follows to them if it is a follower, and pads over now and then otherwise. Guests come next, ranked by their own bond: the highest-bonded guest is `fav`, which every client receives, so however many screens are watching, they agree on who that pet seeks out. `fav` is picked among the pet's current housemates: someone who moved out stops being its favourite (their bond is kept, in case they come back), and a favourite who has not been in the house for a while does not leave the pet waiting for someone who is not there. A pet also only goes to somebody standing in the room it is already in, since its errand is to sit beside them. Every errand walks a route through the doors, and a straight step is only taken across open floor (plus the last step onto a piece of furniture, like a pet bed), so a goal behind a wall is never walked to — a pet hops furniture, never walls.

With the owner away, the pet goes and hangs out beside `fav` instead of drifting back to an empty room. That is all a guest's client needs: it also has `myBond`, so each person's own visits are theirs without anyone else's numbers on the wire.

A pet that reaches the person it likes (within 1.3 tiles) says so, once every two minutes per pet, in a toast. Patting or feeding one gets an answer in the pet's own words (`PET_LINES` on the server, picked by bond level).

### Saying hello, sunbathing and stealing a chair

Signing in is a small reunion: on the first house state after a login, `petGreet` is stamped for me, so my own pets get up from whatever they were doing and trot over to me. A pet that likes me best greets me too, even though it isn't mine: `petGreetMe` is stamped for every pet whose `fav` is me, and its nap is lifted so it can come — but only if it is in the room I am standing in, since its walk is a straight line. My own pets outrank that, so a pet with its owner and its favourite guest both signing in goes to its owner. Pets also greet an owner who comes online while I'm watching, and do a happy spin when a session ends.

On a clear day (`sky === 'day'`, not rain or snow) a pet now and then picks a floor tile under one of the room's windows and lies in the light for 20–45 seconds (`act: 'sun'`, with a warm gold Zzz). It will not do this at night or in the rain: the light is the whole point.

A pet also sometimes curls up on an empty chair, armchair, sofa or bench (`act: 'chair'`, lifted a few pixels so it reads as on the cushion, with no floor shadow). It stays there — no wandering, no visits — until someone clicks it: any `pat` clears `petSeat` and `petSunAt` on every client, so it gets up for the whole house at once. A click is not the only way out: a chair nap times out after four to eight minutes and the pet gets up on its own, so a pet in a house where nobody clicks it is never stuck asleep for a whole session. A sunbath ends the same way, after its twenty-to-forty-five seconds.

Pet sleep furniture is different: clicking it (`pet_sofa`) picks a non-away pet in the house that isn't already napping on one — your own first, then a housemate's, the ones you have fussed over most ahead of the rest — and sends it there. Any pet may sleep on any member's piece, so a house of four pets and four beds ends up with all four asleep instead of one pet taking every bed; a piece that already has a sleeper is left alone. The pet *walks* first — along the same route as always, through doorways and never over a wall — so a bed in another room means a trip across the house; the curled-up `act: 'chair'` only starts once it is standing on the piece, and a piece it cannot reach just leaves it standing where it is. It stays there — no wandering — until it is patted twice in a row. The first pat does nothing; the second clears its `sofa` assignment on the server and every client draws it getting up. Only one pet can be on a given piece at a time, and a pet can only be on one at a time. The pieces are the catalog's `pet: 'sleep'` entries — pet bed, doghouse, pet tent, pet sofa, pet basket and pet hammock. The cat tower is `pet: 'perch'`, so it is climbed, not slept on, and the client builds its click list from `ITEMS` rather than a second hand-written one. A nap remembers the piece by its owner and slot in that owner's room (`{owner, r, index}`), so changing the furniture keeps it honest for anyone's pet: picking the piece up, selling its room or swapping it out wakes the pet, and a piece that merely slides to another slot takes its sleeping pet with it rather than leaving it on whatever inherited the old index. A save from before naps named an owner treats the nap as its own pet's.

### Following you

Clicking your own pet, while you are not studying, toggles `follow` on its row (`pet_style`). A follower walks your own trail while you move and comes to sit beside you when you stop, so the toggle shows up at once instead of waiting for the next time you walk away; clicking it again sends it back to its own wandering. Followers roam free while you study, since a pet napping beside a desk should not be pinned in place.

You cannot leash someone else's pet. Patting it only grows your bond, and the patter is answered with one line from `PET_LINES`, picked by that bond — the `pat` message everyone receives is for the hearts and the name tag, not a second toast, so the pet's own words are not overwritten.

A trick is a hop with a side-to-side spin and three gold sparkles (`act: 'trick'` in `src/pets.ts`); a pet with level 2 or more with you may do one near you, though it will not start another while one is still playing, and it starts one only about once a minute (a far higher chance made a bonded pet trick most of the time, which read as spinning like a top). The spin in a trick and the happy spin after a session or a pat are both a mirror flip of the sprite, so the cadence is the whole effect: the sprite turns over every 400 ms (`SPIN_FLIP_MS` in `src/main.ts`). A flip every 150–160 ms, which is what these used to do, read as a pet flickering left and right rather than as turning.

## Camera

- The zoom is the largest whole number at which the current room (with walls) fits the space the HUD, dock, side bar and panels leave free. Whole numbers keep the pixels crisp.
- Zooming out stops at the whole house: each step is allowed only while the house is still bigger than the space on screen, so the furthest out is the step that first fits every room — a house that already fits the fitted room's view has nowhere to go. Zooming in goes at most two steps past that fitted view. The step limits follow the fitted room as you move between rooms; nothing else changes the zoom — only the buttons, pinch, Ctrl/Cmd + wheel and the `+`/`-` keys do.
- If the room fits, the camera centres on the room. Otherwise it follows the player. Either way it stops at the edges of the house, so the screen never shows empty space beyond it. It eases between rooms.
- In Decorate the camera is held on the room being decorated (`editRoom`), not on the player: the panel is about a room, and your character may have wandered into a housemate's. It centres that room even when the zoom is too close for the whole room to fit — following the character instead is what used to leave the view on them. Closing the panel hands the camera back to whoever you are standing as.

## Using furniture

- Items with an `act` (chairs, sofa, armchair, beanbag, gym ball, dumbbells, punching bag, exercise bike, treadmill) can be stood on. When a character stops on one, everyone draws them using it (sitting, bouncing, lifting, punching, cycling, running). Nothing extra is synced: the pose comes from the tile they're on.
- When idle, your character either walks to a random reachable tile (55%: an unused piece of furniture next to a reachable tile instead), with only a short pause between walks. Lounging lasts 8–15 s, workouts 5–10 s.
- Tapping your own character flips it between wandering and staying put (`staying` in the client). While it is staying it finishes the step it is on, drops whatever walk or piece it was heading for, and holds that tile — no wandering at all — until you tap it again. Explicit moves still work: clicking furniture, a bed or a desk walks it there, and the arrow/WASD keys steer it; it simply stays where that leaves it.
- `top` items (drinks, plushes, pet bed, pet ball) only collide with each other, so they can stand on tables, beds and rugs. On a table they're drawn lifted onto its top (`SURFACE` in `draw.ts`); beds need no lift, since their art fills every tile of the footprint, so a plush put down on one already lands on the mattress. Either way the thing is sorted just in front of the piece itself, so it never hides behind the bed it sits on.

## Pet toys

Items with a `pet` action (cat tower: perch on top, doghouse and pet bed: nap, pet ball: chase it in circles) are mixed into a pet's wandering: each 5-second leg has a 45% chance of heading to a toy instead of a floor tile, and the pet plays there while it idles. It's still a pure function of the clock, so every viewer sees the same thing.

## Day and night

Each viewer's local clock sets the sky (`skyNow`): day 8:00–17:00, dusk 6–8 and 17–20, night otherwise. Windows show that sky. At dusk and night the house gets a tint, and light is added back around floor lamps. Anyone studying at a desk after dark gets a desk lamp on the table in front of them, with its own glow.

Clicking any piece in `LIGHTS` switches it off for the whole house: the placed item stores `off: true`, its glow is left out of the light map and it stops fending off the night tint. The fireplace is both a light and a sound, so one click puts the fire and its crackle out together; lighting it again starts both. An `off` fireplace is drawn as a cold, dark firebox — no flames, sparks or embers — so turning the light off anywhere puts the fire out on every screen.

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

Three gifting paths exist, and none of them is capped:

| Path | Message | Limit |
| --- | --- | --- |
| Coins | `gift` | Only your balance |
| Stored pieces | `gift_item` | Only what you own |
| Handmade pieces | `gift_crafted` | Only what you own |

The coin gift sends `GIFT_COINS` (10) each time, as often as the sender can afford. There is no daily gift cap: a gift only *moves* existing coins, it never mints new ones, so the sender's balance is the whole limit. Item and crafted gifts move a specific instance — a player can hand over as many claw prizes or handmade pieces as they own.

A desk note (`note {to, text}`) goes to one housemate, who sees it now or at their next login. Each note carries an `id` and a `seen` flag, and the sender keeps a copy with the recipient's name, so both sides of the exchange can be read. Notes are not deleted when they are read: the Notes tab marks them seen (a red dot on the tab says one is waiting, and its toast opens the tab) and keeps them until that side is cleared with two taps. Each list — the desk, the copies I left, and my own notebook — keeps the last `MAX_NOTES` (40).

The Notes tab is the second tab of the To-dos card. "To myself" is a private notebook (`scratch_add`, `scratch_edit`, `scratch_del`; up to 280 characters, and an edit keeps the id and the day it was started, adding `editedAt`). "From housemates" is what arrived, and `notes_clear {side: 'in'}` clears it; "Left by me" is my copies, cleared with `side: 'out'`. Both of those lists fold under their counted headings with a tap — the fold lasts for the session and the heading keeps counting what is hidden — and all of it rides in `me`, which only its owner receives.

A desk note's form sends one every seven seconds: after a note the form stays on the same desk but its field and button are disabled, counting down in the field's placeholder (`Another note in Ns…`) and on the button (`Wait Ns`). The wait is painted in place rather than rebuilding the panel, so no other box in the House panel is disturbed. This is a client-side courtesy — the field never accepts text that would be dropped.

## Extra rooms

- Each player has `rooms` (up to `MAX_ROOMS` = 3). Room 2 costs 1,500 coins and room 3 costs 2,500 (`ROOM_COST`). Each room upgrades its size on its own and has its own wallpaper and floor.
- The house grid is every housemate's rooms in order: all of player 1's rooms, then player 2's, and so on, so a player's rooms sit next to each other.
- An extra room can be sold from the Room shop (two taps). The first room is where you live and can't be sold; any later one pays its full `ROOM_COST[r]` back. Every piece placed in it returns to Storage, so it is in Decorate again, and any pet napping there — your own or a housemate's — gets up while naps on your later rooms follow their room's new index. Whoever was standing in the room carries on in its owner's first room.
- Room-specific messages (`place`, `move`, `pickup`, `room`, `flip`, `restyle`, `shape`, `expand`) carry `r`, the room index (first room when missing). The server ignores an index the player doesn't own. `sell_room` carries `r` too and refuses index 0.
- On startup the server moves old single-`room` saves into `rooms[0]`.
- Pets live in their owner's first room. Decorate opens on the room you're standing in if it's yours (otherwise the room you last decorated, starting with your first), and its camera stays on that room even when your character is somewhere else; you switch rooms with the chips at the top or by tapping one of your other rooms.

## Chat: how fast, and how long

- **One budget per connection.** A socket may send 40 messages in a burst and then 8 a second (a token bucket, capped at 40). Going over does not close the socket: the message is dropped and the client gets `{ t: 'error' }` saying it is sending too fast. The per-intent guards (0.6 s between chat lines, 1.5 s between pats, …) still apply on top, so this is only the backstop against a script, not a second gameplay rule.
- **The client must not spend the budget on raw DOM events.** Anything that fires many times a second is coalesced before it reaches the socket, because the drop is silent apart from that one toast and an intent that is dropped just does nothing. A typing indicator goes out once per run of typing (and its `typing: false` two seconds after the last key), not once per keystroke; a colour from the picker is sent when the dialog closes (`change`), not for every colour the pointer drags over (`input`); and a held arrow key nudge in Decorate sends at most one `move` every 150 ms instead of one per auto-repeat — a press inside that window is queued for the moment it expires rather than dropped, so a quick second tap still moves the piece (150 ms later, on top of the first). Walking already costs one `pos` per tile, about 1–3 a second.
- **History is kept for two years.** Once a day the server deletes `messages` rows older than 730 days, so the archive cannot grow without bound; a thread’s list row stays (its newest message is younger by definition). Pages older than that are gone from `history`. The pictures and files those messages carried are read first and deleted from the bucket with them, so retention does not leave orphaned objects behind.
- **A line is a frame, not a broadcast of the house.** Saying something writes the archive and sends one `{t:'msg'}` frame (about 150 bytes) to each person who can read that thread, in any house. A `state` is built when the room changed, and the chat tails ride in it only on connect, a join, a house change or a thread loaded late; presence and coin changes are their own small frames as well. Before this, every line and every presence heartbeat re-sent every room, to-do and conversation to every housemate.
- **Unread counts survive a reload.** `read` writes `threads.seen`, and the server sends the map it has loaded as `me.threadSeen` (thread → newest id read), so a fresh client can tell what it has missed without replaying the archive. Receipts are held for a couple of seconds and written once per thread, so a reconnect in that window keeps the receipt waiting instead of reloading an older `seen`: reading and then reloading never brings the unread badge back.
- **The thread on screen is read.** Opening a thread, or coming back to a tab that already had it open, clears its count and sends the read receipt, so the badge does not return on the next load. A line that lands while the tab is in the background still counts for the title, but the thread it belongs to is on screen the moment you return. Opening the chat card on the conversation list is not reading: it marks nothing seen. The dock's chat button sums every unread line (house chat, groups and private threads); the bell counts its own entries. A fresh load rebuilds those counts from the server's read positions without a ping, a sound or a title count — what was missed is shown, not announced.

## Muting a chat

- A thread can be muted from the bell in its header, beside Leave group or Unfriend: **2 hours**, **8 hours** or **always**. Muted threads offer **Unmute** instead.
- Muting is per player and per thread (`me.mutedThreads`: `0` means always, any other value is the moment it ends). It only lives on your side — the other person can still hear from you.
- A muted thread still counts its messages: the unread badge keeps growing and the chat stays bold, and a crossed-out bell sits beside its name in the list. Only the sound, the speech bubble, the system notification and the push are dropped. A temporary mute simply runs out; nothing has to be undone.
- House chat, groups and private threads are muted the same way.

## Notifications

- There are three layers, and every kind can be switched off on its own (`NOTIFY` in `shared/game.js`, saved as `me.notify`): the bell's list, a system notification while the tab is in the background, and a web push while Auralis is closed. The bell always records; the other two ask the preferences first, and a muted thread drops both.
- **A notification opens what it is about.** A system notification brings the tab forward and opens its target. A push carries that target in its payload — `dm:<peer>` (a person, or `g:<group>` for a group thread), `house`, `todos` or `bell` — and tapping it focuses a running Auralis, which the service worker tells where to go, or opens one at `/?open=…`. The target is a closed list of places, never a URL, so a payload cannot steer the app anywhere else; an unknown one only brings the app forward. If the app is still signing in, the target waits for the first `state`.
