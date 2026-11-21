// The read receipts the cache holds back and writes once per thread (see chat-cache.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noteSeen, flushSeen, seenView, loadPlayerThreads } from './chat-cache.js';
import { threadIndex } from './chat-cache.js';

const index = (playerId, thread, seen = 0) => threadIndex.set(playerId, new Map([[thread, { thread, seen }]]));

test('a burst of read receipts becomes one write per thread', async () => {
  const player = 'rtest', thread = 'h:AAAAA';
  index(player, thread);
  const writes = [];
  const store = { setThreadSeen: async (p, t, id) => { writes.push([p, t, id]); } };

  noteSeen(player, thread, 5);
  noteSeen(player, thread, 3); // older than what is already waiting: nothing to do
  noteSeen(player, thread, 9); // the newest wins
  assert.deepEqual(seenView({ id: player }), { [thread]: 9 }, 'the state view is current before the write');

  assert.equal(await flushSeen(store), 1, 'one row written for three receipts');
  assert.deepEqual(writes, [[player, thread, 9]]);
  assert.equal(await flushSeen(store), 0, 'the queue is empty afterwards');
});

test('a write that failed is retried on the next flush', async () => {
  const player = 'rfail', thread = 'h:BBBBB';
  index(player, thread);
  let down = true;
  const store = { setThreadSeen: async () => { if (down) throw new Error('database down'); } };

  noteSeen(player, thread, 4);
  await flushSeen(store); // fails, quietly, and puts the receipt back
  down = false;
  const writes = [];
  store.setThreadSeen = async (p, t, id) => { writes.push([p, t, id]); };

  assert.equal(await flushSeen(store), 1, 'the receipt that failed is sent again');
  assert.deepEqual(writes, [[player, thread, 4]]);
});

test('a receipt waiting for its write survives a reconnect', async () => {
  const player = 'rlive', thread = 'h:CCCCC';
  const store = {
    threadsFor: async () => [{ thread, seen: 0 }],
    tails: async () => ({}),
    setThreadSeen: async () => {},
  };
  await loadPlayerThreads({ id: player, house: 'CCCCC' }, store);
  noteSeen(player, thread, 12);
  assert.equal(seenView({ id: player })[thread], 12);

  await loadPlayerThreads({ id: player, house: 'CCCCC' }, store); // reconnecting before the flush
  assert.equal(seenView({ id: player })[thread], 12, 'the unread badge does not come back');
});
