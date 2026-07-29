// Form state shape and defaults. Every field has one, so a user who changes
// nothing still gets a valid block.

import { nextSunday, todayISO } from './dates.js';
import { generateWeek, progressionFor } from './generateWeek.js';
import { DEFAULT_EQUIPMENT, DEFAULT_RULES, DEFAULT_WEEK } from './sessions.js';

export const DEFAULT_PROFILE = { goal: 'allround', experience: 'returning', liftDays: 3, wfhDays: [] };

export const STORAGE_KEY = 'ithaca.builder.v1';

export const BLOCK_LENGTHS = [75, 60, 90];

export const MISS_BEHAVIORS = [
  { id: 'log', label: 'Log it, nothing resets' },
  { id: 'reset', label: 'Back to Day 1' },
];



/**
 * Split a block into 3 or 4 phases by week count. Anything past nine weeks gets
 * 4. The remainder lands on the final phase, so the last phase is the long one.
 *
 * Phases carry only what the block actually renders: a week span and a set
 * count. They are derived from the block length, never edited.
 */
export function generatePhases(blockLength) {
  const weeks = Math.ceil(blockLength / 7);
  const count = weeks <= 9 ? 3 : 4;
  const base = Math.floor(weeks / count);

  const phases = [];
  let cursor = 1;
  for (let i = 0; i < count; i += 1) {
    const isLast = i === count - 1;
    const span = isLast ? weeks - cursor + 1 : base;
    phases.push({
      index: i + 1,
      startWeek: cursor,
      endWeek: cursor + span - 1,
      // Volume steps up in the third phase, then backs off to finish.
      sets: [3, 3, 4, 3][i] ?? 3,
    });
    cursor += span;
  }
  return phases;
}

export function defaultWeekTemplate() {
  // Deep copy: the form mutates this freely.
  return JSON.parse(JSON.stringify(DEFAULT_WEEK));
}

export function defaultFormState(now = new Date()) {
  const blockLength = 75;
  const profile = { ...DEFAULT_PROFILE };
  const equipment = [...DEFAULT_EQUIPMENT];
  const { week, notes } = generateWeek(profile, equipment);
  return {
    version: 1,

    name: 'Untitled',
    // Fixed for now: Sunday 2026-08-16. Falls back to the next Sunday once
    // that date has passed.
    startDate: todayISO(now) <= '2026-08-16' ? '2026-08-16' : nextSunday(todayISO(now)),
    blockLength,
    rampDays: 14,
    // Log the miss and keep going. Starting over is the hard mode, opt-in.
    missBehavior: 'log',

    profile,
    equipment,
    // Drafted from the profile until the user edits it by hand.
    weekTemplate: week,
    weekNotes: notes,
    weekEdited: false,

    // Derived from the goal, never asked about. printLoad is the one part the
    // user sets, and it lives with the other print options.
    progression: { ...progressionFor(profile), printLoad: false },

    phases: generatePhases(blockLength),
    // Days off, declared in advance and labelled. Nothing else gets a pass.
    exemptions: [],
    rules: [...DEFAULT_RULES],
    hideRules: false,

    style: {
      id: 'blueprint',
      paper: 'letter',
      orientation: 'landscape',
      weeksPerPage: 2,
      },
  };
}
