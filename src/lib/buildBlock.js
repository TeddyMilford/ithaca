// buildBlock(formState) -> { days, warnings }
//
// Pure. No DOM, no Date-now, no I/O. Given the same form state it returns the
// same block, which is what makes it testable and what lets the PDF, the .ics,
// and the offline tracker all render from one source.
//
// The shape of a day: two workouts, one indoors and one outdoors, every day of
// the block. The only day without workouts is one the user declared as an
// exemption before Day 1.

import { addDays, diffDays, isBetween, weekdayKey, weekdayName } from './dates.js';
import {
  expandEquipment,
  formatPrescription,
  getMovement,
  isAvailable,
  isGripHeavy,
  resolveMovement,
  slotLabel,
  slotsFilled,
  SLOTS,
} from './movements.js';
import { SESSION_TYPES, WORKOUT_SLOTS } from './sessions.js';

const MAX_EXEMPTIONS = 5;
const MIN_TRAINING_WEEKS_PER_PHASE = 2;

// Slots the week must cover at least once. Conditioning and mobility are not
// listed: the outdoor workout covers conditioning every single day by design.
const REQUIRED_WEEKLY_SLOTS = SLOTS.filter(
  (s) => !['mobility', 'conditioning'].includes(s.id)
).map((s) => s.id);

/** Bodyweight substitution runs against an empty equipment set. */
const BODYWEIGHT_ONLY = new Set();

function typeOf(entry) {
  return SESSION_TYPES[entry?.session] ?? null;
}

/**
 * Resolve one workout's slot picks into printable movement lines.
 * Returns { movements, diagnostics }.
 */
function resolveWorkout(entry, ownedSet, phase, progression) {
  const type = typeOf(entry);
  if (!type) return { movements: [], diagnostics: [] };

  const picks = entry?.slots ?? {};
  const movements = [];
  const diagnostics = [];
  const counted = new Set();

  for (const slot of type.slots) {
    // A session type may supply its own fixed content — a run is a run.
    const wantedId = picks[slot] ?? type.defaultSlots?.[slot];
    if (!wantedId) {
      diagnostics.push({ code: 'empty_slot', slot, session: type.id });
      continue;
    }

    const { movement, substituted, from, reason } = resolveMovement(wantedId, ownedSet, slot);
    if (!movement) {
      diagnostics.push({
        code: 'empty_slot',
        slot,
        session: type.id,
        requested: wantedId,
        reason: reason ?? 'unresolved',
      });
      continue;
    }

    // A dual-slot movement fills two slots but prints and counts once.
    if (counted.has(movement.id)) continue;
    counted.add(movement.id);

    movements.push({
      id: movement.id,
      name: movement.name,
      slot,
      fills: movement.also_fills ? [movement.slot, movement.also_fills] : [movement.slot],
      dualSlot: Boolean(movement.dual_slot),
      calisthenic: Boolean(movement.calisthenic),
      neverToFailure: Boolean(movement.never_to_failure),
      gripHeavy: isGripHeavy(movement),
      prescription: formatPrescription(movement, {
        sets: phase?.sets,
        repLow: progression?.repLow,
        repHigh: progression?.repHigh,
      }),
      substituted,
      substitutedFrom: substituted ? from : null,
    });
  }

  return { movements, diagnostics };
}

function exemptionFor(iso, exemptions) {
  for (const e of exemptions ?? []) {
    if (!e?.start) continue;
    const end = e.end || e.start;
    const [start, finish] = diffDays(e.start, end) < 0 ? [end, e.start] : [e.start, end];
    if (isBetween(iso, start, finish)) return { ...e, start, end: finish };
  }
  return null;
}

function phaseForWeek(phases, week) {
  if (week == null) return null;
  return (phases ?? []).find((p) => week >= p.startWeek && week <= p.endWeek) ?? null;
}

export function buildBlock(formState) {
  const state = formState ?? {};
  const blockLength = Number(state.blockLength) || 75;
  const rampDays = Math.max(0, Number(state.rampDays) || 0);
  const startDate = state.startDate;
  const weekTemplate = state.weekTemplate ?? {};
  const exemptions = state.exemptions ?? [];
  const phases = state.phases ?? [];
  const progression = state.progression ?? {};

  if (!startDate) throw new Error('buildBlock: startDate is required');

  const ownedSet = expandEquipment(state.equipment);
  const days = [];
  const diagnostics = [];

  const make = (iso, number, week) =>
    makeDay({
      iso,
      number,
      week,
      phase: phaseForWeek(phases, week),
      isRamp: number == null,
      weekTemplate,
      exemptions,
      ownedSet,
      progression,
      diagnostics,
    });

  // Ramp days: dated, printed, never numbered, no checkboxes.
  for (let i = rampDays; i > 0; i -= 1) days.push(make(addDays(startDate, -i), null, null));

  // Numbered days: one per calendar day. Exemptions still consume a number.
  for (let n = 1; n <= blockLength; n += 1) {
    days.push(make(addDays(startDate, n - 1), n, Math.floor((n - 1) / 7) + 1));
  }

  collectWarnings({ days, diagnostics, phases, weekTemplate, exemptions, ownedSet, startDate });

  // De-duplicate: the same empty slot repeats every week and the user only
  // needs to be told once.
  const seen = new Set();
  const warnings = [];
  for (const d of diagnostics) {
    if (!d.message || seen.has(d.message)) continue;
    seen.add(d.message);
    warnings.push(d.message);
  }

  return { days, warnings, diagnostics };
}

function makeDay({
  iso, number, week, phase, isRamp, weekTemplate, exemptions, ownedSet, progression, diagnostics,
}) {
  const key = weekdayKey(iso);
  const template = weekTemplate[key] ?? {};
  const exemption = exemptionFor(iso, exemptions);

  const sessions = [];
  // A half day drops the indoor workout and keeps the outdoor one — you can
  // walk anywhere. A full day off is the only day with no workouts.
  const isHalf = exemption?.kind === 'half';

  if (!exemption || isHalf) {
    for (const { id: workoutSlot } of WORKOUT_SLOTS) {
      if (isHalf && workoutSlot !== 'outdoor') continue;
      const entry = template[workoutSlot];
      const type = typeOf(entry);
      if (!type) {
        if (!isRamp) {
          diagnostics.push({ code: 'missing_workout', workoutSlot, weekday: key });
        }
        continue;
      }

      const resolved = resolveWorkout(entry, ownedSet, phase, progression);
      for (const d of resolved.diagnostics) {
        diagnostics.push({ ...d, weekday: key, date: iso, workoutSlot });
      }

      sessions.push({
        slot: workoutSlot,
        id: type.id,
        name: type.freeLabel && entry?.label ? entry.label.toUpperCase() : type.name,
        label: entry?.label ?? null,
        movements: resolved.movements,
      });
    }
  }

  return {
    date: iso,
    weekday: weekdayName(iso),
    weekdayKey: key,
    number,
    week,
    phase: phase ? phase.index : null,
    isRamp,
    logged: !isRamp,
    // One checkbox per workout. Ramp days and full days off carry none; a
    // half day keeps the checkbox for the workout it kept.
    checkboxes: isRamp || (exemption && !isHalf) ? 0 : sessions.length,
    exemption: exemption
      ? { label: exemption.label || (isHalf ? 'Half day' : 'Day off'), kind: isHalf ? 'half' : 'full' }
      : null,
    sessions,
    // Flattened, for consumers that just want the day's work.
    get movements() {
      return this.sessions.flatMap((s) => s.movements);
    },
  };
}

function collectWarnings({
  days, diagnostics, phases, weekTemplate, exemptions, ownedSet, startDate,
}) {
  for (const d of diagnostics) {
    if (d.code === 'empty_slot') {
      const where = SESSION_TYPES[d.session]?.label ?? d.session;
      if (!d.requested) {
        d.message = `${where}: no movement selected for ${slotLabel(d.slot)}.`;
      } else {
        const asked = getMovement(d.requested);
        const name = asked?.name ?? d.requested;
        // Only blame equipment when equipment is actually the problem. A
        // movement you can already do, that simply cannot fill this slot, is
        // a configuration issue and needs a different sentence.
        d.message = asked && isAvailable(asked, ownedSet)
          ? `${where}: "${name}" cannot fill the ${slotLabel(d.slot)} slot, and nothing in its alternates chain can either. Pick a different movement for it.`
          : `${where}: no valid movement for ${slotLabel(d.slot)} — "${name}" needs equipment you have not checked, and nothing in its alternates chain is available.`;
      }
    } else if (d.code === 'missing_workout') {
      d.message = `${d.weekday.toUpperCase()} has no ${d.workoutSlot} workout. Every day needs one of each.`;
    }
  }

  // Weekly slot coverage across both workouts.
  const covered = new Set();
  for (const template of Object.values(weekTemplate ?? {})) {
    for (const { id: workoutSlot } of WORKOUT_SLOTS) {
      const entry = template?.[workoutSlot];
      const type = typeOf(entry);
      if (!type) continue;
      for (const slot of type.slots) {
        const id = entry?.slots?.[slot] ?? type.defaultSlots?.[slot];
        if (!id) continue;
        const { movement } = resolveMovement(id, ownedSet, slot);
        if (!movement) continue;
        // Credit every slot the movement actually fills, not just the one it
        // was asked for: a loaded carry is conditioning and grip work too.
        covered.add(slot);
        for (const filled of slotsFilled(movement)) covered.add(filled);
      }
    }
  }
  for (const slot of REQUIRED_WEEKLY_SLOTS) {
    if (!covered.has(slot)) {
      diagnostics.push({
        code: 'slot_uncovered',
        message: `${slotLabel(slot)} is not trained anywhere in the week.`,
      });
    }
  }

  // Exemptions must be declared before the block starts. Declaring one midway
  // is the thing the whole rule exists to prevent.
  for (const e of exemptions ?? []) {
    if (!e?.start) continue;
    if (e.declaredAfterStart) {
      diagnostics.push({
        code: 'late_exemption',
        message: `"${e.label || 'Day off'}" was added after Day 1. Days off have to be set aside in advance.`,
      });
    }
    if (!e.label || !String(e.label).trim()) {
      diagnostics.push({
        code: 'unlabeled_exemption',
        message: `The day off on ${e.start} has no label. Every one needs a reason written down.`,
      });
    }
  }

  // Half days weigh half: a weekend trip with the walks kept is not the same
  // concession as a weekend fully off.
  const exemptDays = days
    .filter((d) => d.number != null && d.exemption)
    .reduce((n, d) => n + (d.exemption.kind === 'half' ? 0.5 : 1), 0);
  if (exemptDays > MAX_EXEMPTIONS) {
    diagnostics.push({
      code: 'many_exemptions',
      message: `The equivalent of ${exemptDays} days off across the block. That is a lot of exemptions for 75 days.`,
    });
  }

  const numbered = days.filter((d) => d.number != null);

  // Day numbering integrity. An invariant, not a user warning.
  numbered.forEach((d, i) => {
    if (d.number !== i + 1) {
      throw new Error(`Day numbering broke at index ${i}: expected ${i + 1}, got ${d.number}`);
    }
  });

  // Every non-exempt day must have an outdoor workout. This is the rule.
  const missingOutdoor = numbered.filter(
    (d) => !d.exemption && !d.sessions.some((s) => s.slot === 'outdoor')
  );
  if (missingOutdoor.length > 0) {
    const weekdays = [...new Set(missingOutdoor.map((d) => d.weekday))].join(', ');
    diagnostics.push({
      code: 'no_outdoor',
      message: `${missingOutdoor.length} days have no outdoor workout (${weekdays}). One of the two has to be outside.`,
    });
  }

  // Grip-heavy work on consecutive days. Warn, never block.
  const reported = new Set();
  for (let i = 1; i < numbered.length; i += 1) {
    const prev = numbered[i - 1];
    const cur = numbered[i];
    const prevGrip = prev.movements.filter((m) => m.gripHeavy);
    const curGrip = cur.movements.filter((m) => m.gripHeavy);
    if (prevGrip.length === 0 || curGrip.length === 0) continue;
    const pairKey = `${prev.weekdayKey}>${cur.weekdayKey}`;
    if (reported.has(pairKey)) continue;
    reported.add(pairKey);
    diagnostics.push({
      code: 'grip_conflict',
      message: `Grip-heavy work on consecutive days (${prev.weekday} ${prevGrip[0].name}, ${cur.weekday} ${curGrip[0].name}). Warning only.`,
    });
  }

  // Phases with fewer than two full weeks left after exemptions.
  const byWeek = new Map();
  for (const d of numbered) {
    if (!byWeek.has(d.week)) byWeek.set(d.week, []);
    byWeek.get(d.week).push(d);
  }
  for (const phase of phases ?? []) {
    let full = 0;
    for (let w = phase.startWeek; w <= phase.endWeek; w += 1) {
      const week = byWeek.get(w);
      if (!week || week.length < 7) continue;
      if (week.some((d) => !d.exemption)) full += 1;
    }
    if (full < MIN_TRAINING_WEEKS_PER_PHASE) {
      diagnostics.push({
        code: 'thin_phase',
        message: `Phase ${phase.index} (weeks ${phase.startWeek}–${phase.endWeek}) has ${full} full week${full === 1 ? '' : 's'}. Fewer than ${MIN_TRAINING_WEEKS_PER_PHASE} is not enough to progress a lift.`,
      });
    }
  }
}

/** Weekly volume tally by slot. Dual-slot movements count once. */
export function weeklyVolume(days, week) {
  const tally = {};
  for (const d of days) {
    if (d.week !== week) continue;
    for (const m of d.movements) tally[m.fills[0]] = (tally[m.fills[0]] ?? 0) + 1;
  }
  return tally;
}

export default buildBlock;
