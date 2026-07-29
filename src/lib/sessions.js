// Session types.
//
// The program is two workouts a day, every day, one of which must be outdoors.
// So a day holds two sessions, not one, and there is deliberately no `rest`
// type: the only day without workouts is a declared exemption, and that is a
// property of the calendar, not something you can pick in the week template.

/**
 * Named sports, offered as first-class options rather than making everyone
 * type them. `where` decides which of the two lists a sport appears in; a
 * sport people genuinely play both indoors and out appears in both, with the
 * setting prefixed onto its id so indoor and outdoor ids never collide.
 *
 * This list is a convenience, not a limit — every list also ends with a
 * write-in option, which is what covers climbing, jiu-jitsu, dance and the
 * rest of what people actually do.
 */
export const SPORTS = [
  { id: 'yoga', label: 'Yoga', where: 'indoor', intensity: 'easy' },
  { id: 'basketball', label: 'Basketball', where: 'both', intensity: 'hard' },
  { id: 'pickleball', label: 'Pickleball', where: 'both', intensity: 'hard' },
  { id: 'tennis', label: 'Tennis', where: 'both', intensity: 'hard' },
  { id: 'golf', label: 'Golf, walking', short: 'Golf', where: 'outdoor', intensity: 'easy' },
  { id: 'softball', label: 'Softball', where: 'outdoor', intensity: 'easy' },
];

/** Build the sport session types belonging to one setting. */
function sportSessions(setting) {
  return Object.fromEntries(
    SPORTS
      .filter((s) => s.where === setting || s.where === 'both')
      .map((s) => {
        const id = `${setting}_${s.id}`;
        return [id, {
          id,
          name: (s.short ?? s.label).toUpperCase(),
          label: s.label,
          short: s.short ?? s.label,
          // A sport is time on your feet, not a slot to fill.
          slots: [],
          sport: true,
          intensity: s.intensity,
        }];
      })
  );
}

/** Indoor slot options. */
export const INDOOR_SESSIONS = {
  gym_a: {
    id: 'gym_a',
    name: 'GYM A',
    label: 'Gym A — push',
    slots: ['squat', 'horizontal_press', 'vertical_press', 'triceps', 'side_delts', 'core'],
  },
  gym_b: {
    id: 'gym_b',
    name: 'GYM B',
    label: 'Gym B — pull',
    slots: ['hinge', 'horizontal_row', 'vertical_pull', 'biceps', 'rear_delts', 'traps', 'carry'],
  },
  gym_full: {
    id: 'gym_full',
    name: 'FULL BODY',
    label: 'Full body',
    slots: ['squat', 'hinge', 'horizontal_press', 'vertical_pull', 'horizontal_row', 'carry', 'core'],
  },
  calisthenics: {
    id: 'calisthenics',
    name: 'CALISTHENICS',
    label: 'Calisthenics',
    // Hinge included: back extensions and hip thrusts need no equipment, and
    // without it a bodyweight week trains no posterior chain at all.
    slots: ['squat', 'hinge', 'horizontal_press', 'vertical_press', 'vertical_pull', 'triceps', 'core'],
  },
  indoor_cardio: {
    id: 'indoor_cardio',
    name: 'CARDIO',
    label: 'Indoor cardio',
    slots: ['conditioning'],
    defaultSlots: { conditioning: 'rowing_machine' },
  },
  mobility: {
    id: 'mobility',
    name: 'MOBILITY',
    label: 'Mobility and core',
    slots: ['mobility', 'core'],
  },
  ...sportSessions('indoor'),
  indoor_sport: {
    id: 'indoor_sport',
    name: 'SPORT',
    label: 'Something else (write it in)',
    slots: [],
    sport: true,
    intensity: 'hard',
    freeLabel: true,
  },
};

/** Outdoor slot options. One of these runs every single day, weather regardless. */
export const OUTDOOR_SESSIONS = {
  run: {
    id: 'run',
    name: 'RUN',
    label: 'Run',
    slots: ['conditioning'],
    defaultSlots: { conditioning: 'jog' },
  },
  intervals: {
    id: 'intervals',
    name: 'INTERVALS',
    label: 'Intervals',
    slots: ['conditioning'],
    defaultSlots: { conditioning: 'walk_jog_intervals' },
  },
  walk: {
    id: 'walk',
    name: 'WALK',
    label: 'Walk',
    slots: ['conditioning'],
    defaultSlots: { conditioning: 'hill_walk' },
  },
  ruck: {
    id: 'ruck',
    name: 'RUCK',
    label: 'Ruck (weighted pack)',
    slots: ['conditioning'],
    defaultSlots: { conditioning: 'weighted_backpack_walk' },
  },
  par3: {
    id: 'par3',
    name: 'PAR 3',
    label: 'Par 3 round (walk it)',
    slots: ['conditioning'],
    defaultSlots: { conditioning: 'par3_round' },
  },
  outdoor_circuit: {
    id: 'outdoor_circuit',
    name: 'CIRCUIT',
    label: 'Outdoor circuit',
    slots: ['squat', 'horizontal_press', 'core'],
  },
  outdoor_swim: {
    id: 'outdoor_swim',
    name: 'SWIM',
    label: 'Swim (outdoor)',
    slots: ['conditioning'],
    defaultSlots: { conditioning: 'swim_set' },
  },
  ...sportSessions('outdoor'),
  outdoor_sport: {
    id: 'outdoor_sport',
    name: 'SPORT',
    label: 'Something else (write it in)',
    slots: [],
    sport: true,
    intensity: 'hard',
    freeLabel: true,
  },
};

/** Every session type, indoor and outdoor, by id. Ids do not collide. */
export const SESSION_TYPES = Object.fromEntries(
  [...Object.values(INDOOR_SESSIONS), ...Object.values(OUTDOOR_SESSIONS)].map((t) => [
    t.id,
    { ...t, trains: true },
  ])
);

export const INDOOR_ORDER = Object.keys(INDOOR_SESSIONS);
export const OUTDOOR_ORDER = Object.keys(OUTDOOR_SESSIONS);

/** The two workouts a day. Order matters: this is the printing order. */
export const WORKOUT_SLOTS = [
  { id: 'indoor', label: 'Indoor', options: INDOOR_ORDER },
  { id: 'outdoor', label: 'Outdoor', options: OUTDOOR_ORDER },
];

/** The movement each slot gets before the user picks anything. */
export const DEFAULT_SLOT_PICKS = {
  squat: 'goblet_squat',
  hinge: 'romanian_deadlift',
  horizontal_press: 'flat_db_press',
  vertical_press: 'seated_db_shoulder_press',
  horizontal_row: 'single_arm_db_row',
  vertical_pull: 'pullup',
  triceps: 'dip',
  biceps: 'db_curl',
  side_delts: 'db_lateral_raise',
  rear_delts: 'face_pull',
  traps: 'db_shrug',
  carry: 'farmer_carry',
  core: 'plank',
  conditioning: 'jog',
  mobility: 'worlds_greatest_stretch',
};

const WEEK_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export { WEEK_KEYS };

/** Fill every slot a session type covers with its default movement. */
export function slotsFor(sessionId) {
  const type = SESSION_TYPES[sessionId];
  if (!type || type.slots.length === 0) return {};
  const picks = {};
  for (const slot of type.slots) {
    if (type.defaultSlots?.[slot]) continue; // the type supplies its own
    const pick = DEFAULT_SLOT_PICKS[slot];
    if (pick) picks[slot] = pick;
  }
  return picks;
}

const workout = (session, slots, label = null) => ({
  session,
  slots: slots ?? slotsFor(session),
  label,
});

/**
 * The starting week: a lifting split indoors, and something outdoors every day.
 * Sunday and Wednesday go lighter indoors rather than off, because there is no
 * off.
 */
export const DEFAULT_WEEK = {
  sun: { indoor: workout('mobility'), outdoor: workout('walk') },
  mon: { indoor: workout('gym_a'), outdoor: workout('run') },
  tue: { indoor: workout('gym_b'), outdoor: workout('walk') },
  wed: { indoor: workout('calisthenics'), outdoor: workout('intervals') },
  thu: { indoor: workout('gym_a'), outdoor: workout('walk') },
  fri: { indoor: workout('gym_b'), outdoor: workout('run') },
  sat: { indoor: workout('mobility'), outdoor: workout('ruck') },
};

// Empty on purpose: the equipment step should be answered, not skimmed past
// with someone else's answers pre-checked.
export const DEFAULT_EQUIPMENT = [];

/** The five daily non-negotiables. */
export const DEFAULT_RULES = [
  'Follow the diet, no cheat meals',
  'No alcohol',
  '1 gallon of water',
  '10 pages of non-fiction',
  'Progress photo',
];
