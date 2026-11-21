// The Guide: the words for what the catalog cannot say.
//
// `ITEMS` says what a thing is, and the hover tooltip says what a click does. Neither can say the
// consequence: that a coffee buys ten minutes of extra pay, that the claw waits half an hour between
// plays. That is what this file holds.
//
// An item gets a row only when the tooltip does not already explain it. `Water`, `Nap`, `Play music`
// and `Send a gift` are all on the tooltip, so plants, chairs, speakers and gift boxes are not listed.

// The five steps the first-run tour used to show, now the Guide's opening card.
export const GUIDE_START = [
  '👋 Welcome to Auralis! This is your room. Your little buddy wanders around and uses things on their own.',
  '🖱️ Click furniture to use it: sit, nap, work out, water plants, play music… Hover (or tap) to see what a click does.',
  '⏰ Open <b>Focus</b> in the dock to study. Your buddy sits at the desk and you earn a coin a minute.',
  '🛍️ Spend coins in the <b>Shop</b>, then arrange your room in <b>Decorate</b>.',
  "🏠 Share your house code (top right) so friends' rooms join yours. Study at the same time for up to ×2 coins!",
];

// Ordered. A section is prose, item rows, or both. `steps` is a numbered list, used by `start` only.
export const GUIDE_SECTIONS = [
  { id: 'start', title: 'Start here', blurb: 'Five things worth knowing before you potter about.', steps: GUIDE_START },
  {
    id: 'focus',
    title: 'Focus',
    blurb: 'Finish a session and you are paid a coin a minute. Study at the same time as a housemate and you both earn a quarter more each, up to double. Three days in a row adds 10%, seven adds 25%, thirty adds 50%.',
  },
  {
    id: 'coins',
    title: 'Coins and the Shop',
    blurb: 'Coins come from finished focus sessions, from house to-dos the whole house finished, and now and then from a pet. Spend them in the Shop on furniture, pets, pet style and more room.',
  },
  {
    id: 'decorate',
    title: 'Decorate and rooms',
    blurb: 'Pick a room, then drag furniture to move it and tap it for rotate, flip, colour and put away. Wallpaper, pattern, floor and floor style are yours to change, and any colour you like is one swatch away. Up to three rooms each; a bigger room costs coins.',
  },
  {
    id: 'drinks',
    title: 'Drinks and caffeine',
    blurb: 'Click a drink to use it. Drinks are free and never run out — the window they open is the only limit.',
    items: [
      { item: 'coffeeMachine', text: 'Click to brew. Free and never used up; it opens a ten-minute window in which every focus minute pays one extra coin.' },
      { item: 'coffee', text: 'A cup from the machine. The same ten-minute window.' },
      { item: 'energyCan', text: 'The same ten-minute window as coffee.' },
      { item: 'wine', text: 'Two minutes of rest, and a sway. Nothing is used up.' },
    ],
  },
  {
    id: 'claw',
    title: 'The claw machine',
    blurb: 'Five coins a play, then half an hour before you can play again. Anyone in the house can play, and each of them waits on their own clock. It drops one of 26 catalog prizes: mostly small trinkets, rarely a giant teddy.',
    items: [
      { item: 'clawMachine', text: 'Click to play. Five coins, one prize, then a thirty-minute wait for you. A housemate can play it too, and their wait is their own.' },
    ],
  },
  {
    id: 'craft',
    title: 'Crafting',
    blurb: 'Each making piece is free and waits twenty minutes on you. It makes one thing from its own pool, chosen at random — you do not pick which. Keep the piece or send it to a housemate. Anyone can use any piece, and each of them keeps what it makes.',
    items: [
      { item: 'potteryWheel', text: 'Free, twenty-minute wait, and one random piece: vase, sculpture, bust or mushroom pot.' },
      { item: 'easel', text: 'Free, twenty-minute wait, and one random piece: photo frames, vase, sculpture or bust.' },
      { item: 'loom', text: 'Free, twenty-minute wait, and one random rug: round, oval or runner.' },
      { item: 'craftTable', text: 'Free, twenty-minute wait, and one random piece: candles, photo frames or a snow globe.' },
      { item: 'sewingTable', text: 'Free, twenty-minute wait, and one random plush: plush bear, giant teddy, big shark or small shark.' },
    ],
  },
  {
    id: 'pets',
    title: 'Pets',
    blurb: 'Pets wander, climb and nap on their own. Study with one out to grow its bond; bonded pets do tricks and sometimes find coins. Up to four, and you can dress them from the You panel.',
  },
  {
    id: 'lights',
    title: 'Lights',
    blurb: 'Click a lamp to switch it on or off. The switch belongs to the house: anyone in it can reach any room\'s lamps.',
  },
  {
    id: 'music',
    title: 'Music and sound',
    blurb: 'Click a record player, DJ deck, piano, guitar, saxophone, cello, violin or harp to start a piece, and click it again to stop. Only one piece plays at a time, so starting another ends the first. Drum kit, synth and dhol are band instruments: they layer over each other, but stop when music starts. Sound belongs to the house it started in, so leaving the house stops it. The speaker in the HUD mutes everything, the slider beside it is the master volume, and the ▾ beside that sets the levels for music, fire and clocks, and chimes — and stops every sound at once.',
  },
  {
    id: 'gifts',
    title: 'Gifting and selling',
    blurb: 'Send a housemate ten coins, up to five times a day. Stored pieces and handmade pieces can be given away too. Selling something back returns half its price, or a quarter for a handmade piece.',
  },
  {
    id: 'house',
    title: 'House and friends',
    blurb: 'Your house code never changes. Share it and friends\' rooms open into yours as one big house. The owner can post announcements and remove people; removed people can be let back in.',
  },
  {
    id: 'todos',
    title: 'To-dos, calendar and exams',
    blurb: 'To-dos can be the whole house\'s or just yours, with a date, a time, a repeat and a priority. Finish one and the house earns coins. A desk calendar shows your next exam to housemates.',
  },
  {
    id: 'stats',
    title: 'Stats',
    blurb: 'Ranked by focused minutes from finished sessions: your house, your friends, or everyone. Plus charts of your own sessions by subject.',
  },
  {
    id: 'chat',
    title: 'Chat',
    blurb: 'House chat, private messages and groups. Friends from other houses can be messaged and visited.',
  },
  {
    id: 'notify',
    title: 'Notifications',
    blurb: 'The bell collects what happened while you were away, with house announcements at the top. In its settings you can allow browser pop-ups, and push messages for when Auralis is closed.',
  },
];

// Shown once, when the item first turns up in the inventory. One sentence each, no more.
export const GUIDE_TIPS = {
  coffeeMachine: 'The coffee machine is yours: click it for a ten-minute window in which every focus minute pays an extra coin.',
  coffee: 'Coffee: click it for a ten-minute window in which every focus minute pays an extra coin.',
  energyCan: 'Energy drink: the same ten-minute window as coffee.',
  wine: 'Wine: two minutes of rest, and a sway. Nothing is used up.',
  clawMachine: 'The claw machine is shared: five coins a play, and half an hour before you can play again.',
  potteryWheel: 'The pottery wheel is shared: click it to make one random piece, free, then wait twenty minutes before using it again.',
  easel: 'The easel is shared: click it to make one random piece, free, then wait twenty minutes before using it again.',
  loom: 'The weaving loom is shared: click it to make one random rug, free, then wait twenty minutes before using it again.',
  craftTable: 'The craft table is shared: click it to make one random piece, free, then wait twenty minutes before using it again.',
  sewingTable: 'The sewing table is shared: click it to make one random plush, free, then wait twenty minutes before using it again.',
};

// The tour is the Guide's own words, shown at the moment they matter: one step per thing the player actually
// owns that has a line worth reading. Built from `GUIDE_TIPS`, so the set is known up front and every step can
// be listed at once rather than doled out one toast at a time.
export const tourSteps = (owned = {}) => Object.keys(GUIDE_TIPS).filter((id) => owned[id]).map((id) => ({ item: id, text: GUIDE_TIPS[id] }));

// The steps this player has not been shown yet: everything the tour would open with on the next state.
export const unseenTips = (owned = {}, seen = []) => tourSteps(owned).filter((s) => !seen.includes(s.item));