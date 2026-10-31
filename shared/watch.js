// Watch party links. Only these sources are allowed, so a housemate can't load an arbitrary page into everyone's screen.
// Returns { kind, id, start } (file links keep their url), or null for anything else.
const YT_ID = /^[\w-]{11}$/;

// "90", "90s", "1m30s", "1h2m3s" -> seconds
function seconds(t) {
  if (!t) return 0;
  if (/^\d+$/.test(t)) return Number(t);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
  return m ? (Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)) : 0;
}

export function parseVideo(input) {
  const text = String(input).trim();
  if (/\s/.test(text)) return null; // URL() would quietly accept "a.com/x https://b.com/y.mp4"
  let u;
  try { u = new URL(text); } catch { return null; }
  if (u.protocol !== 'https:') return null; // http video would be blocked on an https site anyway
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  const path = u.pathname.split('/').filter(Boolean);
  const start = seconds(u.searchParams.get('t') ?? u.searchParams.get('start'));
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const id = path[0] === 'watch' ? u.searchParams.get('v') : ['shorts', 'embed', 'live'].includes(path[0]) ? path[1] : null;
    return YT_ID.test(id ?? '') ? { kind: 'youtube', id, start } : null;
  }
  if (host === 'youtu.be') return YT_ID.test(path[0] ?? '') ? { kind: 'youtube', id: path[0], start } : null;
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = path.find((p) => /^\d{5,12}$/.test(p));
    return id ? { kind: 'vimeo', id, start: seconds(u.hash.match(/t=(\w+)/)?.[1]) } : null;
  }
  if (host === 'twitch.tv') {
    if (path[0] === 'videos' && /^\d+$/.test(path[1] ?? '')) return { kind: 'twitchVideo', id: path[1], start };
    return path.length === 1 && /^\w{3,25}$/.test(path[0]) ? { kind: 'twitch', id: path[0].toLowerCase(), start: 0 } : null;
  }
  if (host === 'dailymotion.com' && path[0] === 'video' && /^x\w+$/.test(path[1] ?? '')) return { kind: 'dailymotion', id: path[1], start };
  if (host === 'dai.ly' && /^x\w+$/.test(path[0] ?? '')) return { kind: 'dailymotion', id: path[0], start };
  if (/\.(mp4|webm|m4v)$/i.test(u.pathname) && u.href.length <= 500) return { kind: 'file', url: u.href, start: 0 };
  return null;
}
