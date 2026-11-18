# Performance Optimization Implementation Plan

## Phase 1: Quick Wins (Week 1-2)

### 1.1 Client-Side Position Throttling
**File**: `src/main.ts`
- Add `posThrottle` timer (100ms = 10Hz)
- Queue latest position, send on interval
- Only send if position changed >0.1 tiles
- **Test**: Verify smooth movement, measure msg rate

### 1.2 Delta Position Encoding
**Files**: `src/main.ts`, `src/net.ts`, `server/ws/router.js`
- Client sends `{t:'pos', dx, dy, use?}` relative to last ack
- Server reconstructs absolute, broadcasts delta to others
- Fallback to full pos on desync detection
- **Test**: Compare bandwidth, verify no drift

### 1.3 Server Broadcast Batching
**File**: `server/ws/router.js`
- Add `broadcastQueue: Map<houseCode, Message[]>`
- `flushBroadcasts()` on `setInterval(5ms)` or `setImmediate`
- Merge duplicate `pos` for same sender in window
- **Test**: Measure CPU under load, verify ordering

### 1.4 Incremental Geometry Updates
**File**: `src/main.ts` (lines 205-269)
- Track `gridVersion` on server, send with `state`
- Client diffs: only rebuild changed rooms
- `buildGrid()` → `updateGrid(diff)` for furniture moves
- `petSpots`/`petSun`/`acts`/`petToys` per-room update
- **Test**: Furniture move latency <16ms

### 1.5 Typing Indicator Debounce
**File**: `src/main.ts` (chat input handler)
- 300ms debounce on `typing` send
- Cancel on blur/submit
- Server: ignore rapid toggles (<200ms)
- **Test**: Verify no missed "stop typing"

---

## Phase 2: Render Pipeline (Week 2-3)

### 2.1 Dirty Rect Tracking
**Files**: `src/main.ts`, `src/draw.ts`
- `dirtyRects: {x,y,w,h}[]` accumulated per frame
- `clearRect` only dirty regions (union for overlap)
- Layers: `background` (static), `furniture` (semi-static), `avatars` (dynamic), `effects` (transient)
- **Test**: Frame time with 1 avatar vs 10

### 2.2 Viewport Culling
**File**: `src/draw.ts` (draw functions)
- `onScreen(x, y, w, h)` check before every draw call
- Skip rooms entirely if `!rectIntersects(viewport, roomBounds)`
- Pass viewport to `drawFurniture`, `drawAvatar`, `drawPet`
- **Test**: 4-room house, camera in 1 room → 75% draw calls culled

### 2.3 Sprite Atlas / Texture Packing
**Files**: `src/draw.ts`, `src/pets.ts`
- Pack furniture sprites into single canvas (atlas)
- `drawImage(atlas, sx, sy, sw, sh, dx, dy, dw, dh)`
- Reduce `drawImage` calls from 200+ to ~10
- Pet sprites: pack coats into atlas per species
- **Test**: Draw call count, GPU time

### 2.4 Fixed Timestep Pet Planning
**Files**: `src/main.ts`, `src/petLogic.ts`
- `petAccumulator += dt`; run `planPets` at 30Hz (33ms)
- Interpolate pet positions for render (lerp between ticks)
- Decouples pet AI from render frame rate
- **Test**: Pet smoothness at 30/60/120fps

---

## Phase 3: Pet System Overhaul (Week 3-4)

### 3.1 Web Worker Pathfinding
**Files**: `src/petLogic.ts`, new `src/workers/pathfinder.ts`
- Move `bfs()`, `petRoute()` to worker
- `postMessage({type:'route', from, to, grid})`
- Worker returns `Float32Array` path coordinates
- Main thread: `petRoutes` becomes `SharedArrayBuffer` or serialized
- **Test**: Main thread time <1ms/frame for pets

### 3.2 Spatial Index for Pet Queries
**File**: `src/petLogic.ts`
- Quadtree or uniform grid for `present` avatars
- `queryRadius(x, y, r)` → nearby humans/pets in O(log n)
- Replaces O(n) scans in lines 159, 179, 183, 198, 202, 204, 207
- **Test**: Query time with 20 pets + 10 humans

### 3.3 Behavior Tree for Pet AI
**File**: `src/petLogic.ts` (replace `planPets`)
- Nodes: `Selector`, `Sequence`, `Action`, `Condition`
- Priorities: `Flee` > `Fetch` > `Follow` > `Sun` > `Seat` > `Play` > `Idle` > `Wander`
- Each pet ticks its own tree (parallelizable)
- Data-driven: JSON defines tree, easy to tune
- **Test**: Pet behavior parity, CPU profile

### 3.4 Predictive Position Interpolation
**Files**: `src/main.ts`, `src/petLogic.ts`
- Server sends pet positions at 5Hz (not every frame)
- Client interpolates with `lerp` + easing
- `petPos()` becomes prediction, corrected on server update
- Reduces `planPets` frequency need
- **Test**: Visual smoothness, correction magnitude

---

## Phase 4: Architecture (Week 4-5)

### 4.1 State Diff/Patch Protocol
**Files**: `server/ws/router.js`, `src/main.ts`, `src/net.ts`
- Server computes `diff = computeDiff(oldState, newState)`
- Sends `{t:'patch', ops:[{op:'set', path, value}, ...]}`
- Client applies via `json-patch` (RFC 6902)
- Full `state` only on join or version mismatch
- **Test**: Join time, bandwidth, correctness

### 4.2 Interest Management (Room-Based)
**Files**: `server/ws/router.js`, `server/state.js`
- Track `playerRoom[playerId] = roomIndex`
- `pos` broadcasts only to same-room + adjacent-room players
- `chat`, `typing`, `presence` remain house-wide
- Server maintains room membership on `pos` updates
- **Test**: 20 players, 4 rooms → 75% pos broadcast reduction

### 4.3 Web Worker Grid Operations
**Files**: New `src/workers/grid.ts`, `src/main.ts`
- Move `buildGrid`, `updateGrid`, `bfs`, `petSpots` calc to worker
- `SharedArrayBuffer` for grid data (if COOP/COEP headers)
- Main thread posts `gridUpdate` messages, receives patches
- **Test**: Main thread blocking <2ms on room change

### 4.4 Frame Budget Monitor + Adaptive Quality
**File**: `src/main.ts` (render loop)
- `performance.measure('frame')` each RAF
- Rolling average (60 frames): if >14ms, degrade:
  - Pet update rate: 30Hz → 15Hz
  - Shadow quality: off
  - Particle effects: off
  - Furniture detail: simplified
- Restore when <10ms for 5 seconds
- **Test**: Low-end device simulation (CPU throttle)

---

## Testing & Validation

### Performance Benchmarks
| Scenario | Metric | Target |
|----------|--------|--------|
| Idle (1 player, 1 room) | Frame time | <4ms |
| Busy (5 players, 4 rooms, 20 pets) | Frame time | <8ms |
| Furniture move | Main thread block | <16ms |
| Join (full sync) | Time to interactive | <2s |
| 30 min session | Memory growth | <20MB |
| Pos msg rate (5 players) | Msg/sec | <50 |

### Automated Tests
- `scripts/perf-benchmark.js` — Headless Chromium + Lighthouse CI
- `scripts/e2e-perf.spec.ts` — Playwright with CPU throttle
- Regression gate: fail if p99 frame time >16ms

### Profiling Checkpoints
- After Phase 1: `npm run perf:phase1`
- After Phase 2: `npm run perf:phase2`
- After Phase 3: `npm run perf:phase3`
- After Phase 4: `npm run perf:phase4`

---

## Rollback Plan

Each phase behind feature flag:
```ts
const PERF = {
  posThrottle: true,
  deltaPos: true,
  batchBroadcast: true,
  incrementalGrid: true,
  dirtyRects: false,
  viewportCull: false,
  spriteAtlas: false,
  fixedTimestepPets: false,
  workerPathfind: false,
  spatialIndex: false,
  behaviorTree: false,
  predictiveInterp: false,
  stateDiff: false,
  interestMgmt: false,
  workerGrid: false,
  adaptiveQuality: false,
};
```

Enable incrementally, monitor error rates, disable on regression.

---

## Dependencies

| Task | Blocks | Blocked By |
|------|--------|------------|
| 1.1 | 1.2, 1.3 | — |
| 1.2 | 4.1 | 1.1 |
| 1.3 | 4.2 | — |
| 1.4 | 2.2, 4.3 | — |
| 2.1 | 2.2, 2.3 | — |
| 3.1 | 3.4 | 1.4 |
| 3.2 | 3.3 | 1.4 |
| 4.1 | 4.2 | 1.2 |
| 4.3 | — | 1.4 |
| 4.4 | — | 2.1 |

---

## Definition of Done

- [ ] All Phase 1 tasks merged, benchmarks pass
- [ ] All Phase 2 tasks merged, benchmarks pass
- [ ] All Phase 3 tasks merged, benchmarks pass
- [ ] All Phase 4 tasks merged, benchmarks pass
- [ ] `npm test` passes (no regressions)
- [ ] `npm run build` passes
- [ ] Performance regression test in CI
- [ ] Documentation updated (`docs/architecture.md`, `docs/dataflow.md`)