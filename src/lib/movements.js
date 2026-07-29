// Movement library access: equipment filtering, the alternates chain walk, and
// prescription formatting. Everything downstream reads the library through here.

import library from '../../data/movements.json';

export const LIBRARY = library;
export const SLOTS = library.slots;
export const EQUIPMENT = library.equipment;
export const MOVEMENTS = library.movements;

const BY_ID = new Map(MOVEMENTS.map((m) => [m.id, m]));

export function getMovement(id) {
  return BY_ID.get(id) ?? null;
}

export function slotLabel(slotId) {
  return SLOTS.find((s) => s.id === slotId)?.label ?? slotId;
}

/**
 * Expand the user's checked equipment into the full set actually available.
 * "Full gym" implies the machines and bars a commercial gym has; it does not
 * imply a trap bar, bands, a pool, or a track, which are all separate checks.
 */
export function expandEquipment(checked) {
  const owned = new Set(checked ?? []);
  for (const e of EQUIPMENT) {
    if (owned.has(e.id) && e.implies) {
      for (const implied of e.implies) owned.add(implied);
    }
  }
  return owned;
}

/**
 * equipment is AND, equipment_any is OR, and a movement must satisfy both.
 * An empty equipment list is bodyweight and always available.
 */
export function isAvailable(movement, ownedSet) {
  if (!movement) return false;
  const all = movement.equipment ?? [];
  if (!all.every((e) => ownedSet.has(e))) return false;
  const any = movement.equipment_any;
  if (any && any.length > 0 && !any.some((e) => ownedSet.has(e))) return false;
  return true;
}

/** Can this movement fill this slot, either as its primary or as a dual-slot? */
export function fillsSlot(movement, slotId) {
  if (!movement) return false;
  if (!slotId) return true;
  return movement.slot === slotId || movement.also_fills === slotId;
}

/**
 * Walk the alternates chain and take the first valid entry. Returns the
 * resolution rather than just a movement so callers can tell the user that a
 * substitution happened and what it replaced.
 *
 * `slot` constrains the search. The chain is walked transitively, and without
 * this constraint it wanders: barbell shrug (traps) alternates to farmer carry
 * (a carry that also fills traps), whose own alternates are carries only. A
 * weighted backpack walk is not a substitute for a shrug, so a candidate that
 * cannot fill the target slot is rejected even when its equipment is available.
 *
 * Visited-set guards against a cycle in the data (a alternates b, b alternates a).
 */
export function resolveMovement(id, ownedSet, slot = null) {
  const requested = getMovement(id);
  if (!requested) return { movement: null, substituted: false, from: id, reason: 'unknown' };

  // Default the target slot to the requested movement's own slot.
  const target = slot ?? requested.slot;

  if (isAvailable(requested, ownedSet) && fillsSlot(requested, target)) {
    return { movement: requested, substituted: false, from: null, reason: null };
  }

  const seen = new Set([id]);
  const queue = [...(requested.alternates ?? [])];
  while (queue.length > 0) {
    const nextId = queue.shift();
    if (seen.has(nextId)) continue;
    seen.add(nextId);
    const candidate = getMovement(nextId);
    if (!candidate) continue;
    if (isAvailable(candidate, ownedSet) && fillsSlot(candidate, target)) {
      return { movement: candidate, substituted: true, from: id, reason: 'equipment' };
    }
    // Keep walking: the alternate's own alternates extend the chain. A
    // candidate rejected for its slot may still lead to one that fits.
    for (const deeper of candidate.alternates ?? []) if (!seen.has(deeper)) queue.push(deeper);
  }

  return { movement: null, substituted: false, from: id, reason: 'no_valid_alternate' };
}

/** Every movement that can legally fill `slotId` given the checked equipment. */
export function movementsForSlot(slotId, ownedSet) {
  return MOVEMENTS.filter(
    (m) => (m.slot === slotId || m.also_fills === slotId) && isAvailable(m, ownedSet)
  );
}

/** Movements that fill a slot at all, ignoring equipment. Used by the editor UI. */
export function allMovementsForSlot(slotId) {
  return MOVEMENTS.filter((m) => m.slot === slotId || m.also_fills === slotId);
}

const UNIT_SUFFIX = {
  reps: '',
  seconds: 's',
  yards: 'yd',
  minutes: 'min',
};

/**
 * Render a scheme as a single short string for a PDF cell: "3x5-8", "3x40yd",
 * "2x30s", "4x3min".
 *
 * Two rules from the spec are enforced here rather than at render time, because
 * this is the only place that decides what a set looks like:
 *   - never_to_failure movements always print a rep target, never "xmax".
 *   - calisthenics print "xmax" only when the movement is not capped.
 */
export function formatPrescription(movement, { sets, repLow, repHigh } = {}) {
  if (!movement) return '';
  const s = movement.scheme ?? {};
  const setCount = sets ?? s.sets ?? 3;
  const unit = s.unit ?? 'reps';
  const suffix = UNIT_SUFFIX[unit] ?? '';

  // Rep-range overrides from the progression section apply to rep-based work
  // only. You do not stretch a 40 yd carry to an 8-12 range.
  let low = s.low;
  let high = s.high;
  if (unit === 'reps' && repLow != null && repHigh != null && !movement.calisthenic) {
    low = repLow;
    high = repHigh;
  }

  if (s.max && !movement.never_to_failure) {
    return `${setCount}×max`;
  }
  if (low == null) return `${setCount} sets`;
  if (low === high) return `${setCount}×${low}${suffix}`;
  return `${setCount}×${low}–${high}${suffix}`;
}

/** Slots a movement occupies. Dual-slot movements fill two but count once. */
export function slotsFilled(movement) {
  if (!movement) return [];
  return movement.also_fills ? [movement.slot, movement.also_fills] : [movement.slot];
}

export function isGripHeavy(movement) {
  return Boolean(movement?.tags?.includes('grip_heavy'));
}
