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
| **Singing is visual only** | The game is a quiet study companion; mic/karaoke sound would fight whatever the player is actually listening to, and a singer's own music lives outside the game. No audio, no new field: `use` already rides on `pos`. | Real karaoke playback (then it becomes an opt-in audio feature, not a pose). |
| **Naps are local, waking is shared** | Where a pet is dozing and how long its sunbath lasts live in the client (`petSeat`, `petSunAt`), like the rest of its wandering. The one thing that must agree is being woken: a `pat` is already broadcast to the house, so clearing the nap there wakes the pet on every screen without a new message. Every nap also has an end time (`until`), so nothing depends on somebody clicking: a pet gets up on its own after four to eight minutes on a chair, or after a sunbath's twenty to forty-five seconds. | Two people watching a chair pet disagree about the exact second it got up (then send a wake message and a timer). |
| **Pets react to people from their own local state** | `myBond` and `fav` are the only bond facts a client gets, and the visiting, hanging out, tricks and toasts are all decided in the render loop from them plus positions and the clock. The pet never needs a server-side simulation to look alive, and no bond number is ever exposed. | Each client could disagree about a guest's own visits (then drive them from a server-sent schedule). |
| **Duet and pet reactions are client-side checks** | Where a second mic sits and whether a pet is near enough are both derivable from the room and the clock, like pet wandering. Adding a server field would put a cosmetic on the wire and in the save file. | Pets should react to more than singing (then a small shared table of reactions). |
| **Retro karaoke is a record-player console, no 45 adapter** | The arched jukebox read as a face; the 45 adapter made the deck fussy at 16 px. A plain cream spindle and a chrome tonearm say “record player” with fewer pixels. | Higher-resolution furniture art. |
| **Expensive pets (300–2,000 coins)** | At 1 coin per focused minute, a pet takes real study time to earn. | Players feel the gap is too big (add cheaper pets or coin bonuses). |
| **Neighbours share a wall that opens up** | Side-by-side rooms feel like one big home; posts, pillar and a floor seam keep each room recognisable. | Freeform house building. |
| **Turn = mirror flip, not 90° rotation** | Works for every item without drawing each piece from four sides. | Specific items get proper side views. |
| **Two-tap "give up" instead of `confirm()`** | Some browsers and app shells block native dialogs. | — |
| **Fredoka for UI, pixel digits only for the timer** | Pixel fonts made numbers hard to read (5 looked like S). | — |
| **A Guide panel, not more tooltips** | The hover tooltip already names the click; what people miss is the consequence. A tooltip that ran to two sentences would be in the way every time. | Players stop opening the Guide (then surface the two or three lines that matter in the panels themselves). |
| **One nudge per item, remembered per player** | A nudge you have already had is noise. `tipsSeen` is a plain list on the player, and the server is the one that decides which ids are legal. | Players change devices often (then sync it, which `tipsSeen` already does, since it rides in `me`). |
| **Announcements in the bell** | One place for what happened while you were away, and the bell already counted unread things. Posting moved with it, which also fixed a Delete button that never rendered. | Announcements grow long or need editing (then they become their own panel). |
| **Chat thread buttons are rewritten only when what they say changes** | The chat card re-renders twice a second. Replacing the header's markup on every tick put a fresh button under the pointer between mousedown and mouseup, so the browser dropped the click and Unfriend / Leave group did nothing. Writing the same HTML is never needed, and keeping the exact nodes is what makes the click land. | — |

## Known limits

- Pets walk straight between tiles and can pass over furniture.
- All rooms in a house are saved together on each change; fine at friend scale.
- Login uses usernames only: no email, so no password reset yet.
- The game server must stay running (WebSockets), so it needs a host for long-lived processes (Render, Fly.io, Railway, a VPS), not short serverless functions.
