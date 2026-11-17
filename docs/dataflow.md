# Data flow

## Signing up and logging in

1. The landing page posts `{ username, password }` to `/api/signup` or `/api/login`.
2. On sign-up, the server checks the username (3–20 of `A–Z a–z 0–9 _ . -`, unique regardless of case) and the password (at least 8 characters). It stores a scrypt hash with a random salt, never the password itself.
3. The server creates a random 32-byte token, stores only its SHA-256 hash with a 30-day expiry, and returns the token.
4. The browser keeps the token in `localStorage` (`auralis.token`) and opens the WebSocket.
5. The first WebSocket message is `{ t: 'hello', token }`. The server looks the token up and attaches the socket to that player. A bad or expired token gets `{ t: 'auth', ok: false }`, and the client returns to the landing page.

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

| Intent | Server checks |
| --- | --- |
| `pos {x,y}` | Relays to housemates only. Not saved; no full broadcast. |
| `focus_start {minutes, tag}` | Allowed lengths only, not already focusing. |
| `focus_done` | The session's end time has passed. Awards coins (+25% if a housemate is studying) and records `{at, minutes, tag}`. |
| `buy`, `adopt`, `expand` | Enough coins; pet cap of 4; room level limit. |
| `place`, `move` | The item is in your storage; `canPlace` (inside your room, no overlap). |
| `flip`, `restyle`, `room` | The furniture exists; colours and patterns come from the allowed lists. |
| `todo_*`, `chat` | Text cleaned and length-capped; chat flood guard (one message per 0.6 s). |
| `watch {url, to?, g?}` | URL must pass `parseVideo`. House chat (no `to`/`g`) starts/ends the house watch party for everyone in that house. In a DM (`to`, must be a housemate or friend) starts/ends a private watch party for just those two users, even in different houses. In a group chat (`g`) starts/ends a watch party for all group members, even in different houses. `watchCtl` syncs play/pause/seek for the matching party. |
| `join`, `leave` | The house code exists. Moving out takes your room with you into a new house. |
| `leaderboard` | Answered to the asker only, computed from saved sessions. |
| `friend_search {q}` | At least 2 characters. Answered to the asker only with `friend_matches`: up to 8 usernames starting with `q`, never your own. |
| `friend_request {name}` | A username, a housemate's name, or a house code (its owner); at most 20 requests waiting. |
| `tip_seen {id}` | The id is one of the Guide's tips. Adds it to the player's `tipsSeen`, so that nudge never shows again. |
| `pat {owner, slot}` | That pet exists in a house I'm in; one pat per 1.5 s. A guest's bond with the pet grows by `GUEST_BOND_STEP.pat` (a pet's own owner grows its `bond` by 1 instead), and the petter gets a `info` line about what the pet did. Saved and rebroadcast, so the bond sticks. |
| `feed {owner, r, index}` | The bowl is that room owner's `foodBowl` and they have pets. Anyone in the house may fill it. A guest who does bonds `GUEST_BOND_STEP.feed` with each of that owner's pets outside; their owner is told as before. |
| `fetch {owner, x, y}` | Whole tiles; one throw per 3 s. The thrower's pets run for it; if the pets belong to someone else, throwing the ball bonds `GUEST_BOND_STEP.fetch` with each of them. |
| `mute {thread, until}` | `thread` is a thread key (`h:<code>`, `g:<id>` or a friend's id). `until` is `-1` (back on), `0` (forever) or a timestamp at most a month ahead. Saved per player in `me.mutedThreads`; it never reaches the other side. Answered to the asker with `mute {thread, until}`, so their bell settles on what was kept. |

## State sent to clients

`{ t: 'state', house: { code, members[], todos[], chat[], watch }, me: { id, coins, inventory, sessions, subjects, watch } }`

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

## Persistence

```
in-memory db ──(0.5 s after a change)──▶ saveAll() ──▶ Postgres: players(id, data jsonb), houses(code, data jsonb)
accounts(player_id, username, pass)   auth(token_hash, player_id, expires)   ← written directly by the API
```

Saves run one at a time, so an older snapshot of the world can never overwrite a newer one.
