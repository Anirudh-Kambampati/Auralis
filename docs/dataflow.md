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
| `join`, `leave` | The house code exists. Moving out takes your room with you into a new house. |
| `leaderboard` | Answered to the asker only, computed from saved sessions. |

## State sent to clients

`{ t: 'state', house: { code, members[], todos[], chat[] }, me: { id, coins, inventory, sessions, subjects } }`

- `members[]` holds each housemate's public data: name, look, room, focus, pets, online, position. It never includes tokens or hashes.
- `me` is private and only goes to its owner.

## Room snapshots (Object Storage)

1. In Decorate, the client crops its room out of the game canvas and turns it into a PNG.
2. `POST /api/snapshots` with `Authorization: Bearer <token>` and the PNG body (2 MB max; the PNG signature is checked).
3. The server uploads to bucket `assets` at `snapshots/<playerId>/<timestamp>.png`, keeps the newest 6 keys on the player (deleting older objects), and returns presigned GET URLs that expire after 1 hour.
4. `GET /api/snapshots` returns fresh presigned URLs. Only object keys are stored; URLs are made on each request.

## Persistence

```
in-memory db ──(0.5 s after a change)──▶ saveAll() ──▶ Postgres: players(id, data jsonb), houses(code, data jsonb)
accounts(player_id, username, pass)   auth(token_hash, player_id, expires)   ← written directly by the API
```

Saves run one at a time, so an older snapshot of the world can never overwrite a newer one.
