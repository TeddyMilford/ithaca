import { describe, expect, it } from 'vitest';
import { buildBlock } from '../src/lib/buildBlock.js';
import { defaultFormState, defaultWeekTemplate, generatePhases } from '../src/lib/defaults.js';
import { addDays, weekdayName } from '../src/lib/dates.js';
import { expandEquipment, resolveMovement } from '../src/lib/movements.js';
import { SESSION_TYPES, slotsFor } from '../src/lib/sessions.js';

// A fixed reference block so no test depends on today's date.
// 2026-08-02 is a Sunday.
const START = '2026-08-02';

function state(overrides = {}) {
  return { ...defaultFormState(), startDate: START, ...overrides };
}

const numbered = (days) => days.filter((d) => d.number != null);
const ramp = (days) => days.filter((d) => d.isRamp);
const byDate = (days, iso) => days.find((d) => d.date === iso);
const workout = (session) => ({ session, slots: slotsFor(session), label: null });

describe('block boundaries', () => {
  it('produces exactly blockLength numbered days plus rampDays unnumbered', () => {
    const { days } = buildBlock(state({ blockLength: 75, rampDays: 14 }));
    expect(numbered(days)).toHaveLength(75);
    expect(ramp(days)).toHaveLength(14);
    expect(days).toHaveLength(89);
  });

  it('starts Day 1 on startDate and ends on the last calendar day', () => {
    const { days } = buildBlock(state({ blockLength: 75, rampDays: 14 }));
    const n = numbered(days);
    expect(n[0].date).toBe(START);
    expect(n[0].number).toBe(1);
    expect(n[74].date).toBe(addDays(START, 74));
    expect(n[74].number).toBe(75);
  });

  it('places ramp days immediately before Day 1, in order', () => {
    const { days } = buildBlock(state({ rampDays: 14 }));
    const r = ramp(days);
    expect(r[0].date).toBe(addDays(START, -14));
    expect(r[13].date).toBe(addDays(START, -1));
    expect(days[14].date).toBe(START);
  });

  it('numbers every day exactly once with no gaps and no repeats', () => {
    const { days } = buildBlock(state({ blockLength: 90, rampDays: 14 }));
    const nums = numbered(days).map((d) => d.number);
    expect(nums).toEqual(Array.from({ length: 90 }, (_, i) => i + 1));
    expect(new Set(nums).size).toBe(90);
  });

  it('advances the calendar by exactly one day per entry', () => {
    const { days } = buildBlock(state({ blockLength: 75, rampDays: 14 }));
    for (let i = 1; i < days.length; i += 1) {
      expect(days[i].date).toBe(addDays(days[i - 1].date, 1));
    }
  });

  it.each([60, 75, 90])('builds a %i-day block', (blockLength) => {
    const { days } = buildBlock(state({ blockLength, phases: generatePhases(blockLength) }));
    const n = numbered(days);
    expect(n).toHaveLength(blockLength);
    expect(n.at(-1).date).toBe(addDays(START, blockLength - 1));
  });
});

describe('two workouts a day', () => {
  it('gives every numbered day an indoor and an outdoor session', () => {
    const { days } = buildBlock(state());
    for (const d of numbered(days)) {
      expect(d.sessions.map((s) => s.slot), d.date).toEqual(['indoor', 'outdoor']);
    }
  });

  it('gives every day two checkboxes, one per workout', () => {
    const { days } = buildBlock(state());
    for (const d of numbered(days)) expect(d.checkboxes, d.date).toBe(2);
  });

  it('has no rest days anywhere in the block', () => {
    const { days } = buildBlock(state());
    expect(numbered(days).filter((d) => d.sessions.length === 0)).toEqual([]);
  });

  it('puts movements in both sessions', () => {
    const { days } = buildBlock(state());
    const monday = byDate(days, addDays(START, 1));
    for (const s of monday.sessions) expect(s.movements.length).toBeGreaterThan(0);
  });

  it('warns when a day is missing its outdoor workout', () => {
    const { warnings } = buildBlock(state({
      weekTemplate: {
        ...defaultFormState().weekTemplate,
        wed: { indoor: workout('gym_a') },
      },
    }));
    expect(warnings.some((w) => w.includes('no outdoor workout'))).toBe(true);
  });

  it('warns when a day is missing a workout entirely', () => {
    const { warnings } = buildBlock(state({
      weekTemplate: { ...defaultFormState().weekTemplate, thu: {} },
    }));
    expect(warnings.some((w) => w.includes('has no indoor workout'))).toBe(true);
    expect(warnings.some((w) => w.includes('has no outdoor workout'))).toBe(true);
  });

  it('exposes a flattened movement list across both sessions', () => {
    const d = byDate(buildBlock(state()).days, addDays(START, 1));
    expect(d.movements).toHaveLength(d.sessions.flatMap((s) => s.movements).length);
  });
});

describe('ramp days', () => {
  it('are unnumbered, unlogged, and carry no checkboxes', () => {
    const { days } = buildBlock(state({ rampDays: 14 }));
    for (const d of ramp(days)) {
      expect(d.number).toBeNull();
      expect(d.logged).toBe(false);
      expect(d.checkboxes).toBe(0);
      expect(d.week).toBeNull();
      expect(d.phase).toBeNull();
    }
  });

  it('still print their sessions', () => {
    const { days } = buildBlock(state({ rampDays: 14 }));
    expect(ramp(days).every((d) => d.sessions.length === 2)).toBe(true);
  });

  it('supports a zero-length ramp', () => {
    const { days } = buildBlock(state({ rampDays: 0 }));
    expect(ramp(days)).toHaveLength(0);
    expect(days[0].number).toBe(1);
  });
});

describe('weeks and phases', () => {
  it('assigns weeks by index from Day 1, not by calendar week', () => {
    const n = numbered(buildBlock(state({ blockLength: 90 })).days);
    expect(n[0].week).toBe(1);
    expect(n[6].week).toBe(1);
    expect(n[7].week).toBe(2);
    expect(n[89].week).toBe(Math.floor(89 / 7) + 1);
  });

  it('assigns phases by week index', () => {
    const phases = generatePhases(75);
    const { days } = buildBlock(state({ phases }));
    for (const d of numbered(days)) {
      const expected = phases.find((p) => d.week >= p.startWeek && d.week <= p.endWeek);
      expect(d.phase).toBe(expected.index);
    }
  });

  it('warns when a phase has fewer than two full weeks', () => {
    const phases = [
      { index: 1, startWeek: 1, endWeek: 1, sets: 3, cardio: '', swim: 'short' },
      { index: 2, startWeek: 2, endWeek: 11, sets: 3, cardio: '', swim: 'long' },
    ];
    const { warnings } = buildBlock(state({ phases, rampDays: 0 }));
    expect(warnings.some((w) => w.includes('Phase 1'))).toBe(true);
  });
});

describe('declared days off', () => {
  const off = (start, end, label, extra = {}) => ({ start, end, label, ...extra });

  it('consumes a day number like any other day', () => {
    const { days } = buildBlock(state({
      exemptions: [off(addDays(START, 10), addDays(START, 10), 'Wedding')],
    }));
    const n = numbered(days);
    expect(n).toHaveLength(75);
    expect(n.map((d) => d.number)).toEqual(Array.from({ length: 75 }, (_, i) => i + 1));
    expect(byDate(days, addDays(START, 10)).number).toBe(11);
  });

  it('has no workouts and no checkboxes', () => {
    const { days } = buildBlock(state({
      exemptions: [off(addDays(START, 10), addDays(START, 10), 'Wedding')],
    }));
    const d = byDate(days, addDays(START, 10));
    expect(d.exemption).toEqual({ label: 'Wedding', kind: 'full' });
    expect(d.sessions).toEqual([]);
    expect(d.checkboxes).toBe(0);
  });

  it('half day keeps the outdoor workout and its checkbox', () => {
    const { days } = buildBlock(state({
      exemptions: [off(addDays(START, 10), addDays(START, 10), 'Lake trip', { kind: 'half' })],
    }));
    const d = byDate(days, addDays(START, 10));
    expect(d.exemption).toEqual({ label: 'Lake trip', kind: 'half' });
    expect(d.sessions).toHaveLength(1);
    expect(d.sessions[0].slot).toBe('outdoor');
    expect(d.checkboxes).toBe(1);
  });

  it('half days count half toward the too-many warning', () => {
    // 10 half days = 5 equivalent: right at the limit, no warning.
    const atLimit = buildBlock(state({
      exemptions: Array.from({ length: 10 }, (_, i) =>
        off(addDays(START, i * 7), addDays(START, i * 7), `Trip ${i}`, { kind: 'half' })),
    }));
    expect(atLimit.warnings.some((w) => w.includes('a lot of exemptions'))).toBe(false);

    const over = buildBlock(state({
      exemptions: Array.from({ length: 11 }, (_, i) =>
        off(addDays(START, i * 6), addDays(START, i * 6), `Trip ${i}`, { kind: 'half' })),
    }));
    expect(over.warnings.some((w) => w.includes('a lot of exemptions'))).toBe(true);
  });

  it('covers a multi-day range across a month edge', () => {
    const { days } = buildBlock(state({
      exemptions: [off('2026-08-29', '2026-09-01', 'Graduation')],
    }));
    expect(days.filter((d) => d.exemption).map((d) => d.date)).toEqual([
      '2026-08-29', '2026-08-30', '2026-08-31', '2026-09-01',
    ]);
  });

  it('treats a missing end date as a single day', () => {
    const { days } = buildBlock(state({
      exemptions: [{ start: addDays(START, 5), label: 'Wedding' }],
    }));
    expect(days.filter((d) => d.exemption)).toHaveLength(1);
  });

  it('warns when one was declared after Day 1', () => {
    const { warnings } = buildBlock(state({
      exemptions: [off(addDays(START, 10), addDays(START, 10), 'Wedding', { declaredAfterStart: true })],
    }));
    expect(warnings.some((w) => w.includes('set aside in advance'))).toBe(true);
  });

  it('warns when one has no label', () => {
    const { warnings } = buildBlock(state({
      exemptions: [off(addDays(START, 10), addDays(START, 10), '')],
    }));
    expect(warnings.some((w) => w.includes('no label'))).toBe(true);
  });

  it('warns when there are too many', () => {
    const { warnings } = buildBlock(state({
      exemptions: Array.from({ length: 6 }, (_, i) =>
        off(addDays(START, i * 5), addDays(START, i * 5), `Day ${i}`)),
    }));
    expect(warnings.some((w) => w.includes('a lot of exemptions'))).toBe(true);
  });

  it('does not warn for a reasonable number', () => {
    const { warnings } = buildBlock(state({
      exemptions: [off(addDays(START, 10), addDays(START, 10), 'Wedding')],
    }));
    expect(warnings.some((w) => w.includes('a lot of exemptions'))).toBe(false);
  });

  it('tolerates a reversed range', () => {
    const { days } = buildBlock(state({
      exemptions: [off(addDays(START, 12), addDays(START, 10), 'Backwards')],
    }));
    expect(days.filter((d) => d.exemption)).toHaveLength(3);
  });
});

describe('DST transitions', () => {
  it('does not skip or duplicate a day across spring forward', () => {
    const { days } = buildBlock(state({ startDate: '2027-03-01', blockLength: 30, rampDays: 7 }));
    const dates = days.map((d) => d.date);
    expect(new Set(dates).size).toBe(dates.length);
    expect(dates).toContain('2027-03-13');
    expect(dates).toContain('2027-03-14');
    expect(dates).toContain('2027-03-15');
    expect(numbered(days).map((d) => d.number)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 1)
    );
  });

  it('does not skip or duplicate a day across fall back', () => {
    const { days } = buildBlock(state({ startDate: '2027-10-25', blockLength: 30, rampDays: 7 }));
    const dates = days.map((d) => d.date);
    expect(new Set(dates).size).toBe(dates.length);
    expect(dates).toContain('2027-11-07');
  });

  it('keeps weekdays correct across a transition', () => {
    const { days } = buildBlock(state({ startDate: '2027-03-01', blockLength: 30, rampDays: 0 }));
    for (const d of days) expect(d.weekday).toBe(weekdayName(d.date));
  });
});

describe('equipment resolution', () => {
  it('substitutes down the alternates chain when equipment is missing', () => {
    // The hand-built default week asks for goblet squats; with no equipment
    // they fall down the chain to bodyweight squats.
    const { days } = buildBlock(state({
      equipment: [], weekTemplate: defaultWeekTemplate(), rampDays: 0,
    }));
    const indoor = byDate(days, addDays(START, 1)).sessions.find((s) => s.slot === 'indoor');
    const squat = indoor.movements.find((m) => m.slot === 'squat');
    expect(squat.id).toBe('bodyweight_squat');
    expect(squat.substituted).toBe(true);
    expect(squat.substitutedFrom).toBe('goblet_squat');
  });

  it('resolves every session type default with a full gym', () => {
    // A session type whose fixed movement cannot fill its own declared slot is
    // broken for everyone at every equipment level. The ruck was exactly that.
    const owned = expandEquipment(['full_gym', 'track', 'pool', 'trap_bar', 'bands']);
    for (const type of Object.values(SESSION_TYPES)) {
      for (const [slot, id] of Object.entries(type.defaultSlots ?? {})) {
        const { movement } = resolveMovement(id, owned, slot);
        expect(movement, `${type.id}: "${id}" cannot fill ${slot}`).not.toBeNull();
      }
    }
  });

  it('a ruck trains conditioning and carries with no equipment at all', () => {
    const { days } = buildBlock(state({
      equipment: [],
      weekTemplate: {
        ...defaultWeekTemplate(),
        mon: { indoor: workout('mobility'), outdoor: workout('ruck') },
      },
      rampDays: 0,
    }));
    const outdoor = byDate(days, addDays(START, 1)).sessions.find((s) => s.slot === 'outdoor');
    expect(outdoor.movements).toHaveLength(1);
    expect(outdoor.movements[0].id).toBe('weighted_backpack_walk');
    expect(outdoor.movements[0].fills).toEqual(['carry', 'conditioning']);
  });

  it('leaves a slot empty and warns when nothing in the chain is valid', () => {
    const { warnings } = buildBlock(state({
      equipment: [],
      weekTemplate: {
        ...defaultFormState().weekTemplate,
        mon: {
          indoor: { session: 'gym_b', slots: { traps: 'barbell_shrug' } },
          outdoor: workout('walk'),
        },
      },
      rampDays: 0,
    }));
    expect(warnings.some((w) => w.includes('Traps'))).toBe(true);
  });

  it('treats full gym as implying machines but not a trap bar', () => {
    const { days } = buildBlock(state({
      equipment: ['full_gym'],
      weekTemplate: {
        ...defaultFormState().weekTemplate,
        mon: {
          indoor: { session: 'gym_full', slots: { squat: 'leg_press', hinge: 'trap_bar_deadlift' } },
          outdoor: workout('walk'),
        },
      },
      rampDays: 0,
    }));
    const indoor = byDate(days, addDays(START, 1)).sessions[0];
    expect(indoor.movements.find((m) => m.id === 'leg_press')).toBeTruthy();
    const hinge = indoor.movements.find((m) => m.slot === 'hinge');
    expect(hinge.id).not.toBe('trap_bar_deadlift');
    expect(hinge.substituted).toBe(true);
  });

  it('never prints a max-effort set for an overhead press', () => {
    const { days } = buildBlock(state({ rampDays: 0 }));
    const pressers = days.flatMap((d) => d.movements).filter((m) => m.neverToFailure);
    expect(pressers.length).toBeGreaterThan(0);
    for (const m of pressers) expect(m.prescription).not.toContain('max');
  });

  it('counts a dual-slot movement once', () => {
    const { days } = buildBlock(state({
      equipment: ['dumbbells', 'pullup_bar'],
      weekTemplate: {
        ...defaultFormState().weekTemplate,
        mon: {
          indoor: {
            session: 'gym_b',
            slots: {
              vertical_pull: 'chinup', biceps: 'chinup',
              carry: 'farmer_carry', traps: 'farmer_carry',
            },
          },
          outdoor: workout('walk'),
        },
      },
      rampDays: 0,
    }));
    const indoor = byDate(days, addDays(START, 1)).sessions[0];
    expect(indoor.movements.filter((m) => m.id === 'chinup')).toHaveLength(1);
    expect(indoor.movements.find((m) => m.id === 'chinup').fills).toEqual(['vertical_pull', 'biceps']);
  });
});

describe('warnings', () => {
  it('de-duplicates a warning that would otherwise repeat every week', () => {
    const { warnings } = buildBlock(state({ blockLength: 90, rampDays: 0, equipment: [] }));
    expect(new Set(warnings).size).toBe(warnings.length);
  });

  it('returns strings only', () => {
    const { warnings } = buildBlock(state({ equipment: [] }));
    expect(warnings.every((w) => typeof w === 'string')).toBe(true);
  });

  it('warns on grip-heavy work on consecutive days', () => {
    const { warnings } = buildBlock(state({
      equipment: ['full_gym', 'barbell'],
      weekTemplate: {
        ...defaultFormState().weekTemplate,
        mon: {
          indoor: { session: 'gym_full', slots: { hinge: 'conventional_deadlift' } },
          outdoor: workout('walk'),
        },
        tue: {
          indoor: { session: 'gym_b', slots: { horizontal_row: 'barbell_row' } },
          outdoor: workout('walk'),
        },
      },
      rampDays: 0,
    }));
    expect(warnings.some((w) => w.includes('Grip-heavy'))).toBe(true);
  });
});
