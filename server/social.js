// The house, friends-of-the-house, calendar, bell and to-do intents.
//
// Moved out of the switch in index.js, one method per message. Each body is the case it came from:
// `break` became `return true` (the dispatcher then saves and rebroadcasts the house) and a bare
// `return` still skips both. Everything a body reaches for arrives in its context; nothing here
// imports the game server, so the only coupling left is the list of names in `ctxKeys`.
//
// server/handlers.test.js checks that list against every method and against index.js.

import { MAX_NOTES } from '../shared/game.js';

export const ctxKeys = ["ACCESSORIES","BODIES","FACES","HAIRS","ITEMS","MAX_EVENTS","NOTIFY","OUTFITS","SCAR_COLOURS","SCAR_KEYS","SHIRTS","SIZES","SKINS","STYLES","USES","boardMinutes","broadcastHouse","canSee","cleanText","db","ensureHome","friendList","goHome","has","inbox","leaveHouse","m","newId","nextOccurrence","okPushSub","p","pick","positions","push","refresh","remember","save","send","settleTodos","sockets","store","todoFor","usernameProblem","wantsNotify"];

export const social = {
  async look(ctx) {
    const { m, p, usernameProblem, send, sockets, store, save, refresh, friendList, pick, SKINS, HAIRS, SHIRTS, STYLES, FACES, OUTFITS, BODIES, ACCESSORIES, SIZES, SCAR_KEYS, SCAR_COLOURS } = ctx;
    {
          // Your name is your login username, so a new one must be free and username-shaped.
          const name = String(m.name ?? '').trim();
          if (name && name !== p.name) {
            const problem = usernameProblem(name);
            if (problem) send(sockets.get(p.id), { t: 'error', text: `${problem} (Your name is also your username.)` });
            else Promise.resolve(store.renameAccount(p.id, name)).then((ok) => {
              if (!ok) return send(sockets.get(p.id), { t: 'error', text: `"${name}" is taken. Pick another name.` });
              p.name = name;
              send(sockets.get(p.id), { t: 'renamed', name });
              save();
              refresh(p.id, ...friendList(p).map((f) => f.id));
            }).catch((err) => console.error('rename failed', err));
          }
          p.look = {
            skin: pick(SKINS, m.look?.skin, p.look.skin),
            hair: pick(HAIRS, m.look?.hair, p.look.hair),
            shirt: pick(SHIRTS, m.look?.shirt, p.look.shirt),
            style: pick(STYLES, m.look?.style, p.look.style ?? STYLES[0]),
            face: pick(FACES, m.look?.face, p.look.face ?? FACES[0]),
            outfit: pick(OUTFITS, m.look?.outfit, p.look.outfit ?? OUTFITS[0]),
            body: pick(BODIES, m.look?.body, p.look.body ?? BODIES[0]),
            // Accessories stack, so they arrive as a list, each with its own tint under look.color[`acc:<name>`]. An older
            // client only knows the single acc, which becomes a list of one.
            accs: (Array.isArray(m.look?.accs) ? m.look.accs
              : typeof m.look?.acc === 'string' ? [m.look.acc] : p.look.accs ?? [])
              .filter((a, i, list) => a !== 'none' && ACCESSORIES.includes(a) && list.indexOf(a) === i),
            size: pick(SIZES, m.look?.size, p.look.size ?? SIZES[1]),
            // A custom tint overrides the swatch colour for hair and outfit. The client always sends the whole map, so a part
            // set back to a swatch simply arrives without its tint and the override is dropped. A skin tint is never kept:
            // skin has no custom colour any more, and an old client must not be able to put one back. A scar only ever takes
            // black, dark red or one of the skin tones, whatever a client sends.
            color: Object.fromEntries(Object.entries(m.look?.color ?? {}).filter(([k, v]) => k !== 'skin'
              && (!SCAR_KEYS.has(k) || SCAR_COLOURS.includes(v) || SKINS.includes(v)))),
          };
          return true;
        }
  },

  async join(ctx) {
    const { m, db, send, sockets, p, leaveHouse, settleTodos, remember, positions } = ctx;
    {
          const code = String(m.code ?? '').toUpperCase();
          if (!db.houses[code]) return send(sockets.get(p.id), { t: 'error', text: 'No house with that code.' });
          if (code === p.house) return;
          if (db.houses[code].banned?.includes(p.id)) return send(sockets.get(p.id), { t: 'error', text: "The owner removed you from that house, so you can't join it." });
          leaveHouse(p);
          db.houses[code].members.push(p.id);
          p.house = code;
          settleTodos(db.houses[code]);
          remember(p, code);
          positions.delete(p.id);
          return true;
        }
  },

  async forget(ctx) {
    const { p, m } = ctx;
    p.visited = (p.visited ?? []).filter((c) => c !== m.code);
          return true;
  },

  async kick(ctx) {
    const { db, p, m, leaveHouse, goHome, positions, broadcastHouse, send, sockets } = ctx;
    { // a home's owner removes someone; they go back to their own home and can't rejoin until allowed back
          const h = db.houses[p.home], them = db.players[m.id];
          if (!h || h.owner !== p.id || !them || them.id === p.id) return;
          h.banned = [...new Set([...(h.banned ?? []), them.id])];
          them.visited = (them.visited ?? []).filter((c) => c !== h.code);
          if (them.house === h.code) {
            leaveHouse(them);
            goHome(them);
            positions.delete(them.id);
            broadcastHouse(them.house);
            send(sockets.get(them.id), { t: 'error', text: `${p.name} removed you from their house. You're back home.` });
          }
          return true;
        }
  },

  async unban(ctx) {
    const { db, p, m } = ctx;
    { // allow someone back
          const h = db.houses[p.home];
          if (!h || h.owner !== p.id) return;
          h.banned = (h.banned ?? []).filter((id) => id !== m.id);
          return true;
        }
  },

  async leave(ctx) {
    const { ensureHome, p, remember, leaveHouse, goHome, positions } = ctx;
    ensureHome(p);
          if (p.house === p.home) return;
          remember(p, p.house); // also covers houses joined before history existed
          leaveHouse(p);
          goHome(p);
          positions.delete(p.id);
          return true;
  },

  async subject_save(ctx) {
    const { cleanText, m, p } = ctx;
    {
          const tag = cleanText(m.tag, 24);
          if (!tag) return;
          p.subjects = [tag, ...(p.subjects ?? []).filter((t) => t !== tag)].slice(0, 12);
          p.hiddenSubjects = (p.hiddenSubjects ?? []).filter((t) => t !== tag);
          return true;
        }
  },

  async subject_remove(ctx) {
    const { cleanText, m, p } = ctx;
    {
          const tag = cleanText(m.tag, 24);
          p.subjects = (p.subjects ?? []).filter((t) => t !== tag);
          p.hiddenSubjects = [tag, ...(p.hiddenSubjects ?? []).filter((t) => t !== tag)].slice(0, 50);
          return true;
        }
  },

  async leaderboard(ctx) {
    const { m, db, p, friendList, boardMinutes, send, sockets, store } = ctx;
    {
          // Ranked by focused minutes, this week (last 7 days) or all time; house only, friends, everyone, or houses.
          // The minutes are summed from the session log and its roll-up, never from a number kept on a row.
          // metric: 'coins' ranks the same pools by the coins they hold right now — a balance, not a total, so the
          // period does not apply and nothing is summed from a table.
          const byCoins = m.metric === 'coins';
          const since = m.period === 'all' ? 0 : Date.now() - 7 * 86_400_000;
          const pool = m.scope === 'all' ? Object.values(db.players)
            : m.scope === 'friends' ? [p, ...friendList(p).filter((f) => f.status === 'friend').map((f) => db.players[f.id])].filter(Boolean)
              : m.scope === 'houses' ? [] : db.houses[p.house].members.map((id) => db.players[id]).filter(Boolean);
          // null means everyone, which is the only pool too big to name.
          const ids = m.scope === 'all' ? null
            : m.scope === 'houses' ? [...new Set(Object.values(db.houses).filter((h) => h.owner && h.members.length).flatMap((h) => h.members))]
              : pool.map((o) => o.id);
          if (byCoins) {
            // A balance lives on the account. A player who is not online is only a stub in the world, so their
            // purse comes from the accounts table, not from the row the board never loaded.
            const held = (await store.coinTotals?.(ids)) ?? {};
            const purse = (id) => { const o = db.players[id]; return o && !o.__stub && o.coins != null ? o.coins : (held[id] ?? 0); };
            const rows = (m.scope === 'houses'
              ? Object.values(db.houses).filter((h) => h.owner && h.members.length > 0)
                .map((h) => ({ name: h.ownerName ?? 'Unnamed house', members: h.members.length, coins: h.members.reduce((n, id) => n + purse(id), 0), me: h.code === p.house }))
              : pool.map((o) => ({ name: o.name, me: o.id === p.id, coins: purse(o.id) })))
              .filter((r) => r.coins > 0 || r.me)
              .sort((a, b) => b.coins - a.coins)
              .slice(0, 25);
            return send(sockets.get(p.id), { t: 'leaderboard', metric: 'coins', scope: m.scope, period: m.period, rows });
          }
          const minutes = await boardMinutes(since, ids, `${m.scope}|${m.period}|${ids ? [...ids].sort().join(',') : '*'}`);
          const sumOf = (members) => members.reduce((n, id) => n + (minutes[id] ?? 0), 0);
          let rows;
          if (m.scope === 'houses') {
            rows = Object.values(db.houses).filter((h) => h.owner && h.members.length > 0)
              .map((h) => ({ name: h.ownerName ?? 'Unnamed house', members: h.members.length, minutes: sumOf(h.members), me: h.code === p.house }))
              .filter((r) => r.minutes > 0 || r.me)
              .sort((a, b) => b.minutes - a.minutes)
              .slice(0, 25);
          } else {
            rows = pool
              .map((o) => ({ name: o.name, me: o.id === p.id, minutes: minutes[o.id] ?? 0 }))
              .filter((r) => r.minutes > 0 || r.me)
              .sort((a, b) => b.minutes - a.minutes)
              .slice(0, 25);
          }
          return send(sockets.get(p.id), { t: 'leaderboard', metric: 'minutes', scope: m.scope, period: m.period, rows });
        }
  },

  async pos(ctx) {
    const { m, USES, positions, p, db, send, sockets } = ctx;
    if (Number.isFinite(m.x) && Number.isFinite(m.y)) {
            // use: what they're doing with the furniture in front of them (watering, reading...), if anything.
            const use = USES.includes(m.use) ? m.use : undefined;
            positions.set(p.id, { x: m.x, y: m.y, use });
            for (const id of db.houses[p.house].members) {
              if (id !== p.id) send(sockets.get(id), { t: 'pos', id: p.id, x: m.x, y: m.y, use });
            }
          }
          return;
  },

  async event_add(ctx) {
    const { db, p, cleanText, m, newId, MAX_EVENTS } = ctx;
    {
          const h = db.houses[p.house], text = cleanText(m.text, 60);
          if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(m.date ?? '') || (m.time && !/^\d{2}:\d{2}$/.test(m.time))) return;
          const ev = { id: newId(), date: m.date, time: m.time || undefined, text, by: p.name };
          const add = (list) => [...(list ?? []), ev].sort((a, b) => `${a.date}${a.time ?? ''}`.localeCompare(`${b.date}${b.time ?? ''}`)).slice(-MAX_EVENTS);
          if (m.scope === 'house') h.events = add(h.events);
          else p.events = add(p.events);
          return true;
        }
  },

  async event_del(ctx) {
    const { db, p, m } = ctx;
    {
          const h = db.houses[p.house];
          if (m.scope === 'house') h.events = (h.events ?? []).filter((e) => e.id !== m.id);
          else p.events = (p.events ?? []).filter((e) => e.id !== m.id);
          return true;
        }
  },

  async announcement_add(ctx) {
    const { db, p, send, sockets, cleanText, m, newId, inbox, push } = ctx;
    {
          const h = db.houses[p.house];
          // Only house owner can post announcements
          if (h.owner !== p.id) return send(sockets.get(p.id), { t: 'error', text: 'Only the house owner can post announcements.' });
          const text = cleanText(m.text, 500);
          if (!text) return;
          h.announcements ??= [];
          const announcement = { id: newId(), text, by: p.name, byId: p.id, at: Date.now() };
          h.announcements.unshift(announcement);
          // Keep only latest 10
          h.announcements = h.announcements.slice(0, 10);
          // Notify all house members
          for (const id of h.members) {
            if (id !== p.id) {
              const member = db.players[id];
              inbox(member, 'announcement', p, `posted an announcement`);
              if (!sockets.has(id)) push(member, { title: `📢 ${h.name} announcement`, body: `${p.name}: ${text.slice(0, 100)}`, tag: `announcement-${announcement.id}`, open: 'bell' }, 'house');
            }
          }
          return true;
        }
  },

  async announcement_del(ctx) {
    const { db, p, send, sockets, m } = ctx;
    {
          const h = db.houses[p.house];
          // Only house owner can delete announcements
          if (h.owner !== p.id) return send(sockets.get(p.id), { t: 'error', text: 'Only the house owner can delete announcements.' });
          h.announcements = (h.announcements ?? []).filter((a) => a.id !== m.id);
          return true;
        }
  },

  async inbox_read(ctx) {
    const { p, save } = ctx;
    p.inboxSeen = Date.now();
          save();
          return;
  },

  async inbox_clear(ctx) {
    const { p, save, send, sockets } = ctx;
    p.inbox = [];
          save();
          return send(sockets.get(p.id), { t: 'inbox', inbox: [] });
  },

  async tip_seen(ctx) {
    const { has, ITEMS, m, p, save } = ctx;
    if (!has(ITEMS, m.id)) return;
          p.tipsSeen = [...new Set([...(p.tipsSeen ?? []), m.id])];
          save();
          return;
  },

  async notes_read(ctx) {
    const { p } = ctx;
    // Seen, not gone: the Notes tab keeps what arrived, and only its Clear removes it.
    p.notes = (p.notes ?? []).map((n) => (n.seen ? n : { ...n, seen: true }));
          return true;
  },

  async notes_clear(ctx) {
    const { p, m } = ctx;
    if (m.side === 'out') p.sentNotes = [];
    else p.notes = [];
          return true;
  },

  async scratch_add(ctx) {
    const { p, m, cleanText, newId } = ctx;
    { // a note in my own notebook: private, and capped like a desk
          const text = cleanText(m.text, 280);
          if (!text) return;
          p.scratch = [...(p.scratch ?? []), { id: newId(), text, at: Date.now() }].slice(-MAX_NOTES);
          return true;
        }
  },

  async scratch_edit(ctx) {
    const { p, m, cleanText } = ctx;
    { // only my own notes, and only the text; the id and the day it was started stay
          const text = cleanText(m.text, 280);
          const note = (p.scratch ?? []).find((n) => n.id === m.id);
          if (!note || !text) return;
          note.text = text;
          note.editedAt = Date.now();
          return true;
        }
  },

  async scratch_del(ctx) {
    const { p, m } = ctx;
    p.scratch = (p.scratch ?? []).filter((n) => n.id !== m.id);
          return true;
  },

  async todo_add(ctx) {
    const { db, p, cleanText, m, send, sockets, newId, inbox, push } = ctx;
    {
          const h = db.houses[p.house];
          const text = cleanText(m.text, 120);
          h.todos ??= [];
          if (!text) return;
          if (h.todos.length >= 60) return send(sockets.get(p.id), { t: 'error', text: 'The house list is full (60). Clear some done ones first.' });
          // Optional reminder time (ms), and who it's for: everyone, or picked housemates (just me if nobody was picked).
          const at = Number.isFinite(m.at) && m.at > Date.now() - 60_000 && m.at < Date.now() + 2 * 365 * 86_400_000 ? m.at : undefined;
          const to = m.all ? undefined : [...new Set(Array.isArray(m.to) ? m.to : [])].filter((id) => h.members.includes(id));
          if (to && !to.length) to.push(p.id);
          // Recurrence: daily, weekly, monthly
          const repeat = ['daily', 'weekly', 'monthly'].includes(m.repeat) ? m.repeat : undefined;
          const repeatUntil = Number.isFinite(m.repeatUntil) && m.repeatUntil > Date.now() ? m.repeatUntil : undefined;
          // Priority: low, medium, high
          const priority = ['low', 'medium', 'high'].includes(m.priority) ? m.priority : undefined;
          const newTodo = { id: newId(), text, done: false, by: p.name, byId: p.id, ticks: [], ...(m.all ? { all: true } : { to }), ...(at ? { at } : {}), ...(repeat ? { repeat } : {}), ...(repeatUntil ? { repeatUntil } : {}), ...(priority ? { priority } : {}) };
          h.todos.push(newTodo);
          // Notify assignees (but not the creator)
          if (to) {
            for (const id of to) {
              if (id !== p.id) {
                const assignee = db.players[id];
                inbox(assignee, 'todo', p, `assigned you: “${text}”`);
                if (sockets.has(id)) send(sockets.get(id), { t: 'todo_assigned', by: p.name, text, id: newTodo.id });
                if (!sockets.has(id)) push(assignee, { title: '📋 Task assigned', body: `${p.name} assigned you: ${text}`, tag: `todo-${newTodo.id}`, open: 'todos' }, 'todo');
              }
            }
          }
          return true;
        }
  },

  async notify_prefs(ctx) {
    const { p, NOTIFY, m, wantsNotify } = ctx;
    { // which notifications I want (only the kinds we know, as true/false)
          p.notify = Object.fromEntries(Object.keys(NOTIFY).map((k) => [k, typeof m.prefs?.[k] === 'boolean' ? m.prefs[k] : wantsNotify(p.notify, k)]));
          return true;
        }
  },

  async push_sub(ctx) {
    const { okPushSub, m, p, save } = ctx;
    { // this device wants reminders while Auralis is closed (a few devices per player)
          if (!okPushSub(m.sub)) return;
          const sub = { endpoint: m.sub.endpoint, keys: { p256dh: m.sub.keys.p256dh, auth: m.sub.keys.auth } };
          p.pushSubs = [...(p.pushSubs ?? []).filter((x) => x.endpoint !== sub.endpoint), sub].slice(-5);
          save();
          return;
        }
  },

  async todo_edit(ctx) {
    const { db, p, m, cleanText, todoFor, inbox, sockets, send, push, settleTodos } = ctx;
    { // only whoever made it: new words, time, or people (people who stay on keep their ticks)
          const h = db.houses[p.house], t = h.todos?.find((x) => x.id === m.id), text = cleanText(m.text, 120);
          if (!t || t.byId !== p.id || !text) return;
          const at = m.at === t.at || (Number.isFinite(m.at) && m.at > Date.now() - 60_000 && m.at < Date.now() + 2 * 365 * 86_400_000) ? m.at : undefined;
          if (at !== t.at) delete t.reminded; // a new time gets its own reminder
          const oldAssignees = t.to ? [...t.to] : [];
          t.text = text;
          if (at) t.at = at; else delete t.at;
          // Recurrence
          if (['daily', 'weekly', 'monthly'].includes(m.repeat)) t.repeat = m.repeat;
          else if (m.repeat === null) delete t.repeat;
          if (Number.isFinite(m.repeatUntil) && m.repeatUntil > Date.now()) t.repeatUntil = m.repeatUntil;
          else if (m.repeatUntil === null) delete t.repeatUntil;
          // Priority
          if (['low', 'medium', 'high'].includes(m.priority)) t.priority = m.priority;
          else if (m.priority === null) delete t.priority;
          if (m.all) { t.all = true; delete t.to; }
          else {
            const to = [...new Set(Array.isArray(m.to) ? m.to : [])].filter((id) => h.members.includes(id));
            t.to = to.length ? to : [p.id];
            delete t.all;
          }
          t.ticks = (t.ticks ?? []).filter((id) => todoFor(t, h).includes(id));
          // Notify newly added assignees
          const newAssignees = t.to ? t.to.filter((id) => !oldAssignees.includes(id)) : [];
          for (const id of newAssignees) {
            if (id !== p.id) {
              const assignee = db.players[id];
              inbox(assignee, 'todo', p, `assigned you: “${text}”`);
              if (sockets.has(id)) send(sockets.get(id), { t: 'todo_assigned', by: p.name, text, id: t.id });
              if (!sockets.has(id)) push(assignee, { title: '📋 Task assigned', body: `${p.name} assigned you: ${text}`, tag: `todo-${t.id}`, open: 'todos' }, 'todo');
            }
          }
          if (t.all) settleTodos(h);
          else t.done = todoFor(t, h).every((id) => t.ticks.includes(id));
          return true;
        }
  },

  async todo_toggle(ctx) {
    const { db, p, m, canSee, todoFor, settleTodos, inbox, sockets, send, push, nextOccurrence, newId } = ctx;
    { // each person it's for ticks their own part; it's done once they all have
          const h = db.houses[p.house], t = h.todos?.find((x) => x.id === m.id);
          if (!t || !canSee(t, h, p.id)) return;
          if (!t.all && !t.to) { t.done = !t.done; return true; } // older shared to-dos: one tick for everyone
          if (!todoFor(t, h).includes(p.id)) return;
          const wasDone = t.done;
          t.ticks = t.ticks.includes(p.id) ? t.ticks.filter((id) => id !== p.id) : [...t.ticks, p.id];
          if (t.all) settleTodos(h);
          else t.done = todoFor(t, h).every((id) => t.ticks.includes(id));
          // Notify creator when task is completed (not when undone)
          if (t.done && !wasDone && t.byId && t.byId !== p.id) {
            const creator = db.players[t.byId];
            inbox(creator, 'todo', p, `completed “${t.text}”`);
            if (sockets.has(t.byId)) send(sockets.get(t.byId), { t: 'todo_completed', by: p.name, text: t.text, id: t.id });
            if (!sockets.has(t.byId)) push(creator, { title: '✅ Task completed', body: `${p.name} completed: ${t.text}`, tag: `todo-${t.id}`, open: 'todos' }, 'todo');
          }
          // Handle recurring tasks: when completed, create next occurrence
          if (t.done && !wasDone && t.repeat && (!t.repeatUntil || Date.now() < t.repeatUntil)) {
            const nextAt = t.at ? nextOccurrence(t.at, t.repeat) : undefined;
            if (nextAt && (!t.repeatUntil || nextAt < t.repeatUntil)) {
              const nextTodo = { id: newId(), text: t.text, done: false, by: t.by, byId: t.byId, ticks: [], ...(t.all ? { all: true } : { to: t.to }), ...(nextAt ? { at: nextAt } : {}), repeat: t.repeat, repeatUntil: t.repeatUntil, parentId: t.id };
              h.todos.push(nextTodo);
            }
          }
          return true;
        }
  },

  async todo_del(ctx) {
    const { db, p, m } = ctx;
    { // only whoever made it (older ones without a maker: anyone)
          const h = db.houses[p.house];
          h.todos = (h.todos ?? []).filter((x) => x.id !== m.id || (x.byId && x.byId !== p.id));
          return true;
        }
  },

  async ptodo_add(ctx) {
    const { cleanText, m, p, send, sockets, newId } = ctx;
    {
          const text = cleanText(m.text, 120);
          p.todos ??= [];
          if (!text) return;
          if (p.todos.length >= 60) return send(sockets.get(p.id), { t: 'error', text: 'Your list is full (60). Clear some done ones first.' });
          p.todos.push({ id: newId(), text, done: false });
          return true;
        }
  },

  async ptodo_toggle(ctx) {
    const { p, m } = ctx;
    {
          const t = p.todos?.find((x) => x.id === m.id);
          if (!t) return;
          t.done = !t.done;
          return true;
        }
  },

  async ptodo_del(ctx) {
    const { p, m } = ctx;
    {
          p.todos = (p.todos ?? []).filter((x) => x.id !== m.id);
          return true;
        }
  },
};
