// RFC 5545 .ics builder, hand-rolled.
//
// One all-day event per numbered day. TRANSP:TRANSPARENT so the block never
// makes the user look busy to anyone reading their free/busy.

import { addDays } from '../lib/dates.js';

const CRLF = '\r\n';

/** Escape per RFC 5545 §3.3.11. Order matters: backslash first. */
function esc(text) {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Content lines are folded at 75 octets, continuation lines start with a space. */
function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;

  const out = [];
  let current = '';
  let currentBytes = 0;
  const limit = () => (out.length === 0 ? 75 : 74); // continuations lose one to the leading space

  for (const ch of line) {
    const chBytes = new TextEncoder().encode(ch).length;
    if (currentBytes + chBytes > limit()) {
      out.push(current);
      current = '';
      currentBytes = 0;
    }
    current += ch;
    currentBytes += chBytes;
  }
  if (current) out.push(current);
  return out[0] + out.slice(1).map((l) => CRLF + ' ' + l).join('');
}

const compact = (iso) => iso.replace(/-/g, '');

function stamp(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}` +
    `T${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}Z`
  );
}

/** Stable per-block UID so re-importing replaces rather than duplicates. */
function uid(formState, day) {
  const slug = String(formState.name || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `${slug}-${formState.startDate}-d${day.number}@ithaca.local`;
}

export function buildICS(formState, block, now = new Date()) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ithaca Builder//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(formState.name || 'Untitled')}`,
  ];

  const dtstamp = stamp(now);

  for (const day of block.days) {
    // Numbered days only. Ramp days are not part of the count and do not
    // belong on a calendar that the user walks day by day.
    if (day.number == null) continue;

    const isHalf = day.exemption?.kind === 'half';
    const workouts = day.sessions.map((x) => x.name).join(' + ');
    const summary = day.exemption
      ? (isHalf
          ? `D${day.number} - HALF (${day.exemption.label}) ${workouts}`
          : `D${day.number} - OFF (${day.exemption.label})`)
      : `D${day.number} - ${workouts}`;

    const detail = [];
    if (day.exemption) {
      detail.push(isHalf
        ? `Half day: ${day.exemption.label} — indoor workout dropped`
        : `Day off: ${day.exemption.label}`);
    }
    for (const session of day.sessions) {
      detail.push(`${session.slot === 'outdoor' ? 'OUTDOOR' : 'INDOOR'}: ${session.name}`);
      for (const mv of session.movements) detail.push(`  ${mv.name} ${mv.prescription}`);
    }
    if (day.phase) detail.push(`Phase ${day.phase}, week ${day.week}`);

    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid(formState, day)}`,
      `DTSTAMP:${dtstamp}`,
      // All-day events use VALUE=DATE with a non-inclusive DTEND.
      `DTSTART;VALUE=DATE:${compact(day.date)}`,
      `DTEND;VALUE=DATE:${compact(addDays(day.date, 1))}`,
      fold(`SUMMARY:${esc(summary)}`),
      fold(`DESCRIPTION:${esc(detail.join('\n'))}`),
      'TRANSP:TRANSPARENT',
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join(CRLF) + CRLF;
}

export function icsFilename(formState) {
  const slug = String(formState.name || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `${slug}-${formState.startDate}.ics`;
}
