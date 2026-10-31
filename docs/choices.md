# Choices

Decisions made while building Auralis, and why.

| Choice | Why | Revisit when |
| --- | --- | --- |
| **One Node server for static files, API and WebSocket** | Simplest thing that runs anywhere a Node process can. No extra services to deploy. | Traffic needs horizontal scaling (then share house state through Postgres or a pub/sub). |
| **Server-authoritative game, client sends intents** | Coins and furniture can't be faked from the browser; every rule is checked in one place. | Never; keep it. |
| **Rules in `shared/*.js`, used by both sides** | One source of truth for layout, placement and stats; the client can preview exactly what the server will accept. | — |
| **Canvas with art drawn in code** | No asset pipeline, every sprite is recolourable, and everything is original. | Hiring an artist (sprites can move to sheets without changing game logic). |
| **Whole-number scaling, smoothing off** | Pixel art stays crisp on every screen. | — |
| **World in memory, saved as JSON rows** | Fast reads; a small, readable schema; easy to evolve (new fields need no migration). | Hundreds of active players (then save only changed rows, or normalise hot data such as sessions). |
| **Neon Postgres in production, SQLite locally** | Neon survives host restarts and branches for previews; SQLite keeps local development and tests offline and dependency-free. | — |
| **`pg` connection pool on the pooled `DATABASE_URL`** | Neon's recommendation for a long-running Node server; TLS is pinned to `verify-full`. | Moving to serverless functions (then the Neon serverless driver). |
| **Own accounts: username + scrypt + hashed tokens** | Small, no third-party dependency, and fixes the "anyone with your ID is you" problem. | You want password reset, email, "Sign in with Google" or MFA — then Neon Auth (Managed Better Auth). |
| **Public player id separate from the secret token** | Housemates see your id in house state; it must not be a credential. | — |
| **Neon Object Storage via the Files SDK** | Recommended by Neon; branches with the database; the code isn't tied to one storage provider. | — |
| **Snapshots private, shared via 1-hour presigned URLs** | Nothing is public by default; links can be shared without exposing credentials. | Snapshots become public profile images (then `public_read` plus a CDN). |
| **Pets wander deterministically** | Every viewer sees the same pet in the same spot with zero network traffic. | Pets need to react to players (then simulate on the server). |
| **Expensive pets (300–2,000 coins)** | At 1 coin per focused minute, a pet takes real study time to earn. | Players feel the gap is too big (add cheaper pets or coin bonuses). |
| **Neighbours share a wall that opens up** | Side-by-side rooms feel like one big home; posts, pillar and a floor seam keep each room recognisable. | Freeform house building. |
| **Turn = mirror flip, not 90° rotation** | Works for every item without drawing each piece from four sides. | Specific items get proper side views. |
| **Two-tap "give up" instead of `confirm()`** | Some browsers and app shells block native dialogs. | — |
| **Fredoka for UI, pixel digits only for the timer** | Pixel fonts made numbers hard to read (5 looked like S). | — |

## Known limits

- Pets walk straight between tiles and can pass over furniture.
- All rooms in a house are saved together on each change; fine at friend scale.
- Login uses usernames only: no email, so no password reset yet.
- The game server must stay running (WebSockets), so it needs a host for long-lived processes (Render, Fly.io, Railway, a VPS), not short serverless functions.
