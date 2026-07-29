import { describe, expect, it } from 'vitest';

import { buildBlock } from '../src/lib/buildBlock.js';
import { defaultFormState, generatePhases } from '../src/lib/defaults.js';
import { equipmentAdvice, generateWeek, progressionFor } from '../src/lib/generateWeek.js';
import { expandEquipment, getMovement, isAvailable, resolveMovement } from '../src/lib/movements.js';
import { SESSION_TYPES, WEEK_KEYS } from '../src/lib/sessions.js';

const GOALS = ['strength', 'allround', 'endurance'];
const LEVELS = ['new', 'returning', 'consistent'];
const LIFT_DAYS = [2, 3, 4];
const EQUIPMENT_SETS = [
  [],
  ['dumbbells', 'pullup_bar'],
  ['full_gym', 'track', 'pool'],
  ['barbell', 'squat_rack', 'track'],
  ['kettlebell', 'bands'],
];

function* profiles() {
  for (const goal of GOALS) {
    for (const experience of LEVELS) {
      for (const liftDays of LIFT_DAYS) yield { goal, experience, liftDays };
    }
  }
}

describe('generateWeek', () => {
  it('gives every day exactly one indoor and one outdoor workout', () => {
    for (const profile of profiles()) {
      for (const equipment of EQUIPMENT_SETS) {
        const { week } = generateWeek(profile, equipment);
        for (const key of WEEK_KEYS) {
          expect(SESSION_TYPES[week[key].indoor.session], `${key} indoor`).toBeDefined();
          expect(SESSION_TYPES[week[key].outdoor.session], `${key} outdoor`).toBeDefined();
        }
      }
    }
  });

  it('never picks a movement the equipment cannot support', () => {
    for (const profile of profiles()) {
      for (const equipment of EQUIPMENT_SETS) {
        const owned = expandEquipment(equipment);
        const { week } = generateWeek(profile, equipment);
        for (const key of WEEK_KEYS) {
          for (const workout of ['indoor', 'outdoor']) {
            for (const [slot, id] of Object.entries(week[key][workout].slots ?? {})) {
              const m = getMovement(id);
              if (!m || isAvailable(m, owned)) continue;
              // An unavailable pick is only kept when nothing at all can fill
              // the slot — deliberately, so buildBlock names the equipment gap.
              const { movement } = resolveMovement(id, owned, slot);
              expect(movement, `${id} for ${slot} with [${equipment}]`).toBeNull();
            }
          }
        }
      }
    }
  });

  it('respects the number of lifting days', () => {
    for (const liftDays of LIFT_DAYS) {
      const { week } = generateWeek({ goal: 'allround', experience: 'returning', liftDays }, ['full_gym']);
      const lifts = WEEK_KEYS.filter((k) =>
        ['gym_a', 'gym_b', 'gym_full', 'calisthenics'].includes(week[k].indoor.session));
      expect(lifts).toHaveLength(liftDays);
    }
  });

  it('always includes both Gym A and Gym B when weights exist, for slot coverage', () => {
    for (const liftDays of LIFT_DAYS) {
      const { week } = generateWeek({ goal: 'strength', experience: 'consistent', liftDays }, ['full_gym']);
      const sessions = WEEK_KEYS.map((k) => week[k].indoor.session);
      expect(sessions).toContain('gym_a');
      expect(sessions).toContain('gym_b');
    }
  });

  it('uses calisthenics on lifting days when there are no weights', () => {
    const { week } = generateWeek({ goal: 'allround', experience: 'returning', liftDays: 3 }, []);
    const sessions = WEEK_KEYS.map((k) => week[k].indoor.session);
    expect(sessions).toContain('calisthenics');
    expect(sessions).not.toContain('gym_a');
  });

  it('scales running days with the goal', () => {
    const runs = (goal) => {
      const { week } = generateWeek({ goal, experience: 'returning', liftDays: 3 }, ['track']);
      return WEEK_KEYS.filter((k) => ['run', 'intervals'].includes(week[k].outdoor.session)).length;
    };
    expect(runs('strength')).toBe(1);
    expect(runs('allround')).toBe(2);
    expect(runs('endurance')).toBe(3);
  });

  it('puts a swim on Saturday when a pool is available', () => {
    const { week, notes } = generateWeek({ goal: 'allround', experience: 'returning', liftDays: 3 }, ['pool']);
    expect(week.sat.outdoor.session).toBe('outdoor_swim');
    // The week explains itself, so the swim has to be accounted for somewhere.
    expect(notes.join(' ')).toMatch(/swim/i);
  });

  it('prefers barbell lifts for experienced lifters and dumbbells for new ones', () => {
    const experienced = generateWeek({ goal: 'strength', experience: 'consistent', liftDays: 3 }, ['full_gym']);
    const beginner = generateWeek({ goal: 'strength', experience: 'new', liftDays: 3 }, ['full_gym']);
    const squatOf = ({ week }) => WEEK_KEYS
      .map((k) => week[k].indoor.slots?.squat).find(Boolean);
    expect(squatOf(experienced)).toBe('back_squat');
    expect(squatOf(beginner)).toBe('goblet_squat');
  });

  it('places lifting days on work-from-home days when given', () => {
    const { week, notes } = generateWeek(
      { goal: 'allround', experience: 'returning', liftDays: 2, wfhDays: ['tue', 'sat'] },
      ['full_gym'],
    );
    const lifts = WEEK_KEYS.filter((k) => ['gym_a', 'gym_b', 'gym_full'].includes(week[k].indoor.session));
    expect(lifts).toEqual(['tue', 'sat']);
    expect(notes.join(' ')).toMatch(/home days/i);
  });

  it('tops up from the default pattern when home days are fewer than lifting days', () => {
    const { week } = generateWeek(
      { goal: 'allround', experience: 'returning', liftDays: 3, wfhDays: ['wed'] },
      ['full_gym'],
    );
    const lifts = WEEK_KEYS.filter((k) => ['gym_a', 'gym_b', 'gym_full'].includes(week[k].indoor.session));
    expect(lifts).toContain('wed');
    expect(lifts).toHaveLength(3);
  });

  it('applies no bias when no home days are named', () => {
    const { week } = generateWeek({ goal: 'allround', experience: 'returning', liftDays: 3 }, ['full_gym']);
    const lifts = WEEK_KEYS.filter((k) => ['gym_a', 'gym_b', 'gym_full'].includes(week[k].indoor.session));
    expect(lifts).toEqual(['mon', 'wed', 'fri']);
  });

  it('is deterministic', () => {
    const profile = { goal: 'endurance', experience: 'new', liftDays: 4 };
    const a = generateWeek(profile, ['full_gym', 'track']);
    const b = generateWeek(profile, ['full_gym', 'track']);
    expect(a).toEqual(b);
  });

  it('falls back to sane defaults on a garbage profile', () => {
    const { week } = generateWeek({ goal: 'nope', liftDays: 99 }, ['dumbbells']);
    for (const key of WEEK_KEYS) expect(week[key].indoor).toBeDefined();
  });

  it('produces a week buildBlock accepts without empty-slot or missing-workout warnings when equipped', () => {
    for (const profile of profiles()) {
      const state = {
        ...defaultFormState(),
        profile,
        equipment: ['full_gym', 'track', 'pool'],
      };
      const { week } = generateWeek(profile, state.equipment);
      const { diagnostics } = buildBlock({ ...state, weekTemplate: week });
      const bad = diagnostics.filter((d) => ['empty_slot', 'missing_workout', 'slot_uncovered'].includes(d.code));
      expect(bad, JSON.stringify({ profile, bad }, null, 1)).toHaveLength(0);
    }
  });
});

describe('equipmentAdvice', () => {
  it('reports nothing to fix once the gaps are covered', () => {
    expect(equipmentAdvice(['dumbbells', 'pullup_bar'])).toBeNull();
    expect(equipmentAdvice(['full_gym'])).toBeNull();
  });

  it('names the untrainable slots for a bodyweight setup', () => {
    const advice = equipmentAdvice([]);
    expect(advice.gaps).toContain('Vertical pull');
    expect(advice.gaps).toContain('Biceps');
    // Hinge and squat have bodyweight options, so they are never gaps.
    expect(advice.gaps).not.toContain('Hinge');
    expect(advice.gaps).not.toContain('Squat');
  });

  it('recommends a buyable item, never a full gym', () => {
    for (const eq of [[], ['pullup_bar'], ['bands']]) {
      const advice = equipmentAdvice(eq);
      if (!advice?.best) continue;
      expect(advice.best.label).not.toMatch(/full gym/i);
      expect(advice.best.unlocks).toBeGreaterThan(0);
      expect(advice.best.fixes.length).toBeGreaterThan(0);
    }
  });
});

describe('progressionFor', () => {
  it('matches the goal', () => {
    expect(progressionFor({ goal: 'strength' }).scheme).toBe('linear');
    expect(progressionFor({ goal: 'strength' }).repHigh).toBeLessThanOrEqual(8);
    expect(progressionFor({ goal: 'endurance' }).repLow).toBeGreaterThanOrEqual(10);
    expect(progressionFor({}).scheme).toBe('double');
  });

  it('is complete on its own, since nothing in the form fills gaps', () => {
    for (const goal of [...GOALS, 'nonsense']) {
      const p = progressionFor({ goal });
      for (const key of ['scheme', 'repLow', 'repHigh', 'incrementUpper', 'incrementLower', 'stallRule']) {
        expect(p[key], `${goal}.${key}`).toBeDefined();
      }
      expect(p.repLow).toBeLessThan(p.repHigh);
    }
  });

  it('follows the goal on the built state, with no way to detach it', () => {
    const base = defaultFormState();
    for (const goal of GOALS) {
      const state = { ...base, profile: { ...base.profile, goal } };
      // What the builder does on any profile change.
      const derived = { ...state.progression, ...progressionFor(state.profile) };
      expect(derived.scheme).toBe(progressionFor({ goal }).scheme);
      expect(derived.repLow).toBe(progressionFor({ goal }).repLow);
    }
  });
});

describe('phases', () => {
  it('carry only fields something actually renders', () => {
    for (const length of [60, 75, 90]) {
      for (const phase of generatePhases(length)) {
        expect(Object.keys(phase).sort()).toEqual(['endWeek', 'index', 'sets', 'startWeek']);
      }
    }
  });

  it('covers every week of the block exactly once', () => {
    for (const length of [60, 75, 90]) {
      const phases = generatePhases(length);
      const weeks = Math.ceil(length / 7);
      expect(phases[0].startWeek).toBe(1);
      expect(phases.at(-1).endWeek).toBe(weeks);
      for (let i = 1; i < phases.length; i += 1) {
        expect(phases[i].startWeek).toBe(phases[i - 1].endWeek + 1);
      }
    }
  });
});
