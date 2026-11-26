// The connector catalogue: the one list the panel, the server and the tests read.
//
// A connector is a free outside source that writes into a surface the game already has — the personal
// calendar, the study log, a coin balance, or the record player. Nothing here fetches anything; the
// calls live in `server/connectors.js`, keyed by these ids.
//
// `every` is the minutes between two syncs. `coinPer`/`coinEach` are "one coin for every N units", and
// `minutesEach` is the study minutes one unit is worth. The daily caps are per connector and per player,
// which is what stops a commit bot from farming the economy.

export const CONNECTORS = [
  {
    id: 'github',
    label: 'GitHub',
    valueLabel: 'Username',
    placeholder: 'octocat',
    max: 39,
    hint: 'Today’s commits on public repositories earn coins and study minutes.',
    every: 15,
    activity: true,
    coinPer: 2,
    coinEach: 1,
    minutesEach: 2,
    coinsPerDay: 40,
    minutesPerDay: 90,
    unit: 'commit',
  },
  {
    id: 'leetcode',
    label: 'LeetCode',
    valueLabel: 'Username',
    placeholder: 'neetcode',
    max: 30,
    hint: 'Today’s accepted solutions earn coins and study minutes.',
    every: 15,
    activity: true,
    coinPer: 1,
    coinEach: 2,
    minutesEach: 10,
    coinsPerDay: 40,
    minutesPerDay: 90,
    unit: 'solution',
  },
  {
    id: 'ics',
    label: 'Calendar feed',
    valueLabel: 'ICS address',
    placeholder: 'https://…/basic.ics',
    max: 500,
    hint: 'A public iCal address (Canvas, Google Classroom, Outlook, Apple) puts its dates on your calendar.',
    every: 30,
    activity: false,
  },
  {
    id: 'spotify',
    label: 'Spotify',
    valueLabel: 'Account',
    placeholder: 'Connect',
    max: 0,
    hint: 'Shows what you are playing on your record player, whose card plays, pauses and skips.',
    every: 2,
    oauth: true,
    activity: false,
  },
];

export const CONNECTOR_BY_ID = Object.fromEntries(CONNECTORS.map((c) => [c.id, c]));
export const CONNECTOR_IDS = CONNECTORS.map((c) => c.id);

// A calendar feed can arrive with a term's worth of dates; only the nearest ones are worth carrying.
export const MAX_SYNCED_EVENTS = 60;
// The panel's add box refuses longer values than a connector's own `max`, and so does the server.
export const MAX_CONNECTOR_VALUE = Math.max(...CONNECTORS.map((c) => c.max));
