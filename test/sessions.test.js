import { describe, expect, it } from 'vitest';
import { buildBlock } from '../src/lib/buildBlock.js';
import { defaultFormState } from '../src/lib/defaults.js';
import {
  DEFAULT_RULES,
  DEFAULT_WEEK,
  INDOOR_SESSIONS,
  OUTDOOR_SESSIONS,
  SESSION_TYPES,
  slotsFor,
  SPORTS,
  WEEK_KEYS,
  WORKOUT_SLOTS,
} from '../src/lib/sessions.js';

const START = '2026-08-02'; // a Sunday

describe('session model', () => {
  it('has no rest type — there are no rest days', () => {
    expect(SESSION_TYPES.rest).toBeUndefined();
    expect(Object.keys(INDOOR_SESSIONS)).not.toContain('rest');
    expect(Object.keys(OUTDOOR_SESSIONS)).not.toContain('rest');
  });

  it('keeps indoor and outdoor ids distinct', () => {
    const indoor = Object.keys(INDOOR_SESSIONS);
    const outdoor = Object.keys(OUTDOOR_SESSIONS);
    expect(indoor.filter((id) => outdoor.includes(id))).toEqual([]);
  });

  it('defines exactly two workouts a day', () => {
    expect(WORKOUT_SLOTS.map((w) => w.id)).toEqual(['indoor', 'outdoor']);
  });

  it('fills every slot a session type covers', () => {
    for (const type of Object.values(SESSION_TYPES)) {
      const picks = slotsFor(type.id);
      for (const slot of type.slots) {
        const filled = picks[slot] ?? type.defaultSlots?.[slot];
        expect(filled, `${type.id} / ${slot}`).toBeTruthy();
      }
    }
  });
});

describe('sports', () => {
  const named = (list) => Object.values(list).filter((t) => t.sport && !t.freeLabel);

  it('offers the baseline sports somewhere', () => {
    const labels = [...named(INDOOR_SESSIONS), ...named(OUTDOOR_SESSIONS)].map((t) => t.label);
    for (const sport of ['Yoga', 'Basketball', 'Pickleball', 'Tennis', 'Softball']) {
      expect(labels).toContain(sport);
    }
    expect(labels.some((l) => l.startsWith('Golf'))).toBe(true);
  });

  it('puts a both-settings sport in both lists without colliding ids', () => {
    for (const sport of SPORTS.filter((s) => s.where === 'both')) {
      expect(INDOOR_SESSIONS[`indoor_${sport.id}`], sport.id).toBeDefined();
      expect(OUTDOOR_SESSIONS[`outdoor_${sport.id}`], sport.id).toBeDefined();
    }
    for (const sport of SPORTS.filter((s) => s.where === 'indoor')) {
      expect(OUTDOOR_SESSIONS[`outdoor_${sport.id}`]).toBeUndefined();
    }
  });

  it('keeps a write-in option last in each list', () => {
    expect(Object.keys(INDOOR_SESSIONS).at(-1)).toBe('indoor_sport');
    expect(Object.keys(OUTDOOR_SESSIONS).at(-1)).toBe('outdoor_sport');
    expect(SESSION_TYPES.indoor_sport.freeLabel).toBe(true);
    expect(SESSION_TYPES.outdoor_sport.freeLabel).toBe(true);
  });

  it('every sport declares an intensity the week strip can shade', () => {
    for (const type of [...named(INDOOR_SESSIONS), ...named(OUTDOOR_SESSIONS)]) {
      expect(['easy', 'hard'], type.id).toContain(type.intensity);
    }
  });

  it('builds a day around a sport, printing its name and a checkbox', () => {
    const { days } = buildBlock({
      ...defaultFormState(),
      startDate: START,
      rampDays: 0,
      weekTemplate: {
        ...defaultFormState().weekTemplate,
        mon: {
          indoor: { session: 'indoor_yoga', slots: {}, label: null },
          outdoor: { session: 'outdoor_pickleball', slots: {}, label: null },
        },
      },
    });
    const mon = days.find((d) => d.weekdayKey === 'mon' && d.number != null);
    expect(mon.sessions.map((s) => s.name)).toEqual(['YOGA', 'PICKLEBALL']);
    expect(mon.checkboxes).toBe(2);
  });

  it('prints a written-in activity in place of the generic name', () => {
    const { days } = buildBlock({
      ...defaultFormState(),
      startDate: START,
      rampDays: 0,
      weekTemplate: {
        ...defaultFormState().weekTemplate,
        mon: {
          indoor: { session: 'indoor_sport', slots: {}, label: 'Jiu-jitsu' },
          outdoor: { session: 'walk', slots: slotsFor('walk'), label: null },
        },
      },
    });
    const mon = days.find((d) => d.weekdayKey === 'mon' && d.number != null);
    expect(mon.sessions.find((s) => s.slot === 'indoor').name).toBe('JIU-JITSU');
  });
});

describe('default week', () => {
  it('gives all seven days both an indoor and an outdoor workout', () => {
    expect(Object.keys(DEFAULT_WEEK).sort()).toEqual([...WEEK_KEYS].sort());
    for (const key of WEEK_KEYS) {
      const day = DEFAULT_WEEK[key];
      expect(SESSION_TYPES[day.indoor?.session], `${key} indoor`).toBeTruthy();
      expect(SESSION_TYPES[day.outdoor?.session], `${key} outdoor`).toBeTruthy();
    }
  });

  it('only ever puts outdoor sessions in the outdoor slot', () => {
    for (const key of WEEK_KEYS) {
      expect(Object.keys(OUTDOOR_SESSIONS)).toContain(DEFAULT_WEEK[key].outdoor.session);
      expect(Object.keys(INDOOR_SESSIONS)).toContain(DEFAULT_WEEK[key].indoor.session);
    }
  });

  it('seeds the five daily non-negotiables', () => {
    expect(DEFAULT_RULES).toHaveLength(5);
    expect(defaultFormState().rules).toEqual(DEFAULT_RULES);
  });

  it('defaults to logging a miss, not resetting', () => {
    expect(defaultFormState().missBehavior).toBe('log');
  });

  it('defaults to no equipment so the step gets a real answer', () => {
    expect(defaultFormState().equipment).toEqual([]);
  });

  it('produces a clean block with no warnings out of the box', () => {
    const { warnings } = buildBlock({ ...defaultFormState(), startDate: START });
    expect(warnings.filter((w) => w.includes('no outdoor workout'))).toEqual([]);
    expect(warnings.filter((w) => w.includes('has no'))).toEqual([]);
  });
});
