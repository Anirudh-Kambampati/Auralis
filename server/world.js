// The room, shop, furniture and pet intents.
//
// Moved out of the switch in index.js, one method per message. Each body is the case it came from:
// `break` became `return true` (the dispatcher then saves and rebroadcasts the house) and a bare
// `return` still skips both. Everything a body reaches for arrives in its context; nothing here
// imports the game server, so the only coupling left is the list of names in `ctxKeys`.
//
// server/handlers.test.js checks that list against every method and against index.js.

export const ctxKeys = ["CLAW_COOLDOWN_MS","CLAW_COST","CRAFT","CRAFT_COOLDOWN_MS","DRINKS","EXPAND_COST","FLOORS","FLOOR_STYLES","GIFTS_PER_DAY","GIFT_COINS","GUEST_BOND_STEP","ITEMS","LIGHTS","MAX_PETS","MAX_ROOMS","PETS","PET_ACCS","ROOM_COST","WALLPAPERS","WALL_PATTERNS","addGuestBond","guestBond","broadcastHouse","canPlace","canRotate","cheerCount","clawPrize","cleanText","colorsFor","craftColour","craftItem","craftedPrice","db","discounted","has","inbox","isPlant","lastCheer","lastInvite","m","newRoom","nextRot","p","petLine","petWord","pick","pieceReadyAt","placeSwaps","readyKey","room","save","sellPrice","send","setPieceReady","sockets"];

export const world = {
  async buy(ctx) {
    const { has, ITEMS, m, discounted, p } = ctx;
    {
          if (!has(ITEMS, m.item)) return;
          const it = ITEMS[m.item];
          const price = discounted(it.price, p.discount);
          if (p.coins < price) return;
    
          p.coins -= price;
          p.discount = false;
          p.inventory[m.item] = (p.inventory[m.item] ?? 0) + 1;
          return true;
        }
  },

  async sell(ctx) {
    const { has, ITEMS, m, sellPrice, p } = ctx;
    { // from storage only: placed pieces have to be put away first
          if (!has(ITEMS, m.item)) return;
          const gain = sellPrice(m.item);
          if (!(p.inventory[m.item] > 0) || gain < 1) return;
          p.inventory[m.item]--;
          p.coins += gain;
          return true;
        }
  },

  async sell_crafted(ctx) {
    const { p, m, craftedPrice } = ctx;
    { // a handmade or gifted piece: one specific instance, at a quarter of catalog price
          const list = p.crafted ?? [];
          const piece = Number.isInteger(m.index) ? list[m.index] : null;
          if (!piece) return;
          const gain = craftedPrice(piece.item);
          if (gain < 1) return;
          p.crafted = [...list.slice(0, m.index), ...list.slice(m.index + 1)];
          p.coins += gain;
          return true;
        }
  },

  async gift_item(ctx) {
    const { has, ITEMS, m, p, db, inbox, send, sockets, save, broadcastHouse } = ctx;
    { // hand a stored piece (a claw prize, say) to a housemate
          if (!has(ITEMS, m.item) || !(p.inventory[m.item] > 0)) return;
          const to = db.houses[p.house].members.includes(m.to) ? db.players[m.to] : null;
          if (!to || to.id === p.id) return;
          p.inventory[m.item]--;
          to.inventory[m.item] = (to.inventory[m.item] ?? 0) + 1;
          inbox(to, 'gift', p, `gave you a ${ITEMS[m.item].name.toLowerCase()}`);
          send(sockets.get(to.id), { t: 'gift_item', item: m.item, from: p.name });
          send(sockets.get(p.id), { t: 'gift_item', item: m.item, to: to.id });
          save();
          broadcastHouse(p.house);
          return true;
        }
  },

  async place(ctx) {
    const { has, ITEMS, m, p, canPlace, room, save, placeSwaps, isPlant } = ctx;
    {
          if (!has(ITEMS, m.item)) return;
          if (m.crafted) { // a handmade piece is one specific instance, so it is placed rather than counted
            const list = p.crafted ?? [];
            const at = list.findIndex((e) => e.item === m.item);
            if (at < 0) return;
            if (!canPlace(room, m.item, m.x, m.y)) return;
            const piece = list[at];
            p.crafted = [...list.slice(0, at), ...list.slice(at + 1)];
            room.furniture.push({ item: m.item, x: m.x, y: m.y, col: piece.col });
            save();
            return true;
          }
          if (!(p.inventory[m.item] > 0)) return;
          const out = placeSwaps(room, m.item, m.x, m.y);
          if (!out) return;
          p.inventory[m.item]--;
          for (const f of room.furniture.filter((_, i) => out.includes(i))) p.inventory[f.item] = (p.inventory[f.item] ?? 0) + 1;
          room.furniture = room.furniture.filter((_, i) => !out.includes(i));
          room.furniture.push({ item: m.item, x: m.x, y: m.y, ...(isPlant(m.item) ? { wateredAt: Date.now() } : {}) });
          return true;
        }
  },

  async move(ctx) {
    const { room, m, canPlace } = ctx;
    {
          const f = room.furniture[m.index];
          const rest = { ...room, furniture: room.furniture.filter((_, i) => i !== m.index) };
          if (!f || !canPlace(rest, f.item, m.x, m.y, f.rot)) return;
          f.x = m.x;
          f.y = m.y;
          return true;
        }
  },

  async pickup(ctx) {
    const { room, m, p } = ctx;
    {
          const f = room.furniture[m.index];
          if (!f) return;
          room.furniture.splice(m.index, 1);
          p.inventory[f.item] = (p.inventory[f.item] ?? 0) + 1;
          return true;
        }
  },

  async gift(ctx) {
    const { db, p, m, GIFT_COINS, GIFTS_PER_DAY, send, sockets, inbox } = ctx;
    { // send a housemate some coins, a few times a day
          const them = db.houses[p.house].members.includes(m.to) && m.to !== p.id ? db.players[m.to] : null;
          if (!them || p.coins < GIFT_COINS) return;
          const day = new Date().toDateString();
          if (p.giftDay !== day) { p.giftDay = day; p.giftsSent = 0; }
          if (p.giftsSent >= GIFTS_PER_DAY) return send(sockets.get(p.id), { t: 'error', text: `You can send ${GIFTS_PER_DAY} gifts a day. Try again tomorrow!` });
          p.giftsSent++;
          p.coins -= GIFT_COINS;
          them.coins += GIFT_COINS;
          send(sockets.get(p.id), { t: 'reward', text: `🎁 Sent ${them.name} ${GIFT_COINS} coins.` });
          send(sockets.get(them.id), { t: 'reward', text: `🎁 ${p.name} sent you ${GIFT_COINS} coins!` });
          inbox(them, 'gift', p, `sent you ${GIFT_COINS} coins`);
          return true;
        }
  },

  async feed(ctx) {
    const { db, p, m, addGuestBond, GUEST_BOND_STEP, send, sockets, inbox, petWord } = ctx;
    { // anyone in the house can fill a pet bowl; it feeds that room owner's pets (hearts float over them)
          const owner = db.houses[p.house].members.includes(m.owner) ? db.players[m.owner] : null;
          if (owner?.rooms[m.r]?.furniture[m.index]?.item !== 'foodBowl' || !owner.pets?.length) return;
          owner.fedAt = Date.now();
          const fedPets = (owner.pets ?? []).filter((x) => !x.away);
          if (owner.id !== p.id) {
            // Filling someone else's bowl is a gift to their pets: they remember who did it.
            for (const pet of fedPets) addGuestBond(pet, p.id, GUEST_BOND_STEP.feed);
            send(sockets.get(owner.id), { t: 'reward', text: `🐾 ${p.name} fed your pets.` });
            inbox(owner, 'pet', p, 'fed your pets');
            if (fedPets.length) send(sockets.get(p.id), { t: 'info', text: `🍲 You filled the bowl — ${petWord(fedPets[0])} is happy you did.` });
          }
          return true;
        }
  },

  async note(ctx) {
    const { db, p, m, cleanText, send, sockets, inbox } = ctx;
    { // leave a note on a housemate's desk; they see it now, or next time they log in
          const them = db.houses[p.house].members.includes(m.to) && m.to !== p.id ? db.players[m.to] : null;
          const text = cleanText(m.text, 140);
          if (!them || !text) return;
          them.notes = [...(them.notes ?? []), { from: p.name, text, at: Date.now() }].slice(-10);
          send(sockets.get(p.id), { t: 'reward', text: `📝 Left a note on ${them.name}'s desk.` });
          inbox(them, 'note', p, `left a note on your desk: “${text}”`);
          return true;
        }
  },

  async cheer(ctx) {
    const { db, p, m, lastCheer, cheerCount, send, sockets } = ctx;
    { // a little 👏 over a housemate who's studying, at most every few seconds
          const h = db.houses[p.house], them = h.members.includes(m.to) && m.to !== p.id ? db.players[m.to] : null;
          if (!them?.focus || Date.now() - (lastCheer.get(p.id) ?? 0) < 5000) return;
          lastCheer.set(p.id, Date.now());
          const count = (cheerCount.get(them.id) ?? 0) + 1;
          cheerCount.set(them.id, count);
          for (const id of h.members) send(sockets.get(id), { t: 'cheer', from: p.name, to: them.id });
          return; // nothing saved, nothing to rebroadcast
        }
  },

  async invite(ctx) {
    const { db, p, m, lastInvite, send, sockets, inbox } = ctx;
    { // I'm studying and a housemate isn't: ask them along (they can join and end when I do)
          const h = db.houses[p.house], them = h.members.includes(m.to) && m.to !== p.id ? db.players[m.to] : null;
          if (!them || them.focus || !p.focus || p.focus.pausedAt) return;
          const key = `${p.id}>${them.id}`, now = Date.now();
          if (now - (lastInvite.get(key) ?? 0) < 30_000) return send(sockets.get(p.id), { t: 'info', text: `You just invited ${them.name}. Give them a moment!` });
          lastInvite.set(key, now);
          send(sockets.get(them.id), { t: 'invite', from: p.id, by: p.name, tag: p.focus.tag ?? 'Study' });
          inbox(them, 'invite', p, `invited you to study ${p.focus.tag ?? 'Study'} together`);
          send(sockets.get(p.id), { t: 'info', text: `Invited ${them.name} to study with you. 📚` });
          return; // nothing saved
        }
  },

  async pat(ctx) {
    const { db, p, m, lastCheer, addGuestBond, GUEST_BOND_STEP, inbox, petWord, send, sockets, petLine, save, broadcastHouse } = ctx;
    { // pet anyone's pet in the house: hearts the whole house sees
          const h = db.houses[p.house], owner = h.members.includes(m.owner) ? db.players[m.owner] : null;
          if (!owner?.pets?.[m.slot] || Date.now() - (lastCheer.get(p.id) ?? 0) < 1500) return;
          lastCheer.set(p.id, Date.now());
          const pet = owner.pets[m.slot];
          let act;
          if (owner.id !== p.id) {
            const bond = addGuestBond(pet, p.id, GUEST_BOND_STEP.pat);
            inbox(owner, 'pet', p, `petted ${petWord(pet)}`);
            const { text, act: lineAct } = petLine(pet, bond);
            send(sockets.get(p.id), { t: 'info', text: text });
            act = lineAct;
          } else {
            pet.bond = (pet.bond ?? 0) + 1; // your own pet warms to you too, slowly
            const { act: lineAct } = petLine(pet, pet.bond ?? 0);
            act = lineAct;
          }
          // A pet napping on a pet sofa stays put until patted twice in a row.
          if (pet.sofa) {
            pet.sofa.pats = (pet.sofa.pats ?? 0) + 1;
            if (pet.sofa.pats >= 2) {
              pet.sofa = undefined;
              broadcastHouse(p.house); // tell every client the pet woke up
            }
          }
          const patMsg = { t: 'pat', owner: owner.id, slot: m.slot, by: p.id, name: p.name };
          if (act) patMsg.act = act;
          for (const id of h.members) send(sockets.get(id), patMsg);
          save(); return; // bond is private to the pet row; every member already got the pat message
        }
  },

  async pet_sofa(ctx) {
    const { db, p, m, save, guestBond, ITEMS } = ctx;
    const owner = db.houses[p.house].members.includes(m.owner) ? db.players[m.owner] : null;
    const f = owner?.rooms?.[m.r ?? 0]?.furniture?.[m.index];
    if (!f || ITEMS[f.item]?.pet !== 'sleep') return;
    const mine = p.id === owner?.id;
    const candidates = (owner.pets ?? []).filter((x) => !x.away && !x.sofa && (mine || guestBond(x, p.id) > 0));
    if (!candidates.length) return;
    // The pet this guest is most bonded with answers first; the owner's own pets all count.
    candidates.sort((a, b) => (mine ? 0 : guestBond(b, p.id)) - (mine ? 0 : guestBond(a, p.id)));
    const pet = candidates[0];
    // One pet per bed/sofa: nothing can already be napping on it.
    const taken = (owner.pets ?? []).some((x) => x.sofa && x.sofa.r === m.r && x.sofa.index === m.index);
    if (taken) return;
    pet.sofa = { r: m.r ?? 0, index: m.index, pats: 0 };
    return true;
  },

  async fetch(ctx) {
    const { m, lastCheer, p, db, addGuestBond, GUEST_BOND_STEP, send, sockets, save } = ctx;
    { // threw the pet ball: the thrower's pets (or the room owner's) run for it
          if (![m.x, m.y].every(Number.isInteger) || Date.now() - (lastCheer.get(p.id) ?? 0) < 3000) return;
          lastCheer.set(p.id, Date.now());
          // A ball thrown for someone else's pets counts as playing with them.
          const owner = db.houses[p.house].members.includes(m.owner) ? db.players[m.owner] : null;
          if (owner && owner.id !== p.id) for (const pet of owner.pets ?? []) if (!pet.away) addGuestBond(pet, p.id, GUEST_BOND_STEP.fetch);
          for (const id of db.houses[p.house].members) send(sockets.get(id), { t: 'fetch', by: p.id, owner: m.owner, x: m.x, y: m.y });
          save(); return; // pets animate from the fetch message; no shared state to rebroadcast
        }
  },

  async highfive(ctx) {
    const { db, p, m, lastCheer, send, sockets, inbox } = ctx;
    { // both of us idle: a high five the whole house sees
          const h = db.houses[p.house], them = h.members.includes(m.to) && m.to !== p.id ? db.players[m.to] : null;
          if (!them || p.focus || them.focus || Date.now() - (lastCheer.get(p.id) ?? 0) < 3000) return;
          lastCheer.set(p.id, Date.now());
          // Pets of both players play together
          const petPlay = { from: p.id, to: them.id };
          for (const id of h.members) send(sockets.get(id), { t: 'highfive', from: p.id, to: them.id, by: p.name, petPlay });
          inbox(them, 'highfive', p, 'high-fived you');
          return;
        }
  },

  async exam_add(ctx) {
    const { cleanText, m, p } = ctx;
    { // an exam date to count down to; housemates see it on your desk calendar
          const subject = cleanText(m.subject, 24), at = Date.parse(`${m.date}T00:00:00`);
          if (!subject || !/^\d{4}-\d{2}-\d{2}$/.test(m.date ?? '') || !(at > Date.now() - 86_400_000) || at > Date.now() + 2 * 365 * 86_400_000) return;
          p.exams = [...(p.exams ?? []).filter((e) => Date.parse(`${e.date}T00:00:00`) > Date.now() - 86_400_000), { subject, date: m.date }]
            .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
          return true;
        }
  },

  async exam_del(ctx) {
    const { p, m } = ctx;
    p.exams = (p.exams ?? []).filter((_, i) => i !== m.index);
          return true;
  },

  async light(ctx) {
    const { db, p, m, LIGHTS } = ctx;
    { // switch a lamp on or off — anyone in the house can reach any room's lamps
          const owner = db.houses[p.house].members.includes(m.owner) ? db.players[m.owner] : null;
          const f = owner?.rooms[m.r ?? 0]?.furniture[m.index];
          if (!f || !LIGHTS.has(f.item)) return;
          f.off = !f.off || undefined;
          return true;
        }
  },

  async curtains(ctx) {
    const { room } = ctx;
    room.curtains = !room.curtains;
          return true;
  },

  async water(ctx) {
    const { db, p, m, isPlant } = ctx;
    { // anyone in the house can water anyone's plants
          const owner = db.houses[p.house].members.includes(m.owner) ? db.players[m.owner] : null;
          const f = owner?.rooms[m.r]?.furniture[m.index];
          if (!f || !isPlant(f.item)) return;
          f.wateredAt = Date.now();
          return true;
        }
  },

  async brew(ctx) {
    const { db, p, m, has, DRINKS, save, broadcastHouse } = ctx;
    { // coffee machine, coffee cup or energy can: 10 minutes of caffeine, free
          const owner = db.houses[p.house].members.includes(m.owner) ? db.players[m.owner] : null;
          const f = owner?.rooms?.[m.r ?? 0]?.furniture[m.index];
          const drink = f && has(DRINKS, f.item) ? DRINKS[f.item] : null;
          if (!owner || !drink) return;
          const now = Date.now();
          // The window belongs to whoever drinks, not to whoever owns the machine: a housemate using my coffee
          // machine gets their own ten minutes, and I keep mine.
          if (drink.caffeine) {
            // Already caffeinated: top the timer back up rather than opening a second window.
            if (!(p.caffeineUntil > now)) p.caffeineSince = now;
            p.caffeineUntil = Math.max(p.caffeineUntil ?? 0, now + drink.caffeine * 60_000);
          }
          // Wine rests rather than caffeinating; the client starts the break.
          if (drink.tipsy) p.tipsyUntil = now + (drink.rest ?? 2) * 60_000;
          save();
          broadcastHouse(p.house); // the flame is visible to housemates
          return true;
        }
  },

  async claw(ctx) {
    const { db, p, m, readyKey, pieceReadyAt, send, sockets, CLAW_COST, setPieceReady, CLAW_COOLDOWN_MS, clawPrize, save, ITEMS, broadcastHouse } = ctx;
    { // 5 coins for a weighted prize, then this player's wait on the machine starts
          const owner = db.houses[p.house].members.includes(m.owner) ? db.players[m.owner] : null;
          const f = owner?.rooms?.[m.r ?? 0]?.furniture?.[m.index];
          if (!f || f.item !== 'clawMachine') return;
          const now = Date.now(), key = readyKey(m.r ?? 0, m.index, f.item);
          if (pieceReadyAt(p, key, now)) return send(sockets.get(p.id), { t: 'error', text: 'The claw is resetting. Try again in a few minutes.' });
          if (p.coins < CLAW_COST) return send(sockets.get(p.id), { t: 'error', text: `The claw costs ${CLAW_COST} coins.` });
          p.coins -= CLAW_COST;
          setPieceReady(p, key, now + CLAW_COOLDOWN_MS);
          const prize = clawPrize();
          p.inventory[prize.item] = (p.inventory[prize.item] ?? 0) + 1;
          save();
          send(sockets.get(p.id), { t: 'reward', text: `🕹️ The claw dropped a ${ITEMS[prize.item].name}! It's in your Storage.` });
          broadcastHouse(p.house);
          return true;
        }
  },

  async craft(ctx) {
    const { db, p, m, has, CRAFT, readyKey, pieceReadyAt, send, sockets, craftItem, craftColour, setPieceReady, CRAFT_COOLDOWN_MS, inbox, ITEMS, save, broadcastHouse } = ctx;
    { // free, and whoever taps it keeps what it makes
          const owner = db.houses[p.house].members.includes(m.owner) ? db.players[m.owner] : null;
          const f = owner?.rooms?.[m.r ?? 0]?.furniture?.[m.index];
          if (!owner || !f || !has(CRAFT, f.item)) return;
          const now = Date.now(), key = readyKey(m.r ?? 0, m.index, f.item);
          if (pieceReadyAt(p, key, now)) return send(sockets.get(p.id), { t: 'error', text: 'That is still being set up. Try again in a few minutes.' });
          const item = craftItem(f.item);
          if (!item) return;
          const piece = { item, col: craftColour(item) };
          setPieceReady(p, key, now + CRAFT_COOLDOWN_MS);
          const to = !m.keep && db.houses[p.house].members.includes(m.to) ? db.players[m.to] : null;
          if (to && to.id !== p.id) {
            to.crafted = [...(to.crafted ?? []), piece];
            inbox(to, 'gift', p, `made you a ${ITEMS[item].name.toLowerCase()}`);
            send(sockets.get(to.id), { t: 'crafted', piece, from: p.name });
            save();
            send(sockets.get(p.id), { t: 'crafted', piece, to: to.id });
          } else {
            p.crafted = [...(p.crafted ?? []), piece];
            save();
            send(sockets.get(p.id), { t: 'crafted', piece });
          }
          broadcastHouse(p.house);
          return true;
        }
  },

  async gift_crafted(ctx) {
    const { p, m, db, inbox, ITEMS, send, sockets, save } = ctx;
    { // hand a piece you already made to a housemate
          const list = p.crafted ?? [];
          const piece = Number.isInteger(m.index) ? list[m.index] : null;
          const to = db.houses[p.house].members.includes(m.to) ? db.players[m.to] : null;
          if (!piece || !to || to.id === p.id) return;
          p.crafted = [...list.slice(0, m.index), ...list.slice(m.index + 1)];
          to.crafted = [...(to.crafted ?? []), piece];
          inbox(to, 'gift', p, `made you a ${ITEMS[piece.item].name.toLowerCase()}`);
          send(sockets.get(to.id), { t: 'crafted', piece, from: p.name });
          save();
          send(sockets.get(p.id), { t: 'crafted', piece, to: to.id });
          return true;
        }
  },

  async room(ctx) {
    const { pick, WALLPAPERS, m, room, FLOORS, WALL_PATTERNS, FLOOR_STYLES } = ctx;
    {
          // A new wallpaper or floor takes over from a custom paint of that surface; repainting the custom colour, or changing
          // only the pattern or floor style, leaves it alone.
          const wall = pick(WALLPAPERS, m.wallpaper, room.wallpaper), floor = pick(FLOORS, m.floor, room.floor);
          room.wallpaper = wall;
          room.floor = floor;
          room.pattern = pick(WALL_PATTERNS, m.pattern, room.pattern ?? WALL_PATTERNS[0]);
          room.floorStyle = pick(FLOOR_STYLES, m.floorStyle, room.floorStyle ?? FLOOR_STYLES[0]);
          // An empty value means "back to the preset", so picking the preset already stored behind a custom paint still
          // restores it. Pattern and floor-style changes leave both keys out, so a custom paint survives those.
          if ('wallColor' in m) room.wallColor = m.wallColor || undefined;
          if ('floorColor' in m) room.floorColor = m.floorColor || undefined;
          return true;
        }
  },

  async turn(ctx) {
    const { room, m, canRotate, nextRot, canPlace, send, sockets, p } = ctx;
    { // face the next way (side, back, other side); only bed can rotate
          const f = room.furniture[m.index];
          if (!f || !canRotate(f.item)) return;
          const rot = nextRot(f), rest = { ...room, furniture: room.furniture.filter((_, i) => i !== m.index) };
          if (!canPlace(rest, f.item, f.x, f.y, rot)) return send(sockets.get(p.id), { t: 'error', text: "There isn't room to turn it here. Move it somewhere with more space first." });
          f.rot = rot || undefined;
          return true;
        }
  },

  async flip(ctx) {
    const { room, m } = ctx;
    {
          const f = room.furniture[m.index];
          if (!f) return;
          f.flip = !f.flip;
          return true;
        }
  },

  async restyle(ctx) {
    const { room, m, colorsFor } = ctx;
    {
          const f = room.furniture[m.index];
          if (!f || !Number.isInteger(m.v) || m.v < 0 || m.v >= colorsFor(f.item).length) return;
          f.v = m.v;
          f.col = undefined; // a swatch pick replaces any custom colour
          return true;
        }
  },

  async paint(ctx) {
    const { room, m } = ctx;
    {
          const f = room.furniture[m.index];
          if (!f || !/^#[0-9a-fA-F]{6}$/.test(String(m.col ?? ''))) return;
          f.col = m.col;
          return true;
        }
  },

  async shape(ctx) {
    const { room, m, has, ITEMS } = ctx;
    {
          const f = room.furniture[m.index];
          if (!f || !has(ITEMS, f.item) || !Number.isInteger(m.s) || m.s < 0 || m.s >= (ITEMS[f.item].looks?.length ?? 1)) return;
          f.s = m.s;
          return true;
        }
  },

  async expand(ctx) {
    const { room, EXPAND_COST, p } = ctx;
    {
          const next = (room.level ?? 0) + 1;
          if (next >= EXPAND_COST.length || p.coins < EXPAND_COST[next]) return;
          p.coins -= EXPAND_COST[next];
          room.level = next;
          return true;
        }
  },

  async add_room(ctx) {
    const { p, MAX_ROOMS, ROOM_COST, newRoom } = ctx;
    {
          const n = p.rooms.length;
          if (n >= MAX_ROOMS || p.coins < ROOM_COST[n]) return;
          p.coins -= ROOM_COST[n];
          p.rooms.push(newRoom());
          return true;
        }
  },

  async adopt(ctx) {
    const { has, PETS, m, p, MAX_PETS } = ctx;
    {
          if (!has(PETS, m.kind)) return;
          const pet = PETS[m.kind];
          p.pets ??= [];
          if (p.coins < pet.price || p.pets.length >= MAX_PETS) return;
          p.coins -= pet.price;
          p.pets.push({ kind: m.kind });
          return true;
        }
  },

  async buy_acc(ctx) {
    const { has, PET_ACCS, m, p } = ctx;
    {
          if (!has(PET_ACCS, m.acc)) return;
          const acc = PET_ACCS[m.acc];
          p.petAccs ??= [];
          if (p.petAccs.includes(m.acc) || p.coins < acc.price) return;
          p.coins -= acc.price;
          p.petAccs.push(m.acc);
          return true;
        }
  },

  async pet_release(ctx) {
    const { m, p, send, sockets, PETS } = ctx;
    {
          if (!Number.isInteger(m.slot) || !p.pets?.[m.slot]) return;
          const [gone] = p.pets.splice(m.slot, 1);
          send(sockets.get(p.id), { t: 'info', text: `Waved goodbye to ${gone.name ?? `your ${PETS[gone.kind]?.name.toLowerCase() ?? 'pet'}`}. 💛` });
          return true;
        }
  },

  async pet_style(ctx) {
    const { p, m, has, PETS, cleanText } = ctx;
    {
          const pet = p.pets?.[m.slot];
          if (!pet || !has(PETS, pet.kind)) return;
          if (Number.isInteger(m.coat) && m.coat >= 0 && m.coat < PETS[pet.kind].coats.length) pet.coat = m.coat;
          if (m.acc === '' || (p.petAccs ?? []).includes(m.acc)) pet.acc = m.acc || undefined;
          if (typeof m.name === 'string') pet.name = cleanText(m.name, 16) || undefined;
          if (typeof m.away === 'boolean') pet.away = m.away || undefined; // kept, but not out in the room
          if (typeof m.follow === 'boolean') pet.follow = m.follow || undefined; // trots after you when you're not studying
          return true;
        }
  },
};
