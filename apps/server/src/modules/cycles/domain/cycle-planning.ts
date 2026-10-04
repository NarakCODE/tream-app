export class CyclePlanningError extends Error {
  constructor(
    message: string,
    readonly kind: 'validation' | 'conflict' = 'validation',
  ) {
    super(message);
  }
}

// Dates are calendar dates in a team's zone; durations are never 24-hour arithmetic.
const formatter = (timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    calendar: 'iso8601',
    numberingSystem: 'latn',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
function parts(at: Date, timeZone: string) {
  return Object.fromEntries(
    formatter(timeZone)
      .formatToParts(at)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value]),
  );
}
export function localDate(at: Date, timeZone: string) {
  const p = parts(at, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}
export function calendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new CyclePlanningError('Use YYYY-MM-DD calendar dates.');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value ||
    date.getUTCFullYear() < 1970
  )
    throw new CyclePlanningError('Invalid calendar date.');
  return date;
}
export function addCalendarDays(value: string, days: number) {
  const date = calendarDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function localMidnight(value: string, timeZone: string) {
  const wall = calendarDate(value).getTime();
  const offsets = new Set<number>();
  for (let hours = -48; hours <= 48; hours += 6) {
    const probe = new Date(wall + hours * 3_600_000);
    const p = parts(probe, timeZone);
    offsets.add(
      Date.UTC(
        +p.year!,
        +p.month! - 1,
        +p.day!,
        +p.hour!,
        +p.minute!,
        +p.second!,
      ) - probe.getTime(),
    );
  }
  const candidates = [...offsets]
    .map((offset) => new Date(wall - offset))
    .filter((date) => {
      const p = parts(date, timeZone);
      return (
        localDate(date, timeZone) === value &&
        p.hour === '00' &&
        p.minute === '00' &&
        p.second === '00'
      );
    })
    .sort((a, b) => a.getTime() - b.getTime());
  // Ambiguous midnight uses its first occurrence. Missing midnight/date is rejected.
  if (!candidates[0])
    throw new CyclePlanningError(
      'Calendar midnight does not exist in this timezone; supply explicit UTC bounds.',
    );
  return candidates[0];
}
export function validateWindow(startsAt: Date, endsAt: Date) {
  if (
    !Number.isFinite(startsAt.getTime()) ||
    !Number.isFinite(endsAt.getTime()) ||
    endsAt <= startsAt
  )
    throw new CyclePlanningError('Cycle end must be after its start.');
  if (endsAt.getTime() - startsAt.getTime() > 366 * 86_400_000)
    throw new CyclePlanningError('Cycle window cannot exceed one year.');
}
export function nextWindow(
  after: Date,
  settings: {
    timezone: string;
    cycleStartDay: number;
    cycleDurationWeeks: number;
    cycleCooldownDays: number;
  },
) {
  let date = addCalendarDays(
    localDate(after, settings.timezone),
    settings.cycleCooldownDays,
  );
  const weekday = calendarDate(date).getUTCDay();
  date = addCalendarDays(date, (settings.cycleStartDay - weekday + 7) % 7);
  let startsAt = localMidnight(date, settings.timezone);
  if (startsAt < after) {
    date = addCalendarDays(date, 7);
    startsAt = localMidnight(date, settings.timezone);
  }
  const endsAt = localMidnight(
    addCalendarDays(date, settings.cycleDurationWeeks * 7),
    settings.timezone,
  );
  validateWindow(startsAt, endsAt);
  return { startsAt, endsAt };
}
export function requireRevision(actual: number, expected: number) {
  if (actual !== expected)
    throw new CyclePlanningError('Cycle revision is stale.', 'conflict');
}
