# Lazy player loading

## Why

Boot reads every `players` row in full: `select id, data from players`, then `JSON.parse` of each.
The world is authoritative and in memory, so this was the simple thing to do, and it is still the
biggest fixed cost of a restart and the biggest fixed allocation of the process. A player who has not
signed in for a year still occupies a full object — rooms, furniture, pets, inventory, settings —
and is parsed on every boot.

Chat and study sessions have already left the row, so a player row is now small and static. That makes
hydrating on demand cheap enough to be worth it: what a request needs is one player, or one house's
members, not the whole population.

## What "lazy" means here

- **Boot loads a stub per player**: `{ id, name, house, home, __stub: true }`, from
  `select id, data->>'name', data->>'house', data->>'home' from players` (SQLite: `json_extract`).
  Houses still load in full: a house row is to-dos and membership and is needed to route anything.
- **Hydration** replaces the stub with the full row, in place, so every closure holding
  `db.players[id]` keeps working:
  - the player who connects (`hello`), before their state is built;
  - every member of their house, because `state.house.members` renders rooms, looks, pets and focus;
  - the player's friends, because the friends list draws their avatar (`look`) and shows focus;
  - the owner of the house being broadcast, if `ownerName` is needed and they are not a member.
- **Hydration is idempotent and awaited** before any state is built, so a partially hydrated member
  is never rendered.

## The rule that keeps data safe

`changedRows()` is the only thing that writes a player row, and it must never see a stub:

```js
for (const p of Object.values(db.players)) {
  if (p.__stub) continue;            // not loaded, not dirty: writing it back would erase it
  ...
}
```

The same guard applies to anything that mutates every player at boot or on a timer:
`syncCoins` (skip stubs; a hand-edited coin is picked up when the player hydrates), the legacy
row-cleaning passes (already skip absent fields), and the roll-up/reconcile passes (they read tables,
not rows).

Deleting an account removes the stub too, and `deleteAccount` in the store still works on the row.

## Where the stubs leak out, and what to do

| Reader | Needs | Fix |
| --- | --- | --- |
| `publicPlayer` (house state) | full row | house is hydrated on connect |
| `friendList` | `name`, `look`, `focus`, `presence` | friends hydrated on connect |
| leaderboard `all` scope | `name`, minutes from tables | name is on the stub |
| `houseLists` | owner name, online count | name is on the stub |
| `gift` / `dm` to a friend in another house | full row for the peer | that peer is a friend: hydrated |
| boot clean-up passes | fields that may not exist | already optional-chained |

Anything new that walks `Object.values(db.players)` must decide whether it needs a full row. A stub is
a signal, not an error: reading a missing field yields `undefined`, as it always did for an old save.

## Tests

1. **Store conformance**: `stubs()` returns one entry per player with `id`/`name`/`house`; `player(id)`
   returns the full row; both stores agree.
2. **A save after a lazy boot writes nothing**: boot with stubs, `saveAll()`, then assert every player
   row in the database still has its original JSON (this is the data-loss test that matters).
3. **A connect hydrates exactly what the state needs**: two houses, sign in to one; the other house's
   players stay stubs, and the state is complete.
4. **End to end**: `scripts/e2e-chat.js` and `scripts/e2e-sessions.js` unchanged and passing — they
   already sign up, join, buy, place, chat and read the leaderboard.
5. **A background pass never writes a stub**: after `syncCoins`, `rollUpSessions` and the prune, the
   database still has every player row.

## Rollout

Ship behind `LAZY_PLAYERS=1` for one release: the boot path builds stubs, and every hydration point is
a no-op when the flag is off. Measure boot time and heap after the first restart, then make it the
default and delete the flag.

## Not in scope

- Evicting idle players (a second, separate idea: hydration without eviction still grows with the
  number of people who sign in, just not with the number of accounts).
- Streaming or paging the player table.
