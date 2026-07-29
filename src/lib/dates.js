// Civil-date helpers.
//
// Every date in this app is a 'YYYY-MM-DD' string and all arithmetic runs
// through an integer day count. Nothing here ever constructs a local-time Date,
// so a DST transition cannot shift a day forward or back. That matters: a block
// is a run of calendar days, not a run of 86400-second intervals.

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export { WEEKDAYS, WEEKDAY_KEYS, MONTHS };

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseISO(iso) {
  const m = ISO.exec(String(iso));
  if (!m) throw new Error(`Not an ISO date: ${iso}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12) throw new Error(`Bad month: ${iso}`);
  if (d < 1 || d > daysInMonth(y, mo)) throw new Error(`Bad day: ${iso}`);
  return { y, m: mo, d };
}

export function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y, m) {
  if (m === 2) return isLeap(y) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

// Howard Hinnant's days_from_civil. Returns days since 1970-01-01.
export function toDayNumber(iso) {
  const { y, m, d } = parseISO(iso);
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor((yy >= 0 ? yy : yy - 399) / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

// Inverse: civil_from_days.
export function fromDayNumber(n) {
  const z = n + 719468;
  const era = Math.floor((z >= 0 ? z : z - 146096) / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return format(m <= 2 ? y + 1 : y, m, d);
}

export function format(y, m, d) {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function addDays(iso, n) {
  return fromDayNumber(toDayNumber(iso) + n);
}

export function diffDays(a, b) {
  return toDayNumber(b) - toDayNumber(a);
}

// 0 = Sunday. 1970-01-01 was a Thursday (4).
export function weekdayIndex(iso) {
  const n = toDayNumber(iso);
  return ((((n + 4) % 7) + 7) % 7);
}

export function weekdayName(iso) {
  return WEEKDAYS[weekdayIndex(iso)];
}

export function weekdayKey(iso) {
  return WEEKDAY_KEYS[weekdayIndex(iso)];
}

export function isBetween(iso, start, end) {
  const n = toDayNumber(iso);
  return n >= toDayNumber(start) && n <= toDayNumber(end);
}

export function rangeInclusive(start, end) {
  const out = [];
  for (let n = toDayNumber(start); n <= toDayNumber(end); n += 1) out.push(fromDayNumber(n));
  return out;
}

// The next Sunday strictly after `iso`. Used for the default start date, since
// a block reads better starting on a week boundary.
export function nextSunday(iso) {
  const wd = weekdayIndex(iso);
  return addDays(iso, wd === 0 ? 7 : 7 - wd);
}

export function todayISO(now = new Date()) {
  return format(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function monthName(iso) {
  return MONTHS[parseISO(iso).m - 1];
}

export function dayOfMonth(iso) {
  return parseISO(iso).d;
}
