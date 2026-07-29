import { describe, expect, it } from 'vitest';

import { hydrate } from '../src/lib/store.js';
import { progressionFor } from '../src/lib/generateWeek.js';

describe('hydrate', () => {
  it('re-derives progression from the goal, discarding hand-set values', () => {
    // A config saved back when the progression step was editable.
    const saved = {
      startDate: '2026-08-16',
      profile: { goal: 'strength', experience: 'consistent', liftDays: 3 },
      progression: {
        scheme: 'rpe', repLow: 20, repHigh: 30,
        incrementUpper: 99, incrementLower: 99, stallRule: 'repeat', printLoad: true,
      },
    };
    const state = hydrate(saved);
    const expected = progressionFor(saved.profile);
    expect(state.progression.scheme).toBe(expected.scheme);
    expect(state.progression.repLow).toBe(expected.repLow);
    expect(state.progression.repHigh).toBe(expected.repHigh);
    expect(state.progression.stallRule).toBe(expected.stallRule);
    // printLoad is a print option the user still owns.
    expect(state.progression.printLoad).toBe(true);
  });

  it('regenerates phases rather than restoring dead fields', () => {
    const state = hydrate({
      startDate: '2026-08-16',
      blockLength: 75,
      phases: [{ index: 1, startWeek: 1, endWeek: 11, sets: 3, cardio: 'row 20min', swim: 'long', buffer: 3 }],
    });
    expect(state.phases.length).toBeGreaterThan(1);
    for (const phase of state.phases) {
      expect(phase).not.toHaveProperty('cardio');
      expect(phase).not.toHaveProperty('swim');
      expect(phase).not.toHaveProperty('buffer');
    }
  });

  it('keeps phases consistent with a saved non-default block length', () => {
    const state = hydrate({ startDate: '2026-08-16', blockLength: 90 });
    expect(state.phases.at(-1).endWeek).toBe(Math.ceil(90 / 7));
  });

  it('treats a hand-built saved week as edited so the generator leaves it alone', () => {
    const week = { mon: { indoor: { session: 'gym_a', slots: {} }, outdoor: { session: 'run', slots: {} } } };
    expect(hydrate({ startDate: '2026-08-16', weekTemplate: week }).weekEdited).toBe(true);
    expect(hydrate({ startDate: '2026-08-16' }).weekEdited).toBe(false);
  });
});
