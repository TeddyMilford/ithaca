// Form state persistence. One localStorage key, so a refresh never wipes work.

import { defaultFormState, generatePhases, STORAGE_KEY } from './defaults.js';
import { progressionFor } from './generateWeek.js';

/**
 * A day in the week template holds two workouts, `indoor` and `outdoor`. An
 * earlier version held a single `session` per day. A saved config in the old
 * shape cannot be migrated meaningfully — a one-a-day week says nothing about
 * what the second workout should be — so it is discarded for the default week
 * rather than loaded into a state that would generate a broken block.
 */
function isCurrentWeekShape(week) {
  if (!week || typeof week !== 'object') return false;
  return Object.values(week).every((d) => d && typeof d === 'object' && ('indoor' in d || 'outdoor' in d));
}

/** Shallow-merge saved state over defaults so a new field added later still has a value. */
function hydrate(saved) {
  const base = defaultFormState();
  if (!saved || typeof saved !== 'object') return base;

  const hadOwnWeek = isCurrentWeekShape(saved.weekTemplate);

  return {
    ...base,
    ...saved,
    profile: { ...base.profile, ...(saved.profile ?? {}) },
    // A saved week from before these flags existed was built by hand; treat it
    // as edited so the generator never overwrites it.
    weekEdited: typeof saved.weekEdited === 'boolean' ? saved.weekEdited : hadOwnWeek,
    weekNotes: Array.isArray(saved.weekNotes) ? saved.weekNotes : (hadOwnWeek ? [] : base.weekNotes),
    // Progression follows the goal. A config saved back when it was editable
    // keeps only printLoad; the rest is re-derived so it cannot drift from
    // the profile it is supposed to match.
    progression: {
      ...progressionFor({ ...base.profile, ...(saved.profile ?? {}) }),
      printLoad: Boolean(saved.progression?.printLoad),
    },
    // 'soviet' was this style's name while it was red. The PDF would fall back
    // to it anyway, but the form would show a blank style name if left alone.
    style: {
      ...base.style,
      ...(saved.style ?? {}),
      id: saved.style?.id === 'soviet' ? 'blueprint' : (saved.style?.id ?? base.style.id),
    },
    weekTemplate: isCurrentWeekShape(saved.weekTemplate)
      ? { ...base.weekTemplate, ...saved.weekTemplate }
      : base.weekTemplate,
    // Regenerated from the block length rather than restored: phases are
    // derived now, and a saved array may carry fields nothing reads.
    phases: generatePhases(Number(saved.blockLength) || base.blockLength),
    // Exemptions from before half days existed are full days off.
    exemptions: Array.isArray(saved.exemptions)
      ? saved.exemptions.map((e) => ({ kind: 'full', ...e }))
      : [],
    rules: Array.isArray(saved.rules) ? saved.rules : base.rules,
    equipment: Array.isArray(saved.equipment) ? saved.equipment : base.equipment,
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return hydrate(raw ? JSON.parse(raw) : null);
  } catch (err) {
    console.warn('Could not read saved state, starting fresh.', err);
    return defaultFormState();
  }
}

export function save(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    // Quota or private-mode failure. The form still works, it just will not persist.
    console.warn('Could not save state.', err);
    return false;
  }
}

export function clear() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
}

export { hydrate };
