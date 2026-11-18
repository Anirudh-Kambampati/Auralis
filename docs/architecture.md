# Architecture

Auralis is one Node.js server plus a browser client. The server owns the truth; the client draws it and sends player intents.

```
 Browser (phone or desktop)                     Node.js server (server/index.js)              Neon
 ┌───────────────────────────┐   HTTPS /api   ┌──────────────────────────────┐   pg pool   ┌──────────────────┐
 │ index.html + src/*.ts      │ ─────────────▶ │ accounts: signup/login/logout │ ──────────▶ │ Postgres          │
 │  landing page + login      │                │ snapshots + chat files        │             │  players, houses, │
 │  canvas renderer (draw.ts) │   WebSocket    │ game: rooms, focus, shop,     │             │  accounts, auth   │
 │  game loop + UI (main.ts)  │ ◀────────────▶ │  pets, to-dos, chat           │  Files SDK  ├──────────────────┤
 │  pets.ts, shared/*.js      │      /ws       │ in-memory world (db object)   │ ──────────▶ │ Object Storage    │
 └───────────────────────────┘                └──────────────────────────────┘             │  bucket "assets"  │
                                                                                            └──────────────────┘
```

## Pieces

| Path | Role |
| --- | --- |
| `shared/game.js` | Rules used by both sides: furniture catalog, colours, pets, room sizes, house layout (`buildGrid`), placement checks, rewards. |
| `shared/stats.js` | Study statistics: bucketing sessions by day/week/month/year, streaks, subject totals. |
| `shared/guide.js` | The Guide's words: the panel's sections, the one-time nudges, and the five steps the first visit used to show. Both sides import it, so the server knows which ids a nudge may name. |
| `server/index.js` | HTTP server (static files + JSON API) and the WebSocket game server. Validates every action. |
| `server/handlers.js` | The focus and chat message handlers, split out of the `handle()` switch. Each domain is a plain object of methods called with one context object (store, db, sockets, helpers, and the per-message `p`/`m`/`room`); the switch keeps its guards, its default and its save/broadcast tail. |
| `server/chat-cache.js` | The in-memory chat cache: the last 50 lines of each loaded thread, the per-player conversation list, and the mute map. Owns the tails and the state views; takes `store` and an injected `refreshThread` so it stays free of game-server deps. |
| `server/schema.js` | The one schema. Every table and index is described once and rendered for SQLite and Postgres, applied through numbered migrations recorded in `schema_migrations`. |
| `server/store.js` | Local SQLite storage (Node's built-in `node:sqlite`) and password hashing. Used when there's no `DATABASE_URL`. |
| `server/store-pg.js` | The same storage interface on Postgres (Neon), async. |
| `server/files.js` | Neon Object Storage through the Files SDK (`files-sdk/neon`), bucket `assets`. |
| `src/main.ts` | Client: networking, camera, input, game loop, panels, landing page, accounts. |
| `src/draw.ts` | All pixel art, drawn in code: characters, furniture, tiles, icons, the blocky timer font. |
| `src/pets.ts` | Pet sprites and their deterministic wandering. |
| `neon.ts` | Neon infrastructure-as-code: declares the `assets` bucket. `neon deploy` applies it. |

## Runtime model

- **The server is authoritative.** The client never changes coins, furniture or anything else locally. It sends an intent (`buy`, `move`, `focus_done`…), the server checks it against the shared rules, updates its in-memory world and broadcasts the new house state.
- **The world lives in memory and is persisted.** On start the server loads every player and house into a `db` object. Changes are saved half a second after they happen, each player and house as one JSON row (JSONB in Postgres). `threads` holds each member's conversation list — the newest message, what they have read, what they muted — and `messages` holds the text itself. Study sessions are the other thing that grows with time: every finished or ended-early session is appended to `sessions` (never updated), and anything older than 90 days folds into `session_days` — one row per player, day and subject — so a player row holds a total, not a history, and the stats panel and leaderboard read from the tables. Chat is likewise **not** part of the world: a player or house row carries no conversation, and the server keeps only the last 50 lines of the threads a connected player can see, loaded from the archive when they connect and dropped when it falls out of the cache.
- **A save writes only what changed, and never keeps a second copy of the world.** Each row is compared against a short fingerprint of the JSON last written, so the in-memory world stays the only full copy of it. The diff is streamed into Postgres in chunks of 40 rows inside one transaction, and fingerprints are recorded only after the commit, so a failed save simply writes those rows again. While the database is unreachable the server stops trying for 30 seconds instead of stacking saves in memory, and the pool gives up on a connect after 15 s instead of hanging for a minute.
- **Dead sockets are cleaned up, not written to.** Every socket is pinged every 30 seconds and one that has not answered is ended (a phone that changed network otherwise looks open forever). A socket whose unread send buffer passes 2 MB is dropped as well, so a client that stopped reading cannot hold a house's broadcasts in memory.
- **A connection has a message budget.** 40 messages in a burst, then 8 a second; over that the message is dropped and the client is told, rather than the socket closed. The per-intent cooldowns (chat, pats, cheers) are separate and still apply.
- **The process can be stopped.** `SIGTERM`/`SIGINT` stop new connections, close the sockets, flush the pending save and close the storage, with a 10 s cap. `/api/health` checks the database (2 s timeout) and answers 503 when it is unreachable, so a host can use it as a readiness probe instead of a liveness one.
- **One schema, two stores.** `server/schema.js` describes every table once and renders it for SQLite (local, tests) and for Postgres (production); `schema_migrations` records which numbered migrations a database has had. Neither store writes DDL of its own any more, so the two cannot drift into different shapes. `server/store.conformance.test.js` runs the interface both stores promise against SQLite always, and against Postgres when `TEST_DATABASE_URL` points at a test branch.
- **One house is the unit of sync.** Each player belongs to exactly one house. Any change rebroadcasts that house's full state to its online members. Only character movement uses small `pos` messages.
- **Shared code keeps both sides honest.** `shared/game.js` runs in the browser (for previews, ghosts and pathfinding) and on the server (to validate), so they never disagree about what fits where.
- **The handler context is tested, not trusted.** `server/handlers.test.js` reads `server/handlers.js` and fails if a handler mentions a name the context does not provide, or assigns to one. Splitting `handle()` into modules is otherwise silent until the first player sends that message: nothing in the build or the unit tests evaluates a handler body.
- **What grows with time is pruned.** `messages` older than two years are deleted once a day, together with the files they carried; the upload sweeper deletes an upload that was never sent. The archive is a product feature, not an obligation to keep every byte forever.

## Tests and CI

`npm test` runs the unit suites (`shared/*.test.js`), the two store tests (the SQLite one, and the conformance suite that also runs against Postgres when `TEST_DATABASE_URL` names a test branch), the handler-context suite and the chat-cache suite. `.github/workflows/test.yml` runs all of it with a Postgres service, builds the client, and then runs the two end-to-end harnesses against a throwaway server: `scripts/e2e-chat.js` (a house line, a DM, a read receipt, history, a mute and a read mark surviving a reconnect, and account deletion) and `scripts/e2e-sessions.js` (sessions written while the server is stopped come back in the panel and the leaderboard).

## Deployment shape

- `npm run build` produces `dist/`. `npm start` serves `dist/`, the `/api/*` routes and the `/ws` WebSocket from one process on `PORT`.
- Environment comes from `.env` and `.env.local`: `DATABASE_URL` and the `AWS_*` storage variables, which `neon deploy` pulls.
- The server keeps open WebSockets, so it needs a host that runs a long-lived Node process. Serverless platforms with short request lifetimes don't fit.
