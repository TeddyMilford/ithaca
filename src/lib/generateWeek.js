// Week generation.
//
// generateWeek(profile, equipment) drafts a week template from three answers
// (goal, experience, lifting days) plus the equipment list. Pure and
// deterministic: same inputs, same week. It returns notes alongside the week —
// one sentence per decision — so the builder can show *why* the week looks the
// way it does instead of presenting it as a fait accompli.
//
// The user owns the result. The builder only calls this while the week is
// untouched; the first hand edit turns it off.

import {
  EQUIPMENT, expandEquipment, isAvailable, MOVEMENTS, resolveMovement, slotLabel, slotsFilled, SLOTS,
} from './movements.js';
import { SESSION_TYPES, WEEK_KEYS } from './sessions.js';

// Slots a program is expected to train. Conditioning and mobility are excluded
// for the same reason buildBlock excludes them: the outdoor workout covers
// conditioning daily, and mobility needs nothing.
const TRAINABLE_SLOTS = SLOTS.map((s) => s.id).filter((id) => !['mobility', 'conditioning'].includes(id));

/** Every slot the given equipment can train at all. */
function trainableSlots(ownedSet) {
  const set = new Set();
  for (const m of MOVEMENTS) {
    if (isAvailable(m, ownedSet)) for (const s of slotsFilled(m)) set.add(s);
  }
  return set;
}

/**
 * What the current equipment cannot train, and the single best thing to add.
 * Computed from the library rather than hardcoded, so it stays true if the
 * movement data changes.
 *
 * @returns {null | { gaps: string[], best: null | { label, fixes: string[], unlocks: number } }}
 */
export function equipmentAdvice(equipment = []) {
  const owned = expandEquipment(equipment);
  const now = trainableSlots(owned);
  const gaps = TRAINABLE_SLOTS.filter((s) => !now.has(s));
  if (gaps.length === 0) return null;

  let best = null;
  for (const e of EQUIPMENT) {
    if (e.id === 'machine' || owned.has(e.id)) continue; // machine comes only with a full gym
    // Only ever suggest one buyable thing. "Full gym" fixes everything by
    // definition and is useless as advice — it is a place, not a purchase.
    if (e.implies) continue;
    const withIt = expandEquipment([...equipment, e.id]);
    const after = trainableSlots(withIt);
    const fixes = gaps.filter((s) => after.has(s));
    if (fixes.length === 0) continue;
    const unlocks = MOVEMENTS.filter((m) => isAvailable(m, withIt) && !isAvailable(m, owned)).length;
    const better = !best
      || fixes.length > best.fixes.length
      || (fixes.length === best.fixes.length && unlocks > best.unlocks);
    if (better) best = { label: e.label, fixes, unlocks };
  }

  return {
    gaps: gaps.map(slotLabel),
    best: best ? { ...best, fixes: best.fixes.map(slotLabel) } : null,
  };
}

export const GOALS = [
  { id: 'strength', label: 'Get strong', note: 'Heavy compounds, low reps, easy days outside.' },
  { id: 'allround', label: 'All-round fitness', note: 'Lifting and running both. Every muscle trained weekly.' },
  { id: 'endurance', label: 'Build endurance', note: 'More running. Lifting holds the muscle you have.' },
];

export const EXPERIENCE_LEVELS = [
  { id: 'new', label: 'New to lifting', note: 'Dumbbell and bodyweight versions of the big lifts.' },
  { id: 'returning', label: 'Coming back', note: 'Barbell lifts, as far as your equipment goes.' },
  { id: 'consistent', label: 'Train regularly', note: 'Barbell lifts at full volume.' },
];

export const LIFT_DAY_CHOICES = [
  { id: 2, note: 'Everything covered in two sessions. The minimum.' },
  { id: 3, note: 'Push, pull, full body.' },
  { id: 4, note: 'Push and pull, twice through.' },
];

// Canonical pick per slot, resolved down the alternates chain against the
// user's equipment. Two ladders: barbell-first for people who lift, and a
// dumbbell/bodyweight ladder for people new to it (a first block is not the
// place to learn a barbell back squat unsupervised).
const BARBELL_PICKS = {
  squat: 'back_squat',
  hinge: 'conventional_deadlift',
  horizontal_press: 'flat_barbell_bench',
  vertical_press: 'standing_ohp',
  horizontal_row: 'barbell_row',
  vertical_pull: 'pullup',
  triceps: 'dip',
  biceps: 'db_curl',
  side_delts: 'db_lateral_raise',
  rear_delts: 'face_pull',
  traps: 'barbell_shrug',
  carry: 'farmer_carry',
  core: 'plank',
  mobility: 'worlds_greatest_stretch',
};

const BEGINNER_PICKS = {
  ...BARBELL_PICKS,
  squat: 'goblet_squat',
  hinge: 'romanian_deadlift',
  horizontal_press: 'flat_db_press',
  vertical_press: 'seated_db_shoulder_press',
  horizontal_row: 'chest_supported_db_row',
  traps: 'db_shrug',
};

const LIFT_DAY_KEYS = {
  2: ['mon', 'thu'],
  3: ['mon', 'wed', 'fri'],
  4: ['mon', 'tue', 'thu', 'fri'],
};

// Gym A + Gym B between them cover every required slot, so every arrangement
// includes at least one of each. A full-body-only week would leave arms and
// delts untrained all block and warn accordingly.
const LIFT_SESSIONS = {
  2: ['gym_a', 'gym_b'],
  3: ['gym_a', 'gym_b', 'gym_full'],
  4: ['gym_a', 'gym_b', 'gym_a', 'gym_b'],
};

// Saturday is reserved for the long outdoor session (swim or ruck), so runs
// avoid it except on the endurance plan, where Saturday is the third run.
const RUN_KEYS = {
  strength: ['tue'],
  allround: ['tue', 'fri'],
  endurance: ['tue', 'thu', 'sat'],
};

const WEIGHTS = ['barbell', 'dumbbells', 'kettlebell', 'machine'];

const WEEKDAY_NAMES = {
  sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday',
  thu: 'Thursday', fri: 'Friday', sat: 'Saturday',
};

/** ["a","b","c"] -> "a, b and c" */
function listOf(items) {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

// Scoring for where lifting days land. Home days are a preference, not an
// order: taking one is worth less than the cost of stacking three sessions
// back to back, so the bias can never wreck the spacing.
const ON_HOME_DAY = 10;
const BACK_TO_BACK = 6;
const THREE_IN_A_ROW = 25;

/** Every k-sized combination of `items`, in input order. */
function combinations(items, k) {
  if (k === 0) return [[]];
  const out = [];
  const walk = (start, taken) => {
    if (taken.length === k) { out.push(taken); return; }
    for (let i = start; i < items.length; i += 1) walk(i + 1, [...taken, items[i]]);
  };
  walk(0, []);
  return out;
}

/**
 * Rate one set of lifting days. Adjacency wraps around the week, because the
 * template repeats: Saturday and the following Sunday really are consecutive.
 */
function scheduleScore(days, homeDays) {
  const set = new Set(days);
  let score = 0;
  for (const day of days) if (homeDays.has(day)) score += ON_HOME_DAY;
  for (let i = 0; i < WEEK_KEYS.length; i += 1) {
    const a = set.has(WEEK_KEYS[i]);
    const b = set.has(WEEK_KEYS[(i + 1) % 7]);
    const c = set.has(WEEK_KEYS[(i + 2) % 7]);
    if (a && b) score -= BACK_TO_BACK;
    if (a && b && c) score -= THREE_IN_A_ROW;
  }
  return score;
}

/**
 * Choose the lifting days. With no home days named this is the plain weekly
 * pattern and nothing is searched. With home days named, every placement is
 * scored and the best one wins — which lands sessions on home days where it
 * can, and refuses to stack them up where it cannot.
 */
export function pickLiftDays(liftDays, wfhDays = []) {
  const fallback = LIFT_DAY_KEYS[liftDays] ?? LIFT_DAY_KEYS[3];
  const homeDays = new Set(WEEK_KEYS.filter((k) => wfhDays.includes(k)));
  if (homeDays.size === 0) return fallback;

  let best = null;
  for (const combo of combinations(WEEK_KEYS, liftDays)) {
    const score = scheduleScore(combo, homeDays);
    // On a tie the usual pattern wins, then the earliest week. Keeps the
    // result stable rather than dependent on iteration order.
    const isFallback = combo.length === fallback.length
      && combo.every((d, i) => d === fallback[i]);
    if (!best || score > best.score || (score === best.score && isFallback && !best.isFallback)) {
      best = { combo, score, isFallback };
    }
  }
  return best.combo;
}

/** Fill a session's open slots with the best available movement per slot. */
function fillSlots(sessionId, picks, owned) {
  const type = SESSION_TYPES[sessionId];
  const slots = {};
  for (const slot of type.slots) {
    if (type.defaultSlots?.[slot]) continue;
    const wanted = picks[slot];
    if (!wanted) continue;
    const { movement } = resolveMovement(wanted, owned, slot);
    // Store what they will actually do, so the editor shows the real movement.
    // Unresolvable stays as the request; buildBlock turns that into a warning.
    slots[slot] = movement ? movement.id : wanted;
  }
  return slots;
}

/**
 * Draft a week from the profile and equipment.
 * @returns {{ week: object, notes: string[] }}
 */
export function generateWeek(profile = {}, equipment = []) {
  const goal = GOALS.some((g) => g.id === profile.goal) ? profile.goal : 'allround';
  const experience = EXPERIENCE_LEVELS.some((e) => e.id === profile.experience)
    ? profile.experience : 'returning';
  const liftDays = LIFT_DAY_KEYS[profile.liftDays] ? profile.liftDays : 3;

  const owned = expandEquipment(equipment);
  const hasWeights = WEIGHTS.some((e) => owned.has(e));
  const picks = experience === 'new' ? BEGINNER_PICKS : BARBELL_PICKS;
  const notes = [];

  // --- Indoor -------------------------------------------------------------
  // Lifting prefers work-from-home days, since that is when a gym trip is
  // easiest to fit. Name none and the plain weekly pattern stands.
  const wfh = WEEK_KEYS.filter((k) => (profile.wfhDays ?? []).includes(k));
  const liftKeys = pickLiftDays(liftDays, wfh);
  if (wfh.length > 0) {
    const hits = liftKeys.filter((k) => wfh.includes(k)).length;
    const dayName = (k) => WEEKDAY_NAMES[k];
    if (hits === liftKeys.length) {
      notes.push('Every lifting day is a day you are home.');
    } else if (hits > 0) {
      notes.push(`Lifting lands at home on ${listOf(liftKeys.filter((k) => wfh.includes(k)).map(dayName))}. `
        + 'The rest is spaced out so the sessions do not stack up.');
    } else {
      notes.push('Your home days would have put the sessions back to back, so the usual spacing wins.');
    }
  }
  const liftSessions = LIFT_SESSIONS[liftDays];
  const indoor = {};

  liftKeys.forEach((key, i) => {
    const session = hasWeights ? liftSessions[i] : 'calisthenics';
    indoor[key] = { session, slots: fillSlots(session, picks, owned), label: null };
  });

  for (const key of WEEK_KEYS) {
    if (indoor[key]) continue;
    indoor[key] = { session: 'mobility', slots: fillSlots('mobility', picks, owned), label: null };
  }

  if (hasWeights) {
    notes.push(liftDays === 3
      ? '3 lifting days: push, pull, full body. Mobility on the rest.'
      : `${liftDays} lifting days, push and pull. Mobility on the rest.`);
  } else {
    notes.push('No weights, so lifting days are calisthenics. Rows, arms and delts have no bodyweight version and will come up empty.');
  }

  if (experience === 'new' && hasWeights) {
    notes.push('Dumbbell and bodyweight versions in the big slots, not the barbell lifts.');
  }

  // One indoor cardio day for endurance, if there is a machine to do it on.
  if (goal === 'endurance' && owned.has('machine')) {
    const key = liftKeys.includes('wed') ? 'sun' : 'wed';
    indoor[key] = { session: 'indoor_cardio', slots: {}, label: null };
    notes.push(`${key === 'wed' ? 'Wednesday' : 'Sunday'} indoors is machine cardio instead of mobility.`);
  }

  // --- Outdoor ------------------------------------------------------------
  const outdoor = {};
  for (const key of WEEK_KEYS) outdoor[key] = { session: 'walk', slots: {}, label: null };

  const runKeys = RUN_KEYS[goal];
  runKeys.forEach((key, i) => {
    // With a track, alternate steady runs and intervals for variety.
    const session = owned.has('track') && i % 2 === 1 ? 'intervals' : 'run';
    outdoor[key] = { session, slots: {}, label: null };
  });
  notes.push({
    strength: 'One running day. Walks the rest, so your legs are fresh for the bar.',
    allround: 'Two running days, walks on the others.',
    endurance: 'Three running days, never back to back.',
  }[goal]);

  if (!owned.has('track') && runKeys.length > 0) {
    notes.push('No track or road, so runs fall back to hill walks. Tick it if you can run where you live.');
  }

  if (owned.has('pool')) {
    outdoor.sat = { session: 'outdoor_swim', slots: {}, label: null };
    notes.push('Saturday is a swim.');
  } else if (goal !== 'endurance') {
    outdoor.sat = { session: 'ruck', slots: {}, label: null };
    notes.push('Saturday is a ruck: a walk with a loaded backpack. Any backpack works.');
  }

  // --- Assemble -----------------------------------------------------------
  const week = {};
  for (const key of WEEK_KEYS) week[key] = { indoor: indoor[key], outdoor: outdoor[key] };
  return { week, notes };
}

/**
 * The whole progression, decided by the goal. There is no progression step in
 * the form: asking someone to pick a rep range is asking them to already know
 * the answer they came for. The builder states what it chose instead.
 *
 * Experience shifts the increments, not the scheme — a newer lifter adds
 * weight in the same steps but stalls sooner, which the stall rule handles.
 */
export function progressionFor(profile = {}) {
  const byGoal = {
    strength: { scheme: 'linear', repLow: 5, repHigh: 8, incrementUpper: 5, incrementLower: 10 },
    endurance: { scheme: 'double', repLow: 10, repHigh: 15, incrementUpper: 5, incrementLower: 5 },
    allround: { scheme: 'double', repLow: 8, repHigh: 12, incrementUpper: 5, incrementLower: 10 },
  };
  const base = byGoal[profile.goal] ?? byGoal.allround;
  return { ...base, stallRule: 'deload10' };
}

export default generateWeek;
