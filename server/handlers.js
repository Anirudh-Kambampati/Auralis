// Domain message handlers, split out of the handle() switch in index.js.
//
// Each domain is a plain object of methods copied from that switch's cases: a `case 'x': { … }`
// block becomes `async x(ctx) { … }` with the same body, plus one destructuring line that binds every
// free name from the context. Two things cannot be copied as they were: a value the body *changes*
// (`nextId++`) arrives as a function (`newId()`), since a destructured number would be a stale copy. The dispatcher in index.js calls the matching method with one context
// object holding every closure the body needs (store, db, sockets, helpers, and the per-message state
// such as `p`, `m` and `room`). Nothing here reaches outside that context, so a move is byte-for-byte:
// the switch keeps its per-message guards, its save()/broadcastHouse() tail, and its default case.
// Domains move here when they are large enough to read on their own; world and social stay in the switch
// for now and move the same way when they are split.

import crypto from 'node:crypto';

export const ctxKeys = ["sockets","db","p","m","store","pushTail","noteThread","dmThread","findMsg","isFriend","cleanText","newId","lastDm","lastChat","chatImg","attachLabel","threadMuted","push","inbox","save","broadcastHouse","refresh","lastCheer","cheerCount","lastInvite","setTz","focusEnd","focusStart","buddiesOf","quitReward","quitMinutes","caffeineOverlap","recordSession","streakDays","streakBonus","caffeineMinutes","mySessions","bondLevel","PETS","send","groupWatches","houseGroupWatch","watches","dmWatches","endDmWatch","pairKey","parseVideo","room","noteSeen","serverThread","isFocusLength","focusReward","friends","handle","setMute","visitAsks","houseDmWatch"];

export const focus = {
  async focus_start(ctx) {
    const { sockets, db, p, m, store, pushTail, noteThread, dmThread, findMsg, isFriend, cleanText, newId, lastDm, lastChat, chatImg, attachLabel, threadMuted, push, inbox, save, broadcastHouse, refresh, lastCheer, cheerCount, lastInvite, setTz, focusEnd, focusStart, buddiesOf, quitReward, quitMinutes, caffeineOverlap, recordSession, streakDays, streakBonus, caffeineMinutes, mySessions, bondLevel, PETS, send, groupWatches, houseGroupWatch, watches, dmWatches, endDmWatch, pairKey, parseVideo, room, noteSeen, serverThread, isFocusLength, focusReward, friends, handle, setMute, visitAsks, houseDmWatch } = ctx;
      if (!isFocusLength(m.minutes) || p.focus) return;
      setTz(p, m.tz);
      p.focus = { minutes: m.minutes, endsAt: Date.now() + m.minutes * 60_000, tag: cleanText(m.tag, 24) || 'Study' };
      p.hiddenSubjects = (p.hiddenSubjects ?? []).filter((t) => t !== p.focus.tag); // using a subject again brings it back
      for (const id of db.houses[p.house].members) {
        if (id === p.id) continue;
        inbox(db.players[id], 'study', p, `started studying ${p.focus.tag}`);
        if (!sockets.has(id)) push(db.players[id], { title: '📚 Study time', body: `${p.name} started studying ${p.focus.tag}`, tag: `study-${p.id}` }, 'study');
      }
      return true;
  },

  async focus_join(ctx) {
    const { sockets, db, p, m, store, pushTail, noteThread, dmThread, findMsg, isFriend, cleanText, newId, lastDm, lastChat, chatImg, attachLabel, threadMuted, push, inbox, save, broadcastHouse, refresh, lastCheer, cheerCount, lastInvite, setTz, focusEnd, focusStart, buddiesOf, quitReward, quitMinutes, caffeineOverlap, recordSession, streakDays, streakBonus, caffeineMinutes, mySessions, bondLevel, PETS, send, groupWatches, houseGroupWatch, watches, dmWatches, endDmWatch, pairKey, parseVideo, room, noteSeen, serverThread, isFocusLength, focusReward, friends, handle, setMute, visitAsks, houseDmWatch } = ctx;
    // join a housemate's running session: same subject, and the timer ends when theirs does
      const o = db.houses[p.house].members.includes(m.id) ? db.players[m.id] : null;
      const endsAt = o?.focus && !o.focus.pausedAt ? o.focus.endsAt : 0, left = endsAt - Date.now();
      if (p.focus || left < 60_000) return;
      setTz(p, m.tz);
      p.focus = { minutes: Math.round(left / 60_000), endsAt, tag: o.focus.tag };
      return true;
  },

  async focus_pause(ctx) {
    const { sockets, db, p, m, store, pushTail, noteThread, dmThread, findMsg, isFriend, cleanText, newId, lastDm, lastChat, chatImg, attachLabel, threadMuted, push, inbox, save, broadcastHouse, refresh, lastCheer, cheerCount, lastInvite, setTz, focusEnd, focusStart, buddiesOf, quitReward, quitMinutes, caffeineOverlap, recordSession, streakDays, streakBonus, caffeineMinutes, mySessions, bondLevel, PETS, send, groupWatches, houseGroupWatch, watches, dmWatches, endDmWatch, pairKey, parseVideo, room, noteSeen, serverThread, isFocusLength, focusReward, friends, handle, setMute, visitAsks, houseDmWatch } = ctx;
      if (!p.focus || p.focus.pausedAt) return;
      p.focus.pausedAt = Date.now();
      return true;
  },

  async focus_resume(ctx) {
    const { sockets, db, p, m, store, pushTail, noteThread, dmThread, findMsg, isFriend, cleanText, newId, lastDm, lastChat, chatImg, attachLabel, threadMuted, push, inbox, save, broadcastHouse, refresh, lastCheer, cheerCount, lastInvite, setTz, focusEnd, focusStart, buddiesOf, quitReward, quitMinutes, caffeineOverlap, recordSession, streakDays, streakBonus, caffeineMinutes, mySessions, bondLevel, PETS, send, groupWatches, houseGroupWatch, watches, dmWatches, endDmWatch, pairKey, parseVideo, room, noteSeen, serverThread, isFocusLength, focusReward, friends, handle, setMute, visitAsks, houseDmWatch } = ctx;
      if (!p.focus?.pausedAt) return;
      p.focus.endsAt = focusEnd(p.focus);
      p.focus.pausedAt = null;
      return true;
  },

  async focus_cancel(ctx) {
    const { sockets, db, p, m, store, pushTail, noteThread, dmThread, findMsg, isFriend, cleanText, newId, lastDm, lastChat, chatImg, attachLabel, threadMuted, push, inbox, save, broadcastHouse, refresh, lastCheer, cheerCount, lastInvite, setTz, focusEnd, focusStart, buddiesOf, quitReward, quitMinutes, caffeineOverlap, recordSession, streakDays, streakBonus, caffeineMinutes, mySessions, bondLevel, PETS, send, groupWatches, houseGroupWatch, watches, dmWatches, endDmWatch, pairKey, parseVideo, room, noteSeen, serverThread, isFocusLength, focusReward, friends, handle, setMute, visitAsks, houseDmWatch } = ctx;
      if (!p.focus) return;
      const now = Date.now();
      const elapsed = now - (focusEnd(p.focus, now) - p.focus.minutes * 60_000); // paused time doesn't count
      const reward = quitReward(p.focus.minutes, buddiesOf(p, now), elapsed)
        + caffeineOverlap(focusStart(p.focus, now), now, p.caffeineSince, p.caffeineUntil); // the time you actually worked while caffeinated
      const minutes = quitMinutes(p.focus.minutes, elapsed);
      p.coins += reward;
      if (minutes) {
        p.totalMinutes += minutes;
        // early: counts toward stats and the leaderboard, not toward tomatoes or the long break
        recordSession(p, { at: now, minutes, tag: p.focus.tag ?? 'Study', early: true });
      }
      cheerCount.delete(p.id);
      p.focus = null;
      if (reward) send(sockets.get(p.id), { t: 'reward', coins: reward, text: `Ended early: +${reward} coins and ${minutes} focus min for the time you put in.` });
      else send(sockets.get(p.id), { t: 'error', text: 'Ended too early to earn anything. Stay a quarter of the way for a reward.' });
      return true;
  },

  async focus_done(ctx) {
    const { sockets, db, p, m, store, pushTail, noteThread, dmThread, findMsg, isFriend, cleanText, newId, lastDm, lastChat, chatImg, attachLabel, threadMuted, push, inbox, save, broadcastHouse, refresh, lastCheer, cheerCount, lastInvite, setTz, focusEnd, focusStart, buddiesOf, quitReward, quitMinutes, caffeineOverlap, recordSession, streakDays, streakBonus, caffeineMinutes, mySessions, bondLevel, PETS, send, groupWatches, houseGroupWatch, watches, dmWatches, endDmWatch, pairKey, parseVideo, room, noteSeen, serverThread, isFocusLength, focusReward, friends, handle, setMute, visitAsks, houseDmWatch } = ctx;
      if (!p.focus || Date.now() < focusEnd(p.focus) - 2000) return;
      const now = Date.now();
      const buddies = buddiesOf(p, now);
      p.totalMinutes += p.focus.minutes;
      p.lastDoneAt = now;
      recordSession(p, { at: now, minutes: p.focus.minutes, tag: p.focus.tag ?? 'Study' });
      const streak = streakDays(mySessions(p), now, p.tz); // includes today, now that this session counts
      const reward = focusReward(p.focus.minutes, buddies) + Math.ceil(p.focus.minutes * streakBonus(streak))
        + caffeineMinutes(p.focus, p.caffeineSince, p.caffeineUntil, now); // one extra coin per caffeinated minute of the session
      // Cheer bonus: 2 coins per cheer, max 5 cheers (10 coins)
      const cheers = cheerCount.get(p.id) ?? 0;
      const cheerBonus = Math.min(cheers, 5) * 2;
      p.coins += reward + cheerBonus;
      const studied = p.focus.minutes;
      cheerCount.delete(p.id);
      p.focus = null;
      send(sockets.get(p.id), { t: 'reward', coins: reward + cheerBonus, buddies, streak, cheerBonus });
      // Pets out in the room bond with you as you study; a well-bonded one sometimes digs up a few coins.
      const out = (p.pets ?? []).filter((x) => !x.away);
      for (const x of out) x.bond = (x.bond ?? 0) + studied;
      const best = out.reduce((b, x) => (bondLevel(x.bond) > bondLevel(b?.bond) ? x : b), null), lvl = bondLevel(best?.bond);
      if (lvl && Math.random() < lvl * 0.1) {
        p.coins += lvl * 2;
        send(sockets.get(p.id), { t: 'reward', text: `🐾 ${best.name ?? `Your ${PETS[best.kind]?.name.toLowerCase() ?? 'pet'}`} found ${lvl * 2} coins for you!` });
      }
      return true;
  }
};

// Who can read a thread: the house's members, the two people in a dm, or a group's members. A new line is
// sent to each of them as one small frame, so a state snapshot never has to carry the conversation.
export function threadAudience(db, thread) {
  if (thread.startsWith('h:')) return db.houses[thread.slice(2)]?.members ?? [];
  if (thread.startsWith('d:')) return thread.slice(2).split('|');
  const gid = thread.slice(2);
  return Object.values(db.players).filter((q) => q.groups?.[gid]).map((q) => q.id);
}
// The line itself, to everyone who can read it.
const announce = (send, db, sockets, thread, msg) => {
  for (const id of threadAudience(db, thread)) send(sockets.get(id), { t: 'msg', thread, msg });
};

export const chat = {
  async dm(ctx) {
    const { sockets, db, p, m, store, pushTail, noteThread, dmThread, findMsg, isFriend, cleanText, newId, lastDm, lastChat, chatImg, attachLabel, threadMuted, push, inbox, save, broadcastHouse, refresh, lastCheer, cheerCount, lastInvite, setTz, focusEnd, focusStart, buddiesOf, quitReward, quitMinutes, caffeineOverlap, recordSession, streakDays, streakBonus, caffeineMinutes, mySessions, bondLevel, PETS, send, groupWatches, houseGroupWatch, watches, dmWatches, endDmWatch, pairKey, parseVideo, room, noteSeen, serverThread, isFocusLength, focusReward, friends, handle, setMute, visitAsks, houseDmWatch } = ctx;
      const to = db.players[m.to];
      const text = cleanText(m.text, 200);
      const img = chatImg(p, m.img);
      if (!to || !(text || img) || to.id === p.id || !(db.houses[p.house]?.members.includes(to.id) || isFriend(p.id, to.id))) return;
      const now = Date.now();
      if (now - (lastDm.get(p.id) ?? 0) < 600) return send(sockets.get(p.id), { t: 'error', text: 'Slow down a little — that message was not sent.' });
      lastDm.set(p.id, now);
      const thread = dmThread(p.id, to.id), reply = await findMsg(thread, m.replyTo);
      const msg = { id: newId(), from: p.id, by: p.name, text, at: now, ...(img && { img }), ...(reply ? { replyTo: reply.id, replyBy: reply.by } : {}) };
      store.addMessage(thread, msg);
      pushTail(thread, msg);
      noteThread(thread, msg, [p.id, to.id]);
      announce(send, db, sockets, thread, msg);
      if (!sockets.has(to.id) && !threadMuted(to, p.id)) push(to, { title: p.name, body: text || attachLabel(img), tag: `dm-${p.id}` }, 'dm');
      save();
      return;
  },

  async history(ctx) {
    const { sockets, db, p, m, store, pushTail, noteThread, dmThread, findMsg, isFriend, cleanText, newId, lastDm, lastChat, chatImg, attachLabel, threadMuted, push, inbox, save, broadcastHouse, refresh, lastCheer, cheerCount, lastInvite, setTz, focusEnd, focusStart, buddiesOf, quitReward, quitMinutes, caffeineOverlap, recordSession, streakDays, streakBonus, caffeineMinutes, mySessions, bondLevel, PETS, send, groupWatches, houseGroupWatch, watches, dmWatches, endDmWatch, pairKey, parseVideo, room, noteSeen, serverThread, isFocusLength, focusReward, friends, handle, setMute, visitAsks, houseDmWatch } = ctx;
      const thread = m.k === 'h' ? `h:${p.house}` : m.k === 'd' && typeof m.id === 'string' ? dmThread(p.id, m.id) : m.k === 'g' && p.groups?.[m.id] ? `g:${m.id}` : null;
      if (!thread || !Number.isFinite(m.before)) return;
      Promise.resolve(store.history(thread, m.before, 50))
        .then((msgs) => send(sockets.get(p.id), { t: 'history', k: m.k, id: m.id ?? null, msgs }))
        .catch((err) => console.error('history failed', err));
      return;
  },

  async friend_request(ctx) {
    const { sockets, db, p, m, store, pushTail, noteThread, dmThread, findMsg, isFriend, cleanText, newId, lastDm, lastChat, chatImg, attachLabel, threadMuted, push, inbox, save, broadcastHouse, refresh, lastCheer, cheerCount, lastInvite, setTz, focusEnd, focusStart, buddiesOf, quitReward, quitMinutes, caffeineOverlap, recordSession, streakDays, streakBonus, caffeineMinutes, mySessions, bondLevel, PETS, send, groupWatches, houseGroupWatch, watches, dmWatches, endDmWatch, pairKey, parseVideo, room, noteSeen, serverThread, isFocusLength, focusReward, friends, handle, setMute, visitAsks, houseDmWatch } = ctx;
      // By username, a housemate's display name or id, or a house code (its owner).
      const mate = (db.houses[p.house]?.members ?? []).map((id) => db.players[id])
        .find((q) => q.id === m.id || (m.name && q.name?.toLowerCase() === String(m.name).trim().toLowerCase()));
      const name = cleanText(m.name, 40) || mate?.name;
      if (!name) return;
      const fail = (text) => send(sockets.get(p.id), { t: 'error', text });
      if ([...friends.values()].filter((f) => f.asked_by === p.id && f.status === 'pending').length >= 20) return fail('You have 20 friend requests waiting already.');
      Promise.resolve(store.playerByUsername(name)).then((id) => {
        const q = db.players[id] ?? mate ?? db.players[db.houses[name.toUpperCase()]?.owner];
        if (!q) return fail(`No one is called "${name}", and no house has that code.`);
        if (q.id === p.id) return fail("That's you!");
        const key = pairKey(p.id, q.id), f = friends.get(key);
        if (f?.status === 'accepted') return fail(`You and ${q.name} are already friends.`);
        if (f?.asked_by === p.id) return fail(`You already asked ${q.name}.`);
        const [a, b] = key.split('|');
        // They had already asked me: asking back is a yes.
        const row = { a, b, status: f ? 'accepted' : 'pending', asked_by: f ? f.asked_by : p.id, at: Date.now() };
        friends.set(key, row);
        store.setFriend(row);
        if (!f) inbox(q, 'friend', p, 'wants to be friends');
        if (!f && !sockets.has(q.id)) push(q, { title: 'Friend request', body: `${p.name} wants to be friends`, tag: `friend-${p.id}` }, 'dm');
        refresh(p.id, q.id);
      }).catch((err) => console.error('friend request failed', err));
      return;
  },

  async friend_search(ctx) {
    const { sockets, db, p, m, store, pushTail, noteThread, dmThread, findMsg, isFriend, cleanText, newId, lastDm, lastChat, chatImg, attachLabel, threadMuted, push, inbox, save, broadcastHouse, refresh, lastCheer, cheerCount, lastInvite, setTz, focusEnd, focusStart, buddiesOf, quitReward, quitMinutes, caffeineOverlap, recordSession, streakDays, streakBonus, caffeineMinutes, mySessions, bondLevel, PETS, send, groupWatches, houseGroupWatch, watches, dmWatches, endDmWatch, pairKey, parseVideo, room, noteSeen, serverThread, isFocusLength, focusReward, friends, handle, setMute, visitAsks, houseDmWatch } = ctx;
    // shortcut: scans every player per lookup, move to an indexed store query if players reach the tens of thousands
      const q = cleanText(m.q, 40).toLowerCase();
      if (q.length < 2) return;
      const names = Object.values(db.players).filter((x) => x.id !== p.id && x.name?.toLowerCase().startsWith(q)).slice(0, 8).map((x) => x.name);
      send(sockets.get(p.id), { t: 'friend_matches', names });
      return;
  },

  async visit_ask(ctx) {
    const { sockets, db, p, m, store, pushTail, noteThread, dmThread, findMsg, isFriend, cleanText, newId, lastDm, lastChat, chatImg, attachLabel, threadMuted, push, inbox, save, broadcastHouse, refresh, lastCheer, cheerCount, lastInvite, setTz, focusEnd, focusStart, buddiesOf, quitReward, quitMinutes, caffeineOverlap, recordSession, streakDays, streakBonus, caffeineMinutes, mySessions, bondLevel, PETS, send, groupWatches, houseGroupWatch, watches, dmWatches, endDmWatch, pairKey, parseVideo, room, noteSeen, serverThread, isFocusLength, focusReward, friends, handle, setMute, visitAsks, houseDmWatch } = ctx;
      const q = db.players[m.id];
      if (!q || !isFriend(p.id, q.id) || !q.house || q.house === p.house) return;
      visitAsks.add(`${q.id}|${p.id}`);
      inbox(q, 'visit', p, 'wants to visit your house');
      if (!sockets.has(q.id)) push(q, { title: 'Visit request', body: `${p.name} wants to visit your house`, tag: `visit-${p.id}` }, 'dm');
      refresh(p.id, q.id);
      return;
  },

  async visit_answer(ctx) {
    const { sockets, db, p, m, store, pushTail, noteThread, dmThread, findMsg, isFriend, cleanText, newId, lastDm, lastChat, chatImg, attachLabel, threadMuted, push, inbox, save, broadcastHouse, refresh, lastCheer, cheerCount, lastInvite, setTz, focusEnd, focusStart, buddiesOf, quitReward, quitMinutes, caffeineOverlap, recordSession, streakDays, streakBonus, caffeineMinutes, mySessions, bondLevel, PETS, send, groupWatches, houseGroupWatch, watches, dmWatches, endDmWatch, pairKey, parseVideo, room, noteSeen, serverThread, isFocusLength, focusReward, friends, handle, setMute, visitAsks, houseDmWatch } = ctx;
      const guest = db.players[m.id];
      if (!visitAsks.delete(`${p.id}|${m.id}`) || !guest) return;
      if (m.yes && isFriend(p.id, guest.id) && p.house) return await handle(guest, { t: 'join', code: p.house }); // same checks as joining by code
      refresh(p.id, guest.id);
      return;
  },

  async friend_accept(ctx) {
    const { sockets, db, p, m, store, pushTail, noteThread, dmThread, findMsg, isFriend, cleanText, newId, lastDm, lastChat, chatImg, attachLabel, threadMuted, push, inbox, save, broadcastHouse, refresh, lastCheer, cheerCount, lastInvite, setTz, focusEnd, focusStart, buddiesOf, quitReward, quitMinutes, caffeineOverlap, recordSession, streakDays, streakBonus, caffeineMinutes, mySessions, bondLevel, PETS, send, groupWatches, houseGroupWatch, watches, dmWatches, endDmWatch, pairKey, parseVideo, room, noteSeen, serverThread, isFocusLength, focusReward, friends, handle, setMute, visitAsks, houseDmWatch } = ctx;
      const key = pairKey(p.id, String(m.id)), f = friends.get(key);
      if (f?.status !== 'pending' || f.asked_by === p.id) return;
      f.status = 'accepted';
      f.at = Date.now();
      store.setFriend(f);
      refresh(p.id, m.id);
      return;
  },

  async friend_remove(ctx) {
    const { sockets, db, p, m, store, pushTail, noteThread, dmThread, findMsg, isFriend, cleanText, newId, lastDm, lastChat, chatImg, attachLabel, threadMuted, push, inbox, save, broadcastHouse, refresh, lastCheer, cheerCount, lastInvite, setTz, focusEnd, focusStart, buddiesOf, quitReward, quitMinutes, caffeineOverlap, recordSession, streakDays, streakBonus, caffeineMinutes, mySessions, bondLevel, PETS, send, groupWatches, houseGroupWatch, watches, dmWatches, endDmWatch, pairKey, parseVideo, room, noteSeen, serverThread, isFocusLength, focusReward, friends, handle, setMute, visitAsks, houseDmWatch } = ctx;
    // decline a request, cancel mine, or unfriend
      const key = pairKey(p.id, String(m.id)), f = friends.get(key);
      if (!f) return;
      friends.delete(key);
      store.deleteFriend(f.a, f.b);
      refresh(p.id, m.id);
      return;
  },

  async group_new(ctx) {
    const { sockets, db, p, m, store, pushTail, noteThread, dmThread, findMsg, isFriend, cleanText, newId, lastDm, lastChat, chatImg, attachLabel, threadMuted, push, inbox, save, broadcastHouse, refresh, lastCheer, cheerCount, lastInvite, setTz, focusEnd, focusStart, buddiesOf, quitReward, quitMinutes, caffeineOverlap, recordSession, streakDays, streakBonus, caffeineMinutes, mySessions, bondLevel, PETS, send, groupWatches, houseGroupWatch, watches, dmWatches, endDmWatch, pairKey, parseVideo, room, noteSeen, serverThread, isFocusLength, focusReward, friends, handle, setMute, visitAsks, houseDmWatch } = ctx;
      const h = db.houses[p.house], name = cleanText(m.name, 30);
      const ids = [...new Set([p.id, ...(Array.isArray(m.members) ? m.members : [])])].filter((id) => h.members.includes(id));
      if (!name || ids.length < 2) return send(sockets.get(p.id), { t: 'error', text: 'Give the group a name and pick at least one person.' });
      if (Object.keys(p.groups ?? {}).length >= 20) return send(sockets.get(p.id), { t: 'error', text: "You're in 20 groups already. Leave one first." });
      const gid = crypto.randomBytes(6).toString('hex'), msg = { id: newId(), from: '', by: '', text: `${p.name} made the group`, at: Date.now() };
      for (const id of ids) { const q = db.players[id]; q.groups ??= {}; q.groups[gid] = { name, members: ids }; }
      store.addMessage(`g:${gid}`, msg);
      pushTail(`g:${gid}`, msg);
      noteThread(`g:${gid}`, msg, ids);
      save();
      refresh(...ids); // a new group is a full picture for each member: its name, members and first line
      return;
  },

  async gmsg(ctx) {
    const { sockets, db, p, m, store, pushTail, noteThread, dmThread, findMsg, isFriend, cleanText, newId, lastDm, lastChat, chatImg, attachLabel, threadMuted, push, inbox, save, broadcastHouse, refresh, lastCheer, cheerCount, lastInvite, setTz, focusEnd, focusStart, buddiesOf, quitReward, quitMinutes, caffeineOverlap, recordSession, streakDays, streakBonus, caffeineMinutes, mySessions, bondLevel, PETS, send, groupWatches, houseGroupWatch, watches, dmWatches, endDmWatch, pairKey, parseVideo, room, noteSeen, serverThread, isFocusLength, focusReward, friends, handle, setMute, visitAsks, houseDmWatch } = ctx;
      const g = p.groups?.[m.g], text = cleanText(m.text, 200), img = chatImg(p, m.img), now = Date.now();
      if (!g || !(text || img)) return;
      if (now - (lastDm.get(p.id) ?? 0) < 600) return send(sockets.get(p.id), { t: 'error', text: 'Slow down a little — that message was not sent.' });
      lastDm.set(p.id, now);
      const thread = `g:${m.g}`, reply = await findMsg(thread, m.replyTo);
      const msg = { id: newId(), from: p.id, by: p.name, text, at: now, ...(img && { img }), ...(reply ? { replyTo: reply.id, replyBy: reply.by } : {}) };
      store.addMessage(thread, msg);
      pushTail(thread, msg);
      noteThread(thread, msg, g.members);
      for (const id of g.members) {
        const q = db.players[id];
        if (!q) continue;
        if (id !== p.id && !sockets.has(id) && !threadMuted(q, thread)) push(q, { title: g.name, body: `${p.name}: ${text || attachLabel(img)}`, tag: `g-${m.g}` }, 'dm');
      }
      announce(send, db, sockets, thread, msg); // reaches members in other houses without their snapshots
      save();
      return;
  },

  async group_leave(ctx) {
    const { sockets, db, p, m, store, pushTail, noteThread, dmThread, findMsg, isFriend, cleanText, newId, lastDm, lastChat, chatImg, attachLabel, threadMuted, push, inbox, save, broadcastHouse, refresh, lastCheer, cheerCount, lastInvite, setTz, focusEnd, focusStart, buddiesOf, quitReward, quitMinutes, caffeineOverlap, recordSession, streakDays, streakBonus, caffeineMinutes, mySessions, bondLevel, PETS, send, groupWatches, houseGroupWatch, watches, dmWatches, endDmWatch, pairKey, parseVideo, room, noteSeen, serverThread, isFocusLength, focusReward, friends, handle, setMute, visitAsks, houseDmWatch } = ctx;
      const g = p.groups?.[m.g];
      if (!g) return;
      const msg = { id: newId(), from: '', by: '', text: `${p.name} left the group`, at: Date.now() };
      store.addMessage(`g:${m.g}`, msg);
      pushTail(`g:${m.g}`, msg);
      noteThread(`g:${m.g}`, msg, g.members.filter((id) => id !== p.id)); // not the one leaving
      for (const id of g.members) {
        const qg = db.players[id]?.groups?.[m.g];
        if (!qg || id === p.id) continue;
        qg.members = qg.members.filter((x) => x !== p.id);
      }
      delete p.groups[m.g];
      announce(send, db, sockets, `g:${m.g}`, msg); // the note, to the people still in it
      return true;
  },

  async chat(ctx) {
    const { sockets, db, p, m, store, pushTail, noteThread, dmThread, findMsg, isFriend, cleanText, newId, lastDm, lastChat, chatImg, attachLabel, threadMuted, push, inbox, save, broadcastHouse, refresh, lastCheer, cheerCount, lastInvite, setTz, focusEnd, focusStart, buddiesOf, quitReward, quitMinutes, caffeineOverlap, recordSession, streakDays, streakBonus, caffeineMinutes, mySessions, bondLevel, PETS, send, groupWatches, houseGroupWatch, watches, dmWatches, endDmWatch, pairKey, parseVideo, room, noteSeen, serverThread, isFocusLength, focusReward, friends, handle, setMute, visitAsks, houseDmWatch } = ctx;
      const h = db.houses[p.house];
      const text = cleanText(m.text, 200), img = chatImg(p, m.img);
      const now = Date.now();
      if (!text && !img) return;
      if (now - (lastChat.get(p.id) ?? 0) < 600) return send(sockets.get(p.id), { t: 'error', text: 'Slow down a little — that message was not sent.' });
      lastChat.set(p.id, now);
      const thread = `h:${h.code}`, reply = await findMsg(thread, m.replyTo);
      const msg = { id: newId(), from: p.id, by: p.name, text, at: now, ...(img && { img }), ...(reply ? { replyTo: reply.id, replyBy: reply.by } : {}) };
      store.addMessage(thread, msg);
      pushTail(thread, msg);
      noteThread(thread, msg, h.members);
      // Handle @mentions: find @name patterns and notify those users
      const mentionRegex = /@(\w+)/g;
      const mentionedNames = [...text.matchAll(mentionRegex)].map((m) => m[1].toLowerCase());
      const mentionedIds = new Set();
      if (mentionedNames.length) {
        for (const id of h.members) {
          if (id !== p.id) {
            const player = db.players[id];
            if (mentionedNames.includes(player.name.toLowerCase())) {
              mentionedIds.add(id);
              inbox(player, 'chat', p, `mentioned you in house chat`);
              if (!sockets.has(id) && !threadMuted(player, thread)) push(player, { title: `💬 @${p.name} mentioned you`, body: text || attachLabel(img), tag: `house-${h.code}` }, 'chat');
            }
          }
        }
      }
      // Notify other members (not mentioned, not sender)
      for (const id of h.members) if (id !== p.id && !mentionedIds.has(id) && !sockets.has(id) && !threadMuted(db.players[id], thread)) push(db.players[id], { title: `${p.name} · house chat`, body: text || attachLabel(img), tag: `house-${h.code}` }, 'house');
      announce(send, db, sockets, thread, msg); // the line, as one frame, instead of a house snapshot per line
      save();
      return;
  },

  async watch(ctx) {
    const { sockets, db, p, m, store, pushTail, noteThread, dmThread, findMsg, isFriend, cleanText, newId, lastDm, lastChat, chatImg, attachLabel, threadMuted, push, inbox, save, broadcastHouse, refresh, lastCheer, cheerCount, lastInvite, setTz, focusEnd, focusStart, buddiesOf, quitReward, quitMinutes, caffeineOverlap, recordSession, streakDays, streakBonus, caffeineMinutes, mySessions, bondLevel, PETS, send, groupWatches, houseGroupWatch, watches, dmWatches, endDmWatch, pairKey, parseVideo, room, noteSeen, serverThread, isFocusLength, focusReward, friends, handle, setMute, visitAsks, houseDmWatch } = ctx;
    // /watch <link>: in house chat starts for the whole house, in a DM starts for just us two
      const stop = String(m.url ?? '').trim().toLowerCase() === 'stop';
      const src = stop ? null : parseVideo(String(m.url ?? '').slice(0, 600));
      if (!stop && !src) return send(sockets.get(p.id), { t: 'error', text: "Can't play that link. Try YouTube, Vimeo, Twitch, Dailymotion or a direct .mp4/.webm link." });
      if (m.to) {
        const to = db.players[String(m.to)];
        if (!to) return;
        // Only allow private watch with someone you can DM (housemate or friend), in either house.
        if (!(db.houses[p.house]?.members.includes(to.id) || isFriend(p.id, to.id))) return send(sockets.get(p.id), { t: 'error', text: 'You can only start a private watch party with a friend or housemate.' });
        const key = pairKey(p.id, to.id), w = dmWatches.get(key);
        if (stop) {
          if (!w) return;
          endDmWatch(key, p.id);
          save();
          return;
        }
        dmWatches.set(key, { src, by: p.id, byName: p.name, playing: true, pos: src.start, at: Date.now() });
        const msg = { id: newId(), from: p.id, by: p.name, text: 'started a watch party', at: Date.now() };
        const thread = dmThread(p.id, to.id);
        store.addMessage(thread, msg);
        pushTail(thread, msg);
        noteThread(thread, msg, [p.id, to.id]);
        if (!sockets.has(to.id)) push(to, { title: `${p.name} - watch party`, body: 'started a watch party with you', tag: `dm-watch-${p.id}` }, 'dm');
        save();
        refresh(p.id, to.id);
        return;
      }
      if (m.g) {
        // A group chat starts a party for its members only, even when they live in different houses.
        const gid = String(m.g), g = p.groups?.[gid];
        if (!g) return;
        const thread = `g:${gid}`;
        if (stop) {
          if (!groupWatches.has(gid)) return;
          groupWatches.delete(gid);
          const msg = { id: newId(), from: p.id, by: p.name, text: 'ended the watch party', at: Date.now() };
          store.addMessage(thread, msg);
          pushTail(thread, msg);
          noteThread(thread, msg, g.members);
          announce(send, db, sockets, thread, msg);
          for (const id of g.members) send(sockets.get(id), { t: 'watch_ended', scope: 'group' });
          save();
          refresh(...g.members);
          return;
        }
        groupWatches.set(gid, { src, by: p.id, byName: p.name, playing: true, pos: src.start, at: Date.now() });
        const msg = { id: newId(), from: p.id, by: p.name, text: '🎬 started a watch party', at: Date.now() };
        store.addMessage(thread, msg);
        pushTail(thread, msg);
        noteThread(thread, msg, g.members);
        announce(send, db, sockets, thread, msg);
        save();
        refresh(...g.members); // each member's own state carries the private party
        return;
      }
      const h = db.houses[p.house];
      if (stop && !watches.has(p.house)) return;
      if (stop) watches.delete(p.house);
      else watches.set(p.house, { src, by: p.id, byName: p.name, playing: true, pos: src.start, at: Date.now() });
      const msg = { id: newId(), from: p.id, by: p.name, text: stop ? '⏹ ended the watch party' : '🎬 started a watch party', at: Date.now() };
      store.addMessage(`h:${h.code}`, msg);
      pushTail(`h:${h.code}`, msg);
      noteThread(`h:${h.code}`, msg, h.members);
      announce(send, db, sockets, `h:${h.code}`, msg);
      return true;
  },

  async watchCtl(ctx) {
    const { sockets, db, p, m, store, pushTail, noteThread, dmThread, findMsg, isFriend, cleanText, newId, lastDm, lastChat, chatImg, attachLabel, threadMuted, push, inbox, save, broadcastHouse, refresh, lastCheer, cheerCount, lastInvite, setTz, focusEnd, focusStart, buddiesOf, quitReward, quitMinutes, caffeineOverlap, recordSession, streakDays, streakBonus, caffeineMinutes, mySessions, bondLevel, PETS, send, groupWatches, houseGroupWatch, watches, dmWatches, endDmWatch, pairKey, parseVideo, room, noteSeen, serverThread, isFocusLength, focusReward, friends, handle, setMute, visitAsks, houseDmWatch } = ctx;
    // someone pressed play/pause or seeked: everyone in that watch party follows
      if (!Number.isFinite(m.pos) || m.pos < 0 || m.pos > 1e6) return;
      if (m.scope === 'group' || m.g) {
        const gid = m.g ? String(m.g) : (houseGroupWatch(p)?.[0] ?? null);
        const w = gid ? groupWatches.get(gid) : null;
        if (!gid || !w || !p.groups?.[gid]) return;
        w.playing = !!m.playing;
        w.pos = m.pos;
        w.at = Date.now();
        refresh(...(p.groups[gid].members ?? []));
        return;
      }
      if (m.scope === 'dm' || m.to) {
        const key = m.to ? pairKey(p.id, String(m.to)) : (houseDmWatch(p)?.[0] ?? null);
        const w = key ? dmWatches.get(key) : null;
        if (!key || !w) return;
        w.playing = !!m.playing;
        w.pos = m.pos;
        w.at = Date.now();
        refresh(...key.split('|'));
        return;
      }
      const w = watches.get(p.house);
      if (!w) return;
      w.playing = !!m.playing;
      w.pos = m.pos;
      w.at = Date.now();
      broadcastHouse(p.house);
      return;
  },

  async typing(ctx) {
    const { sockets, db, p, m, store, pushTail, noteThread, dmThread, findMsg, isFriend, cleanText, newId, lastDm, lastChat, chatImg, attachLabel, threadMuted, push, inbox, save, broadcastHouse, refresh, lastCheer, cheerCount, lastInvite, setTz, focusEnd, focusStart, buddiesOf, quitReward, quitMinutes, caffeineOverlap, recordSession, streakDays, streakBonus, caffeineMinutes, mySessions, bondLevel, PETS, send, groupWatches, houseGroupWatch, watches, dmWatches, endDmWatch, pairKey, parseVideo, room, noteSeen, serverThread, isFocusLength, focusReward, friends, handle, setMute, visitAsks, houseDmWatch } = ctx;
    // typing indicator: broadcast to thread participants
      const thread = m.thread;
      if (!thread) return;
      // Broadcast to all members in the thread
      if (thread.startsWith('h:')) {
        const h = db.houses[thread.slice(2)];
        if (h) for (const id of h.members) if (id !== p.id) send(sockets.get(id), { t: 'typing', thread, user: p.id, name: p.name, typing: m.typing });
      } else if (thread.startsWith('g:')) {
        const g = p.groups?.[thread.slice(2)];
        if (g) for (const id of g.members) if (id !== p.id) send(sockets.get(id), { t: 'typing', thread, user: p.id, name: p.name, typing: m.typing });
      } else { // dm
        const other = db.players[thread];
        if (other && other.id !== p.id) send(sockets.get(other.id), { t: 'typing', thread, user: p.id, name: p.name, typing: m.typing });
      }
      return; // nothing to save and nothing to rebroadcast
  },

  async presence(ctx) {
    const { sockets, db, p, m, store, pushTail, noteThread, dmThread, findMsg, isFriend, cleanText, newId, lastDm, lastChat, chatImg, attachLabel, threadMuted, push, inbox, save, broadcastHouse, refresh, lastCheer, cheerCount, lastInvite, setTz, focusEnd, focusStart, buddiesOf, quitReward, quitMinutes, caffeineOverlap, recordSession, streakDays, streakBonus, caffeineMinutes, mySessions, bondLevel, PETS, send, groupWatches, houseGroupWatch, watches, dmWatches, endDmWatch, pairKey, parseVideo, room, noteSeen, serverThread, isFocusLength, focusReward, friends, handle, setMute, visitAsks, houseDmWatch } = ctx;
    // user presence/status
      const status = { status: m.status, custom: m.custom || '', until: Number(m.until) || 0, at: Date.now() };
      p.presence = status;
      const msg = { t: 'presence', id: p.id, ...status };
      const houses = new Set();
      if (p.house) houses.add(p.house);
      for (const [key, f] of friends) if (f.status === 'friend' && (key.startsWith(p.id + '|') || key.endsWith('|' + p.id))) {
        const otherId = key.startsWith(p.id + '|') ? key.split('|')[1] : key.split('|')[0];
        const other = db.players[otherId];
        if (other?.house) houses.add(other.house);
        send(sockets.get(otherId), msg);
      }
      for (const code of houses) {
        const h = db.houses[code];
        if (h) for (const id of h.members) send(sockets.get(id), msg);
      }
      save(); // presence is not a reason to rebuild the house: the frame above is the whole update
      return;
  },

  async mute(ctx) {
    const { sockets, db, p, m, store, pushTail, noteThread, dmThread, findMsg, isFriend, cleanText, newId, lastDm, lastChat, chatImg, attachLabel, threadMuted, push, inbox, save, broadcastHouse, refresh, lastCheer, cheerCount, lastInvite, setTz, focusEnd, focusStart, buddiesOf, quitReward, quitMinutes, caffeineOverlap, recordSession, streakDays, streakBonus, caffeineMinutes, mySessions, bondLevel, PETS, send, groupWatches, houseGroupWatch, watches, dmWatches, endDmWatch, pairKey, parseVideo, room, noteSeen, serverThread, isFocusLength, focusReward, friends, handle, setMute, visitAsks, houseDmWatch } = ctx;
    // mute/unmute thread: -1 back on, 0 forever, otherwise until a timestamp
      const thread = m.thread, until = m.until;
      if (typeof thread !== 'string' || !thread || thread.length > 40 || !Number.isFinite(until)) return;
      if (until !== -1 && until !== 0 && (until < Date.now() || until > Date.now() + 30 * 86_400_000)) return; // at most a month ahead
      // The client names a DM by the person; the cache and the table name it by the pair.
      const key = serverThread(p, thread);
      setMute(p, key, until === -1 ? null : until);
      // Kept on this member's `threads` row: it survives a reload and decides whether a message to them is pushed.
      Promise.resolve(store.setThreadMute?.(p.id, key, until === -1 ? null : until)).catch((err) => console.error('mute failed', err));
      // Answer the asker with what was kept, so their bell settles on the truth (states already in flight may be older).
      send(sockets.get(p.id), { t: 'mute', thread, until });
      return true;
  },

  async theme(ctx) {
    const { sockets, db, p, m, store, pushTail, noteThread, dmThread, findMsg, isFriend, cleanText, newId, lastDm, lastChat, chatImg, attachLabel, threadMuted, push, inbox, save, broadcastHouse, refresh, lastCheer, cheerCount, lastInvite, setTz, focusEnd, focusStart, buddiesOf, quitReward, quitMinutes, caffeineOverlap, recordSession, streakDays, streakBonus, caffeineMinutes, mySessions, bondLevel, PETS, send, groupWatches, houseGroupWatch, watches, dmWatches, endDmWatch, pairKey, parseVideo, room, noteSeen, serverThread, isFocusLength, focusReward, friends, handle, setMute, visitAsks, houseDmWatch } = ctx;
    // chat theme color
      const thread = m.thread, color = m.color;
      p.chatThemes ??= {};
      if (color) p.chatThemes[thread] = color;
      else delete p.chatThemes[thread];
      // Persist to store
      if (store.setChatTheme) await store.setChatTheme(p.id, thread, color);
      // Broadcast to thread participants
      if (thread.startsWith('h:')) {
        const h = db.houses[thread.slice(2)];
        if (h) for (const id of h.members) if (id !== p.id) send(sockets.get(id), { t: 'theme', thread, color });
      } else if (thread.startsWith('g:')) {
        const g = p.groups?.[thread.slice(2)];
        if (g) for (const id of g.members) if (id !== p.id) send(sockets.get(id), { t: 'theme', thread, color });
      } else { // dm
        const other = db.players[thread];
        if (other && other.id !== p.id) send(sockets.get(other.id), { t: 'theme', thread, color });
      }
      return true;
  },

  async read(ctx) {
    const { sockets, db, p, m, store, pushTail, noteThread, dmThread, findMsg, isFriend, cleanText, newId, lastDm, lastChat, chatImg, attachLabel, threadMuted, push, inbox, save, broadcastHouse, refresh, lastCheer, cheerCount, lastInvite, setTz, focusEnd, focusStart, buddiesOf, quitReward, quitMinutes, caffeineOverlap, recordSession, streakDays, streakBonus, caffeineMinutes, mySessions, bondLevel, PETS, send, groupWatches, houseGroupWatch, watches, dmWatches, endDmWatch, pairKey, parseVideo, room, noteSeen, serverThread, isFocusLength, focusReward, friends, handle, setMute, visitAsks, houseDmWatch } = ctx;
    // read receipt: relayed to the others, and kept as this member's `seen` so unread counts survive a reload
      const thread = m.thread, id = m.id;
      if (typeof thread !== 'string' || !thread || !Number.isFinite(id)) return;
      // The client names a DM by the person; the table names it by the pair.
      const key = serverThread(p, thread);
      // update-only, so a receipt can never invent a conversation that has no messages; coalesced
      // in the cache so a scroll is one write, not one per line
      noteSeen(p.id, key, id);
      // Relay it to whoever else is in that conversation.
      const members = key.startsWith('h:') ? db.houses[key.slice(2)]?.members
        : key.startsWith('g:') ? p.groups?.[key.slice(2)]?.members
          : key.slice(2).split('|');
      for (const memId of members ?? []) if (memId !== p.id) send(sockets.get(memId), { t: 'read', id, by: p.id, at: Date.now() });
      return; // nothing to save and nothing to rebroadcast
  }
};
