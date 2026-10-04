import {
  addCalendarDays,
  calendarDate,
  localDate,
  localMidnight,
  nextWindow,
  requireRevision,
  validateWindow,
} from './cycle-planning';
describe('timezone-aware cycle planning', () => {
  it.each([
    '2026-02-30',
    '2026-13-01',
    '2026-00-01',
    '2026-2-01',
    '1969-12-31',
  ])('rejects invalid calendar date %s', (date) =>
    expect(() => calendarDate(date)).toThrow(),
  );
  it('handles leap dates and year boundaries', () => {
    expect(addCalendarDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('converts a positive-offset local midnight without host timezone dependence', () => {
    expect(localMidnight('2026-10-01', 'Asia/Phnom_Penh').toISOString()).toBe(
      '2026-09-30T17:00:00.000Z',
    );
  });
  it('preserves local calendar duration across spring DST', () => {
    const start = localMidnight('2026-03-08', 'America/New_York');
    const end = localMidnight('2026-03-15', 'America/New_York');
    expect(start.toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-15T04:00:00.000Z');
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(167);
  });
  it('preserves local calendar duration across autumn DST', () => {
    const start = localMidnight('2026-11-01', 'America/New_York');
    const end = localMidnight('2026-11-08', 'America/New_York');
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(169);
  });
  it('rejects a skipped calendar date instead of silently shifting the cycle', () => {
    expect(() => localMidnight('2011-12-30', 'Pacific/Apia')).toThrow(
      'does not exist',
    );
  });
  it('rejects missing DST midnight', () => {
    expect(() => localMidnight('2018-11-04', 'America/Sao_Paulo')).toThrow(
      'does not exist',
    );
  });
  it('chooses first occurrence of ambiguous midnight', () => {
    expect(localMidnight('2026-11-01', 'America/Havana').toISOString()).toBe(
      '2026-11-01T04:00:00.000Z',
    );
  });
  it('aligns start day after cooldown using calendar days', () => {
    const result = nextWindow(new Date('2026-10-05T00:00:00Z'), {
      timezone: 'UTC',
      cycleStartDay: 1,
      cycleDurationWeeks: 2,
      cycleCooldownDays: 1,
    });
    expect(result.startsAt.toISOString()).toBe('2026-10-12T00:00:00.000Z');
    expect(result.endsAt.toISOString()).toBe('2026-10-26T00:00:00.000Z');
  });
  it('keeps adjacent windows when cooldown is zero', () => {
    const result = nextWindow(new Date('2026-10-05T00:00:00Z'), {
      timezone: 'UTC',
      cycleStartDay: 1,
      cycleDurationWeeks: 1,
      cycleCooldownDays: 0,
    });
    expect(result.startsAt.toISOString()).toBe('2026-10-05T00:00:00.000Z');
  });
  it('does not schedule a midnight before a non-midnight anchor', () => {
    const result = nextWindow(new Date('2026-10-05T12:00:00Z'), {
      timezone: 'UTC',
      cycleStartDay: 1,
      cycleDurationWeeks: 1,
      cycleCooldownDays: 0,
    });
    expect(localDate(result.startsAt, 'UTC')).toBe('2026-10-12');
  });
  it.each([
    ['2026-10-02', '2026-10-01'],
    ['2026-10-01', '2026-10-01'],
    ['2026-01-01', '2028-01-01'],
  ])('rejects invalid or excessive windows %s %s', (a, b) =>
    expect(() => validateWindow(new Date(a), new Date(b))).toThrow(),
  );
  it('rejects stale revisions', () => {
    expect(() => requireRevision(2, 1)).toThrow('stale');
    expect(() => requireRevision(2, 2)).not.toThrow();
  });
});
