import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lerpColor, skyProgress, skyColor, tintAlpha, moonPhase, nightBrightness } from '../shared/game.js';

test('lerpColor clamps t to [0,1]', () => {
  assert.strictEqual(lerpColor('#000000', '#ffffff', -5), '#000000');
  assert.strictEqual(lerpColor('#000000', '#ffffff', 5), '#ffffff');
  assert.strictEqual(lerpColor('#000000', '#ffffff', 0.5), '#808080');
});

test('skyProgress is continuous across midnight', () => {
  const before = skyProgress(new Date(2026, 0, 1, 23, 59));
  const after = skyProgress(new Date(2026, 0, 2, 0, 1));
  const diff = Math.abs(after - before);
  const ringDiff = Math.min(diff, 1 - diff);
  assert.ok(ringDiff < 0.05);
});

test('tintAlpha is 0 at day progress', () => {
  assert.strictEqual(tintAlpha(0.5), 0);
});

test('moonPhase is deterministic and in [0,1]', () => {
  const p1 = moonPhase(new Date(2026, 10, 14));
  const p2 = moonPhase(new Date(2026, 10, 14));
  assert.strictEqual(p1, p2);
  assert.ok(p1 >= 0 && p1 <= 1);
});

test('skyColor returns valid hex', () => {
  const c = skyColor('clear', 0.5);
  assert.ok(/^#[0-9a-fA-F]{6}$/.test(c));
});

test('nightBrightness is in [0,1]', () => {
  const b = nightBrightness(0.5);
  assert.ok(b >= 0 && b <= 1);
});
