# Execution plan: drinks, claw machine, crafting

Approved spec: `docs/superpowers/specs/2026-11-15-drinks-claw-crafting-design.md`

## Decisions

- **Parameters confirmed (defaults):** 1 extra coin per caffeinated minute; claw costs 5 coins with a 30 minute cooldown; crafting has a 20 minute cooldown; claw weights sum to 100.
- **Execution:** subagent-driven. One subagent per task, each implementing and verifying its own task, then committing. The orchestrator reviews the diff before the next task starts.

## Task order

Tasks are ordered so that each plan's prerequisites land first. `shared/game.js` and `shared/types.ts` are edited by every plan, so the plans run sequentially rather than in parallel.

| # | Plan | Tasks | Why here |
|---|------|-------|----------|
| 1 | `2026-11-15-drinks-and-caffeine.md` | 1–3 | Adds `Furniture.state`, `Member.caffeineSince/caffeineUntil`, the shared caffeine helpers, `brew`, and the focus payout overlap. Everything downstream depends on `Furniture.state`. |
| 2 | `2026-11-15-claw-machine.md` | 1–3 | Adds `clawPrize`, `clawReadyAt`, the `claw` message, and the weighted draw. Depends on `Furniture.state` from plan 1. |
| 3 | `2026-11-15-crafting-and-gifting.md` | 1–5 | Adds craft pools, the `crafted` list on the player, the `craft`/`gift_crafted` messages, `place` with `crafted: true`, and the client. Depends on `clawReadyAt` from plan 2 for the cooldown check. |

## Per-task loop

Each subagent is given the plan file, the task number, and the current repo state. It must:

1. Read the task's "Files", "Interfaces" and steps before editing.
2. Implement exactly that task, nothing more.
3. Run `npm test` and `npm run build` (`tsc --noEmit && vite build`) and make both pass.
4. Commit with a message naming the task.
5. Report the commit hash and any deviation from the plan.

The orchestrator does not batch tasks: a task whose verification fails is fixed before the next one starts, and a deviation from the plan is resolved rather than papered over.

## Verification per plan

- `npm test` — 40 tests before this work; grows with each task's tests.
- `npm run build` — must stay clean (`tsc --noEmit` plus the Vite build).

## Known dependencies between plans

- `Furniture.state?: { readyAt?: number }` is introduced in the drinks plan and reused by claw and crafting.
- `clawReadyAt(f, now)` is introduced in the claw plan and reused by the craft cooldown check.
- If the claw plan is deferred, the crafting plan inlines the same three lines instead.

## Risks

- **Shared-file contention.** `shared/game.js` and `shared/types.ts` are touched by all three plans. Sequential execution is the mitigation; parallel subagents on these files would conflict.
- **Line anchors drift.** The plans cite `file:line` anchors. They were verified against `HEAD` at commit time; subagents should locate by symbol name if an anchor has moved.
- **`has()` guard coverage.** Every new message case must be reachable through the `has()` check at `server/index.js:241` and listed in the index guard where it applies (`gift_crafted` is deliberately excluded, as its handler validates its own index).
- **Client/server field agreement.** `crafted` is private and sent only in `me`, never `publicPlayer`. Subagents must not add it to the public payload.