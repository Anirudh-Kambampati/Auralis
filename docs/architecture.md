# Architecture

Auralis is one Node.js server plus a browser client. The server owns the truth; the client draws it and sends player intents.

```
 Browser (phone or desktop)                     Node.js server (server/index.js)              Neon
 ┌───────────────────────────┐   HTTPS /api   ┌──────────────────────────────┐   pg pool   ┌──────────────────┐
 │ index.html + src/*.ts      │ ─────────────▶ │ accounts: signup/login/logout │ ──────────▶ │ Postgres          │
 │  landing page + login      │                │ snapshots: upload/list (PNG)  │             │  players, houses, │
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
| `server/index.js` | HTTP server (static files + JSON API) and the WebSocket game server. Validates every action. |
| `server/store.js` | Local SQLite storage (Node's built-in `node:sqlite`) and password hashing. Used when there's no `DATABASE_URL`. |
| `server/store-pg.js` | The same storage interface on Postgres (Neon), async. |
| `server/files.js` | Neon Object Storage through the Files SDK (`files-sdk/neon`), bucket `assets`. |
| `src/main.ts` | Client: networking, camera, input, game loop, panels, landing page, accounts. |
| `src/draw.ts` | All pixel art, drawn in code: characters, furniture, tiles, icons, the blocky timer font. |
| `src/pets.ts` | Pet sprites and their deterministic wandering. |
| `neon.ts` | Neon infrastructure-as-code: declares the `assets` bucket. `neon deploy` applies it. |

## Runtime model

- **The server is authoritative.** The client never changes coins, furniture or anything else locally. It sends an intent (`buy`, `move`, `focus_done`…), the server checks it against the shared rules, updates its in-memory world and broadcasts the new house state.
- **The world lives in memory and is persisted.** On start the server loads every player and house into a `db` object. Changes are saved half a second after they happen, each player and house as one JSON row (JSONB in Postgres).
- **One house is the unit of sync.** Each player belongs to exactly one house. Any change rebroadcasts that house's full state to its online members. Only character movement uses small `pos` messages.
- **Shared code keeps both sides honest.** `shared/game.js` runs in the browser (for previews, ghosts and pathfinding) and on the server (to validate), so they never disagree about what fits where.

## Deployment shape

- `npm run build` produces `dist/`. `npm start` serves `dist/`, the `/api/*` routes and the `/ws` WebSocket from one process on `PORT`.
- Environment comes from `.env` and `.env.local`: `DATABASE_URL` and the `AWS_*` storage variables, which `neon deploy` pulls.
- The server keeps open WebSockets, so it needs a host that runs a long-lived Node process. Serverless platforms with short request lifetimes don't fit.
