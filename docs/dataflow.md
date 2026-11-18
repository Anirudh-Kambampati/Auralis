# Data flow

## Signing up and logging in

1. The landing page posts `{ username, password }` to `/api/signup` or `/api/login`.
2. On sign-up, the server checks the username (3–20 of `A–Z a–z 0–9 _ . -`, unique regardless of case) and the password (at least 8 characters). It stores a scrypt hash with a random salt, never the password itself.
3. The server creates a random 32-byte token, stores only its SHA-256 hash with a 30-day expiry, and returns the token.
4. The browser keeps the token in `localStorage` (`auralis.token`) and opens the WebSocket.
5. The first WebSocket message is `{ t: 'hello', token }`. The server looks the token up and attaches the socket to that player.    A bad or expired token gets `{ t: 'auth', ok: false }`, and the client returns to the landing page. If the lookup itself fails because the database is unreachable, the server closes the socket with code 1011 and sends no `auth` message: the token was never judged, so the client keeps it and reconnects with backoff instead of signing the player out.

Repeated attempts from one IP are slowed (20 per 10 minutes). A guest player from before accounts existed (`auralis.id`) is claimed once at sign-up, so their progress carries over.

## Game messages (WebSocket `/ws`)

Every client → server message is an intent. The server validates it, changes the in-memory world, saves, and sends `state` to everyone in the house.

```
client                         server                                    house members
  │  {t:'buy', item:'sofa'}      │                                            │
  │ ───────────────────────────▶ │ ITEMS.sofa exists? coins >= price?         │
  │                              │ coins -= price, inventory.sofa += 1        │
  │                              │ save() after 0.5 s → players row (JSONB)   │
  │ ◀─────────────────────────── │ {t:'state', house, me} ──────────────────▶ │
```

A chat line is the exception: it is written to `messages` (and one `threads` row per member), the last 50 lines in memory are updated, and the same `state` is broadcast. The rows themselves are not touched, so saying something no longer rewrites a player row.

| Intent | Server checks |
| --- | --- |
| `pos {x,y}` | Relays to housemates only. Not saved; no full broadcast. |
| `focus_start {minutes, tag}` | Allowed lengths only, not already focusing. |
| `focus_done` | The session's end time has passed. Awards coins (+25% if a housemate is studying) and appends `{at, minutes, tag}` to `sessions`. |
| `buy`, `adopt`, `expand` | Enough coins; pet cap of 4; room level limit. |
| `place`, `move` | The item is in your storage; `canPlace` (inside your room, no overlap). |
| `flip`, `restyle`, `room` | The furniture exists; colours and patterns come from the allowed lists. |
| `todo_*`, `chat` | Text cleaned and length-capped; chat flood guard (one message per 0.6 s). |
| `watch {url, to?, g?}` | URL must pass `parseVideo`. House chat (no `to`/`g`) starts/ends the house watch party for everyone in that house. In a DM (`to`, must be a housemate or friend) starts/ends a private watch party for just those two users, even in different houses. In a group chat (`g`) starts/ends a watch party for all group members, even in different houses. `watchCtl` syncs play/pause/seek for the matching party. |
| `join`, `leave` | The house code exists. Moving out takes your room with you into a new house. |
| `leaderboard` | Answered to the asker only: minutes summed from `sessions` and `session_days` for the last 7 days (or all time), over the house, friends, everyone, or houses. |
| `friend_search {q}` | At least 2 characters. Answered to the asker only with `friend_matches`: up to 8 usernames starting with `q`, never your own. |
| `friend_request {name}` | A username, a housemate's name, or a house code (its owner); at most 20 requests waiting. |
| `tip_seen {id}` | The id is one of the Guide's tips. Adds it to the player's `tipsSeen`, so that nudge never shows again. |
| `pat {owner, slot}` | That pet exists in a house I'm in; one pat per 1.5 s. A guest's bond with the pet grows by `GUEST_BOND_STEP.pat` (a pet's own owner grows its `bond` by 1 instead), and the petter gets a `info` line about what the pet did. Saved and rebroadcast, so the bond sticks. |
| `feed {owner, r, index}` | The bowl is that room owner's `foodBowl` and they have pets. Anyone in the house may fill it. A guest who does bonds `GUEST_BOND_STEP.feed` with each of that owner's pets outside; their owner is told as before. |
| `fetch {owner, x, y}` | Whole tiles; one throw per 3 s. The thrower's pets run for it; if the pets belong to someone else, throwing the ball bonds `GUEST_BOND_STEP.fetch` with each of them. |
| `mute {thread, until}` | `thread` is the key the client shows (`h:<code>`, `g:<id>`, or a person's id for a private thread); a private one is stored as `d:<a>|<b>`. `until` is `-1` (back on), `0` (forever) or a timestamp at most a month ahead. Stored in that member's `threads.muted_until` and mirrored in `me.mutedThreads`; it never reaches the other side. Answered to the asker with `mute {thread, until}`, so their bell settles on what was kept. It also decides whether a message to a player who is away is pushed to their devices. |
| `read {thread, id}` | `thread` uses the same client-side keys as `mute`. Relayed to the other members (`read {id, by, at}`) and stored as `threads.seen` for that member, so unread counts survive a reload. The write is coalesced: the newest id per thread is held for 2 s and written once, so scrolling a thread does not mean one UPDATE per line. |

## State sent to clients

`{ t: 'state', house: { code, members[], todos[], chat[], watch }, me: { id, coins, inventory, sessions, subjects, dm, groups, mutedThreads, threadSeen, chatThemes, watch } }`

`house.chat`, `me.dm` (`{ [peerId]: message[] }`) and `me.groups[gid].msgs` are built from the archive-backed cache, not from a saved row; the client sees the same shapes as before. `me.mutedThreads` comes from `threads.muted_until`, `me.threadSeen` from `threads.seen` (thread → newest id that member has read, from the rows loaded when they connected), and `me.sessions` from the session log — the last 90 days in detail, plus one entry per earlier day and subject carrying `n`, how many sessions it stands for. `me.chatThemes` is read from the `chat_themes` table at boot and no longer written into the player row.

- `members[]` holds each housemate's public data: name, look, room, focus, pets, online, position. It never includes tokens or hashes.
- `members` is built per recipient: each pet carries `myBond` (only the viewer's own hidden bond with it, for guests) and `fav` (the guest it likes most). Raw `visitorBonds` never leaves the server, so a bond only shows as behaviour: the pet seeking out the person it has bonded with.
- `me` is private and only goes to its owner. That includes `crafted`, `ready` and `tipsSeen`: what you made by hand, which waits are yours, and which Guide nudges you have had. A wait never rides in `publicPlayer`, because it belongs to a person rather than to a piece.
- `house.watch` is the active house-wide watch party (or `null`). `me.watch` is the active private watch party for that player (DM or group, or `null`), so users can watch together even when they are in different houses. The client prefers `me.watch` when both are present. Private/group watch state is not saved; a restarted server ends watch parties.

## The Guide's tour

The Guide's words live in `shared/guide.js`, which both sides import. `GUIDE_SECTIONS` is the panel's content, `GUIDE_TIPS` is one line per item worth a step, `GUIDE_START` is the opening card, and `tourSteps` / `unseenTips` build the tour from what a player actually owns.

When a `state` message arrives and the client sees an item it owns that is in `GUIDE_TIPS` but not in `me.tipsSeen`, it opens the tour on those steps and sends `tip_seen` for each of them. The server adds the id to `tipsSeen` and saves. `tip_seen` saves without broadcasting, the same as `inbox_read`, so the client marks the tip as seen locally too — otherwise a broadcast arriving before the next `state` would open it twice.

The tour replaces the per-item toasts, which had the failure this one is built to avoid: each toast marked its tip as seen before it was shown, so a player who owned ten of these things saw two and lost the other eight. Opening the tour is what consumes the tips, and it lists all of them at once, so nothing is ever marked seen without being on screen.

## Room snapshots (Object Storage)

1. In Decorate, the client crops its room out of the game canvas and turns it into a PNG.
2. `POST /api/snapshots` with `Authorization: Bearer <token>` and the PNG body (2 MB max; the PNG signature is checked).
3. The server uploads to bucket `assets` at `snapshots/<playerId>/<timestamp>.png`, keeps the newest 6 keys on the player (deleting older objects), and returns presigned GET URLs that expire after 1 hour.
4. `GET /api/snapshots` returns fresh presigned URLs. Only object keys are stored; URLs are made on each request.

## Chat pictures and files (Object Storage)

1. A picture is shrunk to 1024 px and re-encoded as JPEG in the browser (which drops camera metadata). A document (PDF, Word, PowerPoint, Excel, CSV, text) goes up as it is.
2. `POST /api/chatimg` with `Authorization: Bearer <token>` and the bytes. A document also sends its name in the `x-file-name` header. Limits: 1.5 MB per picture, 10 MB per document, 30 uploads an hour. The bytes must match the type (JPEG, PDF, zip or old Office header, or UTF-8 text).
3. The server stores it at `chat/<playerId>/<time>-<random>.jpg` or `…/<name>` and returns the key. The client sends that key with the chat message, DM or group message.
4. To show or open it, `GET /api/chatimg?key=…` returns a presigned URL that expires after 1 hour, but only if the key was sent in a conversation you can read.
5. Uploads never sent with a message are deleted after an hour. Sent ones are kept as long as a message carries them.

When the website and server are on different domains, the server's CORS reply must allow the `x-file-name` header, or the browser blocks every document upload ("Failed to fetch"). Pictures don't send it.

## Health and shutdown

`GET /api/health` answers `200 { "ok": true, "storage": "ok" }` when the database answers a trivial query, and `503 { "ok": false, "storage": "down" }` when it does not (the check gives up after 2 s). It is the readiness probe a host should poll: a process whose database is unreachable is not ready to take traffic, even though its event loop is fine.

On `SIGTERM` or `SIGINT` the server stops taking connections, closes every socket, waits for the pending save and closes the pool, then exits; if any of that takes longer than 10 s it exits anyway. A deploy or restart therefore does not drop the last half second of changes, which is exactly the window a save is scheduled for.

## Deleting an account

`POST /api/account/delete { token, password }` checks the password and then removes the player's rows from every table that holds them: `players` and the house they own, `accounts`, `auth`, their `friends` pairs, `threads` and `chat_themes`, the `sessions` log and `session_days` roll-up, and the `messages` they sent. The token stops working at once because its row is gone.

## Persistence

```
in-memory db ──(0.5 s after a change)──▶ saveAll() ──▶ Postgres: players(id, data jsonb), houses(code, data jsonb)
accounts(player_id, username, pass)   auth(token_hash, player_id, expires)   ← written directly by the API
messages(thread, id)   threads(player_id, thread)   friends(a, b)   chat_themes(player_id, thread, color)
sessions(player_id, at)   session_days(player_id, day, tag)   ← the study log, and what it rolls up into
```

Saves run one at a time, so an older snapshot of the world can never overwrite a newer one. Each row is compared against a fingerprint of what was last written, so a save sends only the rows that changed.

`threads` is the list the chat panel is built from: one row per member per conversation, holding the newest message and that member's `seen`/`muted_until`. Every message also writes one of those rows for each person who can see it, so a conversation moves to the top of everyone's list without rewriting a player row. The text itself is written once, to `messages`, and paged from there by `history`; a reply quotes a message by looking it up in that table.

**Chat is not part of the world.** A player row keeps its rooms, pets, inventory and settings but no conversations, and a house row keeps its owner, members and to-dos but no chat. When a player connects, the server reads their thread list (`threadsFor`) and the last 50 lines of each of those threads plus their house's chat (`tails`) — two queries — and keeps those lines in memory. `state` builds `house.chat`, `me.dm` and `me.groups[].msgs` from that cache, so the client sees exactly the shapes it always did. The cache is filled lazily for a house or thread nothing has loaded yet, and the next broadcast shows it. On boot the list is seeded from the chat that older rows still carry (`seedThreads`), so a database from before this change starts with its conversations intact; the rows are then cleaned, and `seedThreads` finds nothing to do on later boots.

**Study sessions are a log too.** A finished or ended-early session appends one row to `sessions` (when, how long, which subject, whether it ended early) and is never updated; the player row keeps only `totalMinutes`. The stats panel is sent the last 90 days in detail plus one entry per earlier day and subject from `session_days`, each carrying `n`, how many sessions it stands for. The leaderboard asks the store for minutes per player over the last week or all time, summed across both tables. Anything older than the window folds into `session_days` — one row per player, day and subject — at boot and every six hours, so the detail table stays at about a term while totals, streaks, subject splits and the year chart stay right. Rolled-up days are UTC days, and per-hour detail is only kept inside the window.

**The archive is pruned, not kept forever.** Once a day `messages` rows older than two years are deleted, together with the pictures and files they carried (their keys are read first and removed from the bucket). The upload sweeper covers the other direction: an upload that was never sent is deleted an hour later.

Message ids must never repeat, because the archive inserts with `on conflict do nothing` and history is paged by `id < before`. The server's counter therefore starts at `max(id) + 1` from the `messages` table, so a restart resumes after the newest message instead of going back to `Date.now()`; Postgres can also issue an id itself (`generated by default as identity`), which is what a second process would use.

The shape of all of that lives in `server/schema.js` and nowhere else. It is rendered for whichever store is in use (SQLite locally and in tests, Postgres in production) and applied as numbered migrations; `schema_migrations(version, applied_at)` records what a database has had, so a new column or table is a new migration rather than a difference between the two stores. `npm test` runs `server/store.conformance.test.js` against SQLite, and against Postgres too when `TEST_DATABASE_URL` is set — that suite is what keeps the two stores honest about the same interface.
