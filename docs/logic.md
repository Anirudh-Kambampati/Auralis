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

## Connectors

Free, keyless-where-possible accounts that feed the game. A connector lives on the player's own row (`p.conn`), so it follows them from house to house and needs no table. Rates, caps and intervals are in `shared/connectors.js`; the calls are in `server/connectors.js`.

- **GitHub** (`github`, a username): today's commits, ten coins per two commits and two study minutes a commit, capped at 50 coins a day (ten commits) and 90 minutes a day. The count comes from GitHub's commit search — `GET /search/commits?q=author:{user} author-date:>=midnight`, one request for every public repository — because the public events feed stopped carrying a push's commit list (only the repository, the ref and two hashes now) and can lag for days. The events feed is still read first, so a username that does not exist is a 404 rather than a silent zero, and when the search is rate-limited the count falls back to today's pushes and each repository's `GET /repos/{repo}/commits?author={user}&since=midnight`; a repository that answers 404 there is skipped. The public API allows 60 requests an hour per address, shared by every player on the server; `GITHUB_TOKEN` makes it 5,000. The reward toast names the source and the reason ("GitHub: you committed, so here's your 2 coins and 4 study minutes.") rather than a bare "connected activity".
- **LeetCode** (`leetcode`, a username): today's accepted solutions. Ten coins and ten study minutes each, capped at 50 coins a day (five solutions) and 90 minutes a day. The public GraphQL endpoint is undocumented and can change without notice, so a failure is a message on the row and a retry, never a broken save.
- **The daily task, the streak and the milestone.** Linking LeetCode adds one to-do, "Solve today's LeetCode problem" (`leetcodeTask`), on the player's own row with `conn: 'leetcode'`. It is the same task every day — rolled over when the UTC day changes, never duplicated — and it is ticked by the same poll that sees the solve, so the task and the proof of it come from one place; the player can still tick or edit it by hand. A **streak** is consecutive days with at least one accepted solution, counted on the connector (`data.streak`, `data.lastSolved`) because only a poll can see it happen, and it resets on a missed day. Consistency pays a milestone **once per run and outside the daily cap**: 3 and 7 days, then every 15 days (15, 30, 45, 60, 75, …), at 10 coins per day of the streak — 3→30, 7→70, 15→150, 30→300, 45→450, 60→600, 750 at 75 — and a broken streak starts the run again. The reward is announced by the same sweep that pays it — the automatic minute sweep sends the milestone note and the activity line just as a manual sync does — so a streak is never rewarded silently. The streak shows in the **Focus** panel, beside the study streak (and as a pill on the daily task itself), not in Settings — Settings keeps the day's ledger and the rate, while the streak is a reason to focus.
- **Calendar feed** (`ics`, a public iCal address): Canvas, Google Classroom, Outlook and Apple all export one. Its dates land on the personal calendar with `src: 'ics'`; DAILY/WEEKLY/MONTHLY recurrences with `COUNT`, `UNTIL`, `BYDAY` and `EXDATE` are expanded, and only the next 60 dates inside 180 days are kept. A `Z` stamp is moved into the player's own clock (`p.tz`). A feed pays nothing.
- **Spotify** (`spotify`, OAuth): what the account is playing is drawn over the record player in their room (`members[].nowPlaying`). It needs `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`; Development Mode requires the app owner to have Premium and admits five listeners. Sign-in comes back to the site as `/#spotify-connected` (or `-denied`, `-expired`, `-failed`); the site reads that marker once as a toast and strips it from the address, so a reload does not repeat it, and the connector row is the lasting record of how it went. **The console is Spotify's now.** Its old lo-fi loop is gone: hovering the record player gives three quiet buttons (`POST /api/connectors/spotify/control`, `{ action }`) that play, pause, skip and go back. That needs `user-modify-playback-state` — an account linked before the scope existed must be reconnected — plus Premium on the account and an active device; each refusal is a sentence on the row. Spotify answers the missing scope with **401 "Permissions missing"**, not 403, so the sign-in's scopes are kept on the token record: the row says "Reconnect to allow play and pause" before the card is pressed, and a press repeats it rather than blaming the account. Resuming names the device from the current player state, because a phone that paused over the API can stop counting as "active" and a bodyless play would answer 404. A 401 that really is a dead token is retried once behind a forced refresh. While its owner is online, Spotify is polled every 5 s instead of every 2 minutes, so a song that changes on another device lands on the record player while it is still new; the minute sweep keeps the paid ledger and the back-off. Clicking the console itself carries on listening, or pauses what is playing; with no account linked it opens Settings on the Spotify row instead, because there is no loop of its own left to fall back on.
- **Paid once, on the delta.** Coins and minutes are the difference between today's total and what has already been paid (`paid.day`), so seeing the same seven commits twice pays nothing, and a cap holds however often the sweep runs. **A sweep that found nothing new changes nothing:** only a new or removed date, a coin or minute paid, an error that appeared or cleared, or a different track marks a change, so no one's house state is rebuilt (and no save runs) just because their connector came due — which for Spotify is every two minutes. The day is a UTC day, like `session_days`. **Settings, not the calendar.** The rows live in the one Settings dialog, with sound, notifications and the account, because they are settings and not calendar entries: the calendar keeps the dates, and nothing about a connector is a date.
- **The row is where the ledger shows.** For an activity connector the Settings row ends with today's count and payout against the cap — `synced just now · 2 commits · 20/50 coins today` — built from the same `paid` record the server pays on. It is the only place the day's numbers appear; the reward itself still arrives as a toast. The row also spells out the rate itself — `10 coins per 2 commits · 2 study minutes each · 50 coins a day`, `10 coins per solved problem · 10 study minutes each · 50 coins a day` — so the terms are readable without the code.
- **A sweep, not a webhook.** Every 60 seconds each connector that is due is asked: 15 minutes for GitHub, 30 for LeetCode and a feed, 2 for Spotify. A failure stores a short message and backs off 30 minutes. LeetCode's half-hour poll is also what ticks the daily task: the same pass that sees an accepted solution marks "Solve today's LeetCode problem" done, so the task and the proof of it never disagree.
- **A feed address is an SSRF target.** It is typed by a player, so only http/https, no credentials in the URL, no private, loopback, link-local or metadata address after the hostname resolves, and every redirect hop is checked again — with a 10 s timeout, a 2 MB cap and three hops.
- **Imported dates never push out a typed one.** `applyEvents` keeps every hand-written event, fills what room is left under `MAX_EVENTS`, de-duplicates by key and honours `connHidden` (200 keys), so deleting an imported date keeps it deleted across syncs.

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

- The zoom is the largest whole number at which **the house's largest room** (with walls) fits the space the HUD, dock, side bar and panels leave free. Whole numbers keep the pixels crisp. The framing belongs to the house, not to the room you are standing in, so walking through a door — or reloading, or standing next to a housemate at the same window size — never magnifies or shrinks the view under the player. Every room is at most that size, so the room on show always fits.
- Zooming out stops at the whole house: each step is allowed only while the house is still bigger than the space on screen, so the furthest out is the step that first fits every room. Zooming in goes at most two steps past the fitted view. Both limits are fixed by the house, so they cannot change under you as you move. Nothing else changes the zoom — only the buttons, pinch, Ctrl/Cmd + wheel and the `+`/`-` keys do, and each of them re-frames on your character.
- Zoomed in, the camera follows the player; zoomed out it centres on the room the player is in, which always fits at the house scale. Either way it stops at the edges of the house, so the screen never shows empty space beyond it. It eases between rooms, and a zoom re-frames on the player (or the room) from scratch, dropping any drag left over from before so the view lands on them rather than beside them.
- In Decorate the camera is held on the room being decorated (`editRoom`), not on the player: the panel is about a room, and your character may have wandered into a housemate's. It centres that room even when the zoom is too close for the whole room to fit — following the character instead is what used to leave the view on them. Closing the panel hands the camera back to whoever you are standing as.

## Walking by key

- **W/A/S/D and the arrow keys steer while held**, not once per press. The client remembers the pressed keys (`heldDirs`) and `step()` queues the next tile only when the character has arrived on the last one, so the queue is never more than a tile ahead: a tap is one tile, holding walks steadily at the usual speed (3.2 tiles a second, 4.2 after coffee), and letting go stops within the tile being walked — no stack of steps walking itself out afterwards.
- Each tile is one `pos`, about three a second, so steering stays well inside the server's 8-a-second message budget and never raises "Slow down a little — too many actions at once." The newest key held wins, so W then A turns the corner at once. A key press drops any click-to-walk path and the character steers from where it stands; losing focus clears the held keys, so a tab that is left cannot keep walking.

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

## To-dos

- **A to-do belongs to whoever made it.** It is saved on their row (`p.todos`), not on a house, so it comes with them to the next house and is still there after a move. A list holds at most 60, private and shared together.
- **Sharing names people, and the names are fixed when it is written.** `to` is a list of ids — the picked housemates, or the whole house as it stands for an "everyone" one (which keeps `all` too, for its pill and its reward). Somebody who moves in later is not added to it, and somebody who moves out does not fall off it.
- **Each of them keeps it on their own list.** The maker holds the task; every other person it is for gets a reference on their row (`p.todoRefs`: the task's id, who made it, and `left` once they take it off). What a player sees is `todoView`: the shared to-dos held on the rows of the people they live with, plus the tasks their own references name. So a task stays on an assignee's list after its maker moves out, and stays with them if they are the one who moves. A reference whose task was deleted, or that names someone its maker has since taken off it, drops itself; a task written for someone while their row was unread is picked up (`claimTodos`) when it is read. Private to-dos only ever ride in `me.todos`.
- Each person a task is for ticks their own part (`ticks`); it is done once all of them have, wherever they live now. An `all` task's "everyone finished" reward is paid to those same people (`settleTodos`), capped per day; it needs the maker's house to see the task, so a task its maker has moved away from is not paid out. A tick, an edit or a delete also refreshes the house at the other end, so the maker's list changes as it happens rather than at their next action.
- Only the maker can edit one, and an edit that drops someone removes their reference. Deleting a task you made removes it for everyone it was for; the ✕ on a task that was given to you only takes it off your own list (`left`), and the task carries on for the others.
- A recurring task's next occurrence goes on the maker's row and into everyone's references, so it keeps following the same people.
- Reminders (`at`) are swept over the shared to-dos of every house and over the references people hold, so a task whose maker has moved away still nudges the people it is for; `reminded` keeps each one to a single nudge.
- A task an older build saved on a house row is moved onto its maker's row at boot — or when a lazily loaded maker is read — with no task lost; one that had no maker goes to a member of its house. The same boot names the people an older "everyone" task was for (its house as it then stood) and writes their references.

## Chat: how fast, and how long

- **The house chat belongs to the house.** Joining another house starts its chat from scratch: the lines on screen, the bubbles over speakers and the unread count are dropped with the house left behind (`chat = []` in the `state` handler), and the box fills with the new house's tail. Anything the server has sent for the old house stops arriving at that point too, so the card never shows two houses at once.
- **One budget per connection.** A socket may send 40 messages in a burst and then 8 a second (a token bucket, capped at 40). Going over does not close the socket: the message is dropped and the client gets `{ t: 'error' }` saying it is sending too fast. The per-intent guards (0.6 s between chat lines, 1.5 s between pats, …) still apply on top, so this is only the backstop against a script, not a second gameplay rule.
- **The client must not spend the budget on raw DOM events.** Anything that fires many times a second is coalesced before it reaches the socket, because the drop is silent apart from that one toast and an intent that is dropped just does nothing. A typing indicator goes out once per run of typing (and its `typing: false` two seconds after the last key), not once per keystroke; a colour from the picker is sent when the dialog closes (`change`), not for every colour the pointer drags over (`input`); and a held arrow key nudge in Decorate sends at most one `move` every 150 ms instead of one per auto-repeat — a press inside that window is queued for the moment it expires rather than dropped, so a quick second tap still moves the piece (150 ms later, on top of the first). Walking costs one `pos` per tile, about three a second, queued as the character arrives rather than per key press.
- **History is kept for two years.** Once a day the server deletes `messages` rows older than 730 days, so the archive cannot grow without bound; a thread’s list row stays (its newest message is younger by definition). Pages older than that are gone from `history`. The pictures and files those messages carried are read first and deleted from the bucket with them, so retention does not leave orphaned objects behind.
- **A line is a frame, not a broadcast of the house.** Saying something writes the archive and sends one `{t:'msg'}` frame (about 150 bytes) to each person who can read that thread, in any house. A `state` is built when the room changed, and the chat tails ride in it only on connect, a join, a house change or a thread loaded late; presence and coin changes are their own small frames as well. Before this, every line and every presence heartbeat re-sent every room, to-do and conversation to every housemate.
- **Unread counts survive a reload.** `read` writes `threads.seen`, and the server sends the map it has loaded as `me.threadSeen` (thread → newest id read), so a fresh client can tell what it has missed without replaying the archive. Receipts are held for a couple of seconds and written once per thread, so a reconnect in that window keeps the receipt waiting instead of reloading an older `seen`: reading and then reloading never brings the unread badge back.
- **The thread on screen is read.** Opening a thread, or coming back to a tab that already had it open, clears its count and sends the read receipt, so the badge does not return on the next load. A line that lands while the tab is in the background still counts for the title, but the thread it belongs to is on screen the moment you return. Opening the chat card on the conversation list is not reading: it marks nothing seen. The dock's chat button counts conversations, not lines (house chat, groups and private threads each count once while anything in them is unread); the bell counts its own entries. A fresh load rebuilds those counts from the server's read positions without a ping, a sound or a title count — what was missed is shown, not announced.

## Muting a chat

- A thread can be muted from the bell in its header, beside Leave group or Unfriend: **2 hours**, **8 hours** or **always**. Muted threads offer **Unmute** instead.
- Muting is per player and per thread (`me.mutedThreads`: `0` means always, any other value is the moment it ends). It only lives on your side — the other person can still hear from you.
- A muted thread still counts its messages: the unread badge keeps growing and the chat stays bold, and a crossed-out bell sits beside its name in the list. Only the sound, the speech bubble, the system notification and the push are dropped. A temporary mute simply runs out; nothing has to be undone.
- House chat, groups and private threads are muted the same way.

## Notifications

- There are three layers, and every kind can be switched off on its own (`NOTIFY` in `shared/game.js`, saved as `me.notify`): the bell's list, a system notification while the tab is in the background, and a web push while Auralis is closed. The bell always records; the other two ask the preferences first, and a muted thread drops both.
- **A notification opens what it is about.** A system notification brings the tab forward and opens its target. A push carries that target in its payload — `dm:<peer>` (a person, or `g:<group>` for a group thread), `house`, `todos` or `bell` — and tapping it focuses a running Auralis, which the service worker tells where to go, or opens one at `/?open=…`. The target is a closed list of places, never a URL, so a payload cannot steer the app anywhere else; an unknown one only brings the app forward. If the app is still signing in, the target waits for the first `state`.
