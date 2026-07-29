// A seven-day strip showing the shape of the week at a glance: each day's
// indoor and outdoor workout, shaded by how hard the day is.

import { SESSION_TYPES, WEEK_KEYS } from '../lib/sessions.js';

const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * How hard is a session, for visual weight. Sports carry their own intensity
 * in the session data, so adding one never means editing this map.
 */
const INTENSITY = {
  gym_a: 'lift', gym_b: 'lift', gym_full: 'lift', calisthenics: 'lift',
  indoor_cardio: 'run',
  run: 'run', intervals: 'run', outdoor_circuit: 'run', outdoor_swim: 'run',
  ruck: 'run',
  mobility: 'easy', walk: 'easy', par3: 'easy',
};

/** A sport's declared intensity maps onto the same three visual weights. */
const SPORT_INTENSITY = { easy: 'easy', hard: 'run' };

const SHORT = {
  gym_a: 'Gym A', gym_b: 'Gym B', gym_full: 'Full body', calisthenics: 'Cali',
  indoor_cardio: 'Cardio', mobility: 'Mobility',
  run: 'Run', intervals: 'Intervals', walk: 'Walk', ruck: 'Ruck',
  outdoor_swim: 'Swim', outdoor_circuit: 'Circuit', par3: 'Par 3',
};

function shortLabel(entry) {
  const type = SESSION_TYPES[entry?.session];
  if (!type) return '—';
  if (type.freeLabel) return entry?.label || 'Sport';
  return SHORT[type.id] ?? type.short ?? type.label;
}

/** One session's visual weight: explicit map first, then its own intensity. */
function kindOf(entry) {
  const type = SESSION_TYPES[entry?.session];
  if (!type) return 'easy';
  return INTENSITY[type.id] ?? SPORT_INTENSITY[type.intensity] ?? 'easy';
}

/** The harder of a day's two sessions decides its shade. */
function dayKind(day) {
  const kinds = ['indoor', 'outdoor'].map((slot) => kindOf(day?.[slot]));
  if (kinds.includes('lift')) return 'lift';
  if (kinds.includes('run')) return 'run';
  return 'easy';
}

/**
 * Build the strip as a DOM node.
 * @param {object} weekTemplate keyed sun..sat, each { indoor, outdoor }
 */
export function weekPreview(weekTemplate, { compact = false } = {}) {
  const strip = document.createElement('div');
  strip.className = compact ? 'week-strip compact' : 'week-strip';
  strip.setAttribute('role', 'img');

  const parts = [];

  WEEK_KEYS.forEach((key, i) => {
    const day = weekTemplate?.[key] ?? {};
    const indoor = shortLabel(day.indoor);
    const outdoor = shortLabel(day.outdoor);
    parts.push(`${DAY_INITIALS[i]}: ${indoor} + ${outdoor}`);

    const cell = document.createElement('div');
    cell.className = `wd wd-${dayKind(day)}`;

    const dayEl = document.createElement('span');
    dayEl.className = 'wd-day';
    dayEl.textContent = DAY_INITIALS[i];

    const inEl = document.createElement('span');
    inEl.className = 'wd-label';
    inEl.textContent = indoor;

    const outEl = document.createElement('span');
    outEl.className = 'wd-label wd-out';
    outEl.textContent = outdoor;

    cell.append(dayEl, inEl, outEl);
    strip.append(cell);
  });

  strip.setAttribute('aria-label', parts.join(', '));
  return strip;
}

/** Counts for the summary line. */
export function weekSummary(weekTemplate) {
  let lift = 0;
  let hard = 0;
  let easy = 0;
  for (const key of WEEK_KEYS) {
    const kind = dayKind(weekTemplate?.[key]);
    if (kind === 'lift') lift += 1;
    else if (kind === 'run') hard += 1;
    else easy += 1;
  }
  const bits = [];
  if (lift) bits.push(`${lift} lifting`);
  if (hard) bits.push(`${hard} cardio`);
  if (easy) bits.push(`${easy} easy`);
  return bits.join(' · ');
}
