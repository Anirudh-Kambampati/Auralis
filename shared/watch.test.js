import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVideo } from './watch.js';

test('watch links: allowed sources', () => {
  assert.deepEqual(parseVideo('https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=1m30s'), { kind: 'youtube', id: 'aqz-KE-bpKQ', start: 90 });
  assert.deepEqual(parseVideo('https://youtu.be/aqz-KE-bpKQ?t=42'), { kind: 'youtube', id: 'aqz-KE-bpKQ', start: 42 });
  assert.deepEqual(parseVideo('https://youtube.com/shorts/aqz-KE-bpKQ'), { kind: 'youtube', id: 'aqz-KE-bpKQ', start: 0 });
  assert.deepEqual(parseVideo('https://music.youtube.com/watch?v=aqz-KE-bpKQ'), { kind: 'youtube', id: 'aqz-KE-bpKQ', start: 0 });
  assert.deepEqual(parseVideo('https://vimeo.com/76979871#t=30s'), { kind: 'vimeo', id: '76979871', start: 30 });
  assert.deepEqual(parseVideo('https://www.twitch.tv/SomeStreamer'), { kind: 'twitch', id: 'somestreamer', start: 0 });
  assert.deepEqual(parseVideo('https://www.twitch.tv/videos/123456?t=1h0m5s'), { kind: 'twitchVideo', id: '123456', start: 3605 });
  assert.deepEqual(parseVideo('https://www.dailymotion.com/video/x8abc12'), { kind: 'dailymotion', id: 'x8abc12', start: 0 });
  assert.deepEqual(parseVideo('https://cdn.example.com/clips/cat.mp4'), { kind: 'file', url: 'https://cdn.example.com/clips/cat.mp4', start: 0 });
});

test('watch links: everything else is refused', () => {
  for (const bad of [
    'https://example.com/page', 'http://cdn.example.com/cat.mp4', 'javascript:alert(1)', 'not a url', '',
    'https://www.youtube.com/watch?v=short', 'https://youtube.com.evil.com/watch?v=aqz-KE-bpKQ', 'https://evil.com/youtu.be/aqz-KE-bpKQ',
    'https://www.twitch.tv/directory/game/x', 'https://vimeo.com/channels', 'https://cdn.example.com/cat.mp4.html',
    'https://example.com/page/watch https://cdn.example.com/cat.mp4', // two links glued together
  ]) assert.equal(parseVideo(bad), null, bad);
});
