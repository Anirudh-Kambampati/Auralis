# Smooth Day/Night Cycle — Design Spec

**Date:** 2026-11-14
**Status:** Approved (brainstorming)
**Scope:** Client-side visual/behavioral change only. No server protocol, no new furniture, no new UI.

## Problem

The day/night cycle uses three hard hour-bands (`day` 8–17, `dusk` 17–20/6–8, `night` 20–6) with abrupt snap transitions at each boundary. Night is one flat look with no moon variation, and weather snaps on/off every 3 hours.

## Goals

1. Smooth, continuous time-of-day with interpolated colors instead of hard snaps.
2. Moon phase gives nights personality (brighter full moon, darker new moon).
3. Weather builds and clears gradually instead of snapping.
4. Sky/weather transitions occur every 5–8 minutes (random), crossfaded over ~30 seconds.
5. No breaking changes to rendering call sites; all 34 existing tests pass.

## Design

### Time-of-day interpolator

Replace `skyNow()`'s three hard buckets with a continuous 0–1 progress value through the day computed from hour:minute. Four color keyframes define the cycle:

| Keyframe | Approx time | Color |
|---|---|---|
| dawn | ~06:00 | soft orange/pink |
| day | ~12:00 | bright blue |
| dusk | ~18:00 | deep violet/orange |
| night | ~00:00 | deep blue/indigo |

Progress is normalized within each adjacent pair and linearly interpolated (lerp) for:
- Sky color (`SKIES[weather][sky]`)
- `NIGHT_TINT` alpha (night tint overlay)
- Window glass color
- Glow strength

No hard snap at 8:00 or 17:00; brightness drifts continuously.

### Transition scheduler

A client-side timer selects the next sky phase and/or weather at a random interval between 5 and 8 minutes. The transition target is crossfaded over ~30 seconds so the room doesn't snap. Rendering reads the current interpolated target each frame.

### Moon phase (night variation)

Moon phase is computed from the current date over a ~29-day cycle:
- Full moon: brighter night sky, higher star density, more ambient light.
- New moon: darker night, fewer stars.
- Crescent/gibbous interpolate between full and new.

This affects night sky color and star opacity only; no gameplay impact.

### Gradual weather

Weather intensity ramps 0 → 1 over several minutes when a change is scheduled, holds, then ramps back to 0. Rain/snow particle density and cloud puff opacity scale with intensity (0–1) instead of snapping between clear/rain/snow.

### Data flow

```
local clock → time-of-day progress (0–1)
              ↓
sky keyframes → interpolated sky color / tint alpha / glow strength
moon phase (date) → night brightness & star density
transition timer (5–8 min) → target sky/weather (crossfaded over ~30s)
weather intensity (0–1) → particle density
              ↓
drawWindow, NIGHT_TINT, drawGlow each frame
```

### Files touched

- `src/draw.ts`: `skyNow()` → continuous progress + interpolation; `NIGHT_TINT` alpha from interpolated value; moon phase helper; weather intensity ramp.
- `src/main.ts`: render loop inputs (calls remain the same; inputs are now interpolated).

### What does NOT change

- `Sky` type stays `'day' | 'dusk' | 'night'` (derivation changes, not the type).
- `Weather` type unchanged.
- No new furniture, UI, or server messages.
- No protocol changes.

### Error handling

- Invalid/tampered system clock → fall back to last known good progress value; never crash rendering.
- Moon phase uses date only; deterministic for a given date.

### Testing

- Unit test interpolation math at each keyframe boundary.
- Test transition interval stays within 5–8 minutes.
- Test moon phase determinism for fixed dates.
- All 34 existing tests must continue to pass.
