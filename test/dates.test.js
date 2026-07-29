import { describe, expect, it } from 'vitest';
import {
  addDays,
  diffDays,
  fromDayNumber,
  nextSunday,
  toDayNumber,
  weekdayName,
} from '../src/lib/dates.js';

describe('civil date arithmetic', () => {
  it('round-trips through the day-number epoch', () => {
    for (const iso of ['1970-01-01', '2000-02-29', '2024-02-29', '2026-07-28', '2100-03-01']) {
      expect(fromDayNumber(toDayNumber(iso))).toBe(iso);
    }
  });

  it('knows the epoch was a Thursday', () => {
    expect(weekdayName('1970-01-01')).toBe('THU');
  });

  it('crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('handles leap and non-leap Februaries', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2100-02-28', 1)).toBe('2100-03-01'); // 2100 is not a leap year
  });

  it('is immune to DST transitions', () => {
    // US spring forward 2027-03-14, fall back 2027-11-07. A local-time Date
    // would land these on the wrong day or lose an hour; day numbers cannot.
    expect(addDays('2027-03-13', 1)).toBe('2027-03-14');
    expect(addDays('2027-03-14', 1)).toBe('2027-03-15');
    expect(diffDays('2027-03-13', '2027-03-15')).toBe(2);
    expect(addDays('2027-11-06', 1)).toBe('2027-11-07');
    expect(addDays('2027-11-07', 1)).toBe('2027-11-08');
    expect(diffDays('2027-11-06', '2027-11-08')).toBe(2);
    // EU transitions differ by date; check those too.
    expect(diffDays('2027-03-27', '2027-03-29')).toBe(2);
    expect(diffDays('2027-10-30', '2027-11-01')).toBe(2);
  });

  it('finds the next Sunday strictly after a date', () => {
    expect(nextSunday('2026-07-28')).toBe('2026-08-02'); // a Tuesday
    expect(weekdayName(nextSunday('2026-08-02'))).toBe('SUN');
    expect(nextSunday('2026-08-02')).toBe('2026-08-09'); // already Sunday, moves on
  });

  it('rejects malformed dates', () => {
    expect(() => addDays('2026-13-01', 1)).toThrow();
    expect(() => addDays('2026-02-30', 1)).toThrow();
    expect(() => addDays('not-a-date', 1)).toThrow();
  });
});
