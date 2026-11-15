import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS } from './game.js';
import { GUIDE_SECTIONS, GUIDE_TIPS, GUIDE_START } from './guide.js';

test('every section id is unique', () => {
  const ids = GUIDE_SECTIONS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every item named in a section is a real catalog item', () => {
  for (const s of GUIDE_SECTIONS) {
    for (const row of s.items ?? []) {
      assert.ok(ITEMS[row.item], `${s.id} names ${row.item}, which is not in ITEMS`);
    }
  }
});

test('every tip names a real catalog item', () => {
  for (const id of Object.keys(GUIDE_TIPS)) {
    assert.ok(ITEMS[id], `${id} is tipped but is not in ITEMS`);
  }
});

test('every tipped item is described somewhere in the guide', () => {
  const listed = new Set(GUIDE_SECTIONS.flatMap((s) => (s.items ?? []).map((r) => r.item)));
  for (const id of Object.keys(GUIDE_TIPS)) {
    assert.ok(listed.has(id), `${id} is tipped but never described`);
  }
});

test('start carries the five old tour steps', () => {
  assert.equal(GUIDE_START.length, 5);
  const start = GUIDE_SECTIONS.find((s) => s.id === 'start');
  assert.ok(start, 'there is a start section');
  assert.deepEqual(start.steps, GUIDE_START);
});