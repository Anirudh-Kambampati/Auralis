# Performance Optimization Design Doc

## Overview

This document identifies performance hotspots in Auralis and proposes targeted optimizations. The four primary areas are:

1. **Render Loop** — Client-side canvas rendering (60fps target)
2. **Pet Planning** — Per-frame pet AI and pathfinding
3. **Geometry Rebuilds** — Full world reconstruction on every state message
4. **WebSocket Broadcasts** — Server-side message fan-out patterns

---

## 1. Render Loop Hotspots

### Current Behavior (`src/main.ts`, `src/draw.ts`)

- **Full redraw every frame**: `requestAnimationFrame` loop clears and redraws entire canvas
- **Per-frame computations**:
  - `drawWindowLight()` iterates all slots, all windows every frame (lines 738-764)
  - Avatar sprite generation via `baked()` cache but `lookKey()` includes dynamic colors
  - Pet drawing: `drawPet()` called per pet per frame with canvas save/restore/scale
  - Furniture drawing: `drawFurniture()` iterates all pieces every frame
  - Shadow/shading calculations in `shadeHair()`, `shadeBody()` per avatar per frame
- **No dirty rect tracking**: Entire canvas repainted even for small changes
- **No frame budget monitoring**: No adaptive quality reduction under load

### Measured Impact

- `draw.ts` ~2000 lines of drawing code executed every frame
- Pet rendering: up to 20 pets × 4 rooms = 80 `drawPet()` calls/frame
- Avatar rendering: up to 10 housemates × seated/acting variants
- Furniture: 50+ pieces per room × 4 rooms = 200+ draw calls

### Optimization Targets

| Target | Current | Goal |
|--------|---------|------|
| Frame time (idle) | ~8-12ms | <4ms |
| Frame time (busy) | ~20-35ms | <8ms |
| Draw calls/frame | 300+ | <100 |
| GC pressure/frame | High (temp objects) | Near zero |

---

## 2. Pet Planning Hotspots

### Current Behavior (`src/petLogic.ts:137-258`)

- **`planPets()` runs every frame** (called from render loop via `main.ts`)
- **Per-pet BFS pathfinding**: `petRoute()` uses BFS with `prev` Map per route
- **Route cache (`petRoutes` Map)** keyed by string `"x,y>x,y"` but:
  - Invalidated on any grid change (room expand, furniture move)
  - String key allocation every lookup
- **Nested O(n²) loops** for pet interactions:
  - Playing pets: lines 214-219 (double loop)
  - Idle pets: lines 220-225 (double loop)
  - Pet-to-human following: lines 179-186, 183-186
- **Per-frame allocations**:
  - `areas` array rebuilt (line 143)
  - `pets` array built fresh (lines 144-151)
  - `petLabels` array (line 142)
  - `present` Map rebuilt (line 159)
  - `drawn` array returned (line 257)

### Measured Impact

- `planPets()` ~3-6ms/frame with 10-20 pets
- BFS pathfinding: 50-200μs per route, up to 40 routes/frame
- GC: ~50KB/frame from temporary arrays/objects

### Optimization Targets

| Target | Current | Goal |
|--------|---------|------|
| planPets() time | 3-6ms | <1ms |
| BFS calls/frame | 20-40 | <5 |
| Allocations/frame | ~50KB | <5KB |
| Route cache hit rate | ~60% | >90% |

---

## 3. Geometry Rebuilds Hotspots

### Current Behavior (`src/main.ts:205-269`)

On every `'state'` message (full house sync), the client rebuilds:

1. **`grid = buildGrid(slots)`** — Full spatial index reconstruction (line 205)
2. **`petSpots`** — Floor tile enumeration per room (lines 219-223)
3. **`petSun`** — Sunbathing spot calculation per room (lines 227-236)
4. **`acts` Map** — Usable furniture tiles (lines 237-247)
5. **`petToys`** — Pet-interactable furniture (lines 238-251)
6. **`petNear`** — Room adjacency via door floods (lines 253-269)
7. **`petRoutes` Map cleared** (line 254)
8. **Avatar position corrections** (lines 208-218)

### Trigger Frequency

- Initial join: 1×
- Room changes (expand, add_room, furniture place/move): 1× per change
- House member join/leave: 1×
- **Problem**: Any furniture `move`, `flip`, `restyle`, `paint`, `turn` triggers full rebuild via `'state'` broadcast

### Measured Impact

- `buildGrid()`: ~2-4ms for 4-room house
- Full rebuild: ~8-15ms blocking main thread
- Causes visible "lag" spike on furniture edits

### Optimization Targets

| Target | Current | Goal |
|--------|---------|------|
| Full rebuild time | 8-15ms | <2ms (incremental) |
| Rebuild frequency | Every state msg | Only on structural changes |
| Main thread block | 15ms | <2ms |

---

## 4. WebSocket Broadcast Hotspots

### Current Behavior (`server/ws/router.js`, `server/state.js`)

**Unthrottled broadcasts to all house members:**

| Message Type | Broadcast Scope | Frequency |
|--------------|-----------------|-----------|
| `pos` | All house members except sender | 10-30Hz per player |
| `cheer` | All house members | On click |
| `pat` | All house members | On click |
| `fetch` | All house members | On click |
| `highfive` | All house members | On click |
| `presence` | House + all friends | On status change |
| `typing` | Thread participants | On keystroke |
| `theme` | Thread participants | On change |
| `mute` | Thread participants | On change |

**Issues:**

1. **Position updates (`pos`)**: No throttling, no batching — each keystroke/mouse move sends, server immediately fans out to 5-10 sockets
2. **No delta compression**: Full `{x, y, use}` sent every time
3. **Presence broadcasts**: Fans out to friends across houses (potentially 50+ sockets)
4. **Typing indicators**: No debounce, fires on every keystroke
5. **`broadcastHouse()` called for many non-position events** (craft, brew, claw, gift_item, etc.)

### Measured Impact

- `pos` messages: 50-300 msg/sec per house under normal play
- Server CPU: ~30% spent in WebSocket `send()` serialization
- Network: 50-200 KB/sec per client for position alone

### Optimization Targets

| Target | Current | Goal |
|--------|---------|------|
| pos msg rate/client | 10-30 Hz | 10 Hz (throttled) |
| pos msg size | ~60 bytes | ~20 bytes (delta) |
| Broadcast CPU | 30% | <10% |
| Presence fan-out | O(friends×houses) | O(online friends) |

---

## Cross-Cutting Concerns

### Memory & GC Pressure

- **Per-frame allocations** in render loop, pet planning, geometry
- **Large Maps/Sets** (`petRoutes`, `acts`, `trails`) not cleared efficiently
- **Sprite cache** (`draw.ts:60`, `pets.ts:152`) grows unbounded

### Main Thread Contention

- Render loop + pet planning + geometry rebuilds all on main thread
- No `requestIdleCallback` or Web Worker offloading
- Long tasks (>50ms) block input handling

### Network Efficiency

- No message compression (permessage-deflate not enabled)
- Full state sync on join instead of incremental
- Redundant `state` broadcasts for minor changes

---

## Proposed Architecture

### Client-Side

```
┌─────────────────────────────────────────────────────────────┐
│                    Main Thread (UI)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Render     │  │  Input      │  │  State Sync         │  │
│  │  (RAF)      │  │  Handling   │  │  (WebSocket)        │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │             │
│         ▼                ▼                     ▼             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           Frame Scheduler (coordinator)             │    │
│  │  - Prioritizes render > pets > geometry > network   │    │
│  │  - Budget: 16ms/frame, yields to idle callbacks     │    │
│  └────────────────────────┬────────────────────────────┘    │
│                           │                                  │
│         ┌─────────────────┼─────────────────┐               │
│         ▼                 ▼                 ▼               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  Render     │  │  Pet        │  │  Geometry   │        │
│  │  Pipeline   │  │  System     │  │  System     │        │
│  │  - Dirty    │  │  - Fixed    │  │  - Incremental│       │
│  │    rects    │  │    timestep │  │    updates  │        │
│  │  - Layers   │  │  - Spatial  │  │  - Diff     │        │
│  │  - Culling  │  │    index    │  │    patches  │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
              ┌─────────────────────────┐
              │   Web Workers (off-main)│
              │  - Pet pathfinding      │
              │  - Grid operations      │
              │  - Sprite baking        │
              └─────────────────────────┘
```

### Server-Side

```
┌─────────────────────────────────────────────────────────────┐
│                    WebSocket Server                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Message    │  │  Broadcast  │  │  Presence           │  │
│  │  Router     │  │  Manager    │  │  Service            │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │             │
│         ▼                ▼                     ▼             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           Broadcast Optimizer                       │    │
│  │  - Position throttling (10Hz)                       │    │
│  │  - Delta encoding for pos                           │    │
│  │  - Batched broadcasts (5ms windows)                 │    │
│  │  - Interest management (room-based)                 │    │
│  └─────────────────────────────────────────────────────┘    │
```

---

## Implementation Priority

### Phase 1: Quick Wins (Week 1-2)
1. Throttle `pos` messages client-side (10Hz)
2. Delta-encode position updates
3. Batch server broadcasts (5ms windows)
4. Incremental geometry updates (diff instead of rebuild)
5. Debounce typing indicators (300ms)

### Phase 2: Render Pipeline (Week 2-3)
1. Dirty rect tracking + layer separation
2. Viewport culling for off-screen rooms
3. Sprite atlas for furniture/pets
4. Move pet planning to fixed timestep (30Hz)

### Phase 3: Pet System Overhaul (Week 3-4)
1. Offload pathfinding to Web Worker
2. Spatial index for pet queries (quadtree)
3. Behavior tree replaces nested loops
4. Predictive position interpolation

### Phase 4: Architecture (Week 4-5)
1. Full state diff/patch protocol
2. Interest management (room-based subscriptions)
3. Web Worker for grid operations
4. Frame budget monitor with adaptive quality

---

## Success Metrics

| Metric | Baseline | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|--------|----------|---------|---------|---------|---------|
| Avg frame time | 12ms | 8ms | 5ms | 4ms | 3ms |
| P99 frame time | 35ms | 20ms | 12ms | 8ms | 6ms |
| pos msg/sec | 200 | 50 | 50 | 50 | 20 |
| Server CPU (broadcast) | 30% | 15% | 15% | 10% | 5% |
| Join time (full sync) | 800ms | 800ms | 600ms | 400ms | 200ms |
| Memory (5 min) | 120MB | 100MB | 80MB | 70MB | 60MB |