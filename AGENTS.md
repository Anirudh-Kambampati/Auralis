# AGENTS.md

This file guides AI coding agents working on Auralis. It is intentionally short — the real
spec lives in `docs/`, and the code is the source of truth.

## Always keep the docs in sync

Every change to behaviour, rules, messages or data shapes must be reflected in the docs. The
docs are written for humans reading the code, so they are the first thing to update, and the
code follows them.

| What changed | Update first |
| --- | --- |
| A rule (rewards, placement, cooldowns, caps) | `docs/logic.md` and the matching spec in `docs/superpowers/specs/` |
| A message shape, a field on a player or house | `shared/types.ts` and `docs/dataflow.md` |
| A piece of the architecture or runtime model | `docs/architecture.md` |
| A visual or UI decision | `docs/design.md` |
| A rationale worth remembering | `docs/choices.md` |

After editing the docs, run the tests and the build:

```bash
npm test
npm run build
```

If either fails, the docs and the code are out of step — fix the code, not the docs.

## Project shape

- **Rules live in `shared/game.js`** and are used by both the server and the browser. Never
  fork a rule into one side.
- **`server/index.js`** owns the world. It validates every client message against `ITEMS` with
  the `has()` helper, updates the in-memory `db`, and broadcasts the house.
- **`shared/stats.js`** is study statistics only.
- **`src/main.ts`** and **`src/draw.ts`** are the client: networking, the game loop, the panels
  and all the pixel art.
- **`server/schema.js`** is the one schema. Tables and indexes are described there once, rendered for SQLite and Postgres, and applied as numbered migrations. Never write DDL in a store.
- **Tests** are `node --test` suites in `shared/*.test.js`, `server/store.test.js`, `server/store.conformance.test.js`, `server/handlers.test.js` and `scripts/e2e-*.js`. `npm test` runs the unit tests; the conformance suite also runs against Postgres when `TEST_DATABASE_URL` names a test branch.

## Conventions

- Plain ES modules, no build step for the shared code. TypeScript for the client only.
- A colour is a six-digit hex string, matching the `/^#[0-9a-fA-F]{6}$/` check.
- `crafted` is private to its owner: it rides in `me`, never in `publicPlayer`.
- Server validates every client message. The client is a fast preview, not a source of truth.