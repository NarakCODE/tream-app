import type { Cycle, CycleSettings } from './cycle';

export interface CalculatedCycleDraft {
  number: number;
  name: string;
  startsAt: Date;
  endsAt: Date;
}

export const getAlignedStartOfWeek = (
  date: Date,
  startDay: number, // 1 = Monday, 7/0 = Sunday
): Date => {
  const result = new Date(date.getTime());
  result.setUTCHours(0, 0, 0, 0);
  const currentDay = result.getUTCDay(); // 0 is Sunday, 1 is Monday ... 6 is Saturday
  const targetDay = startDay % 7;
  const diff = (currentDay - targetDay + 7) % 7;
  result.setUTCDate(result.getUTCDate() - diff);
  return result;
};

export const calculateNextCycles = (
  settings: CycleSettings,
  existingCycles: Cycle[],
  referenceDate: Date = new Date(),
): CalculatedCycleDraft[] => {
  if (!settings.cyclesEnabled) {
    return [];
  }

  const durationMs = settings.cycleDurationWeeks * 7 * 24 * 60 * 60 * 1000;
  const cooldownMs = settings.cycleCooldownDays * 24 * 60 * 60 * 1000;

  const sortedExisting = [...existingCycles].sort(
    (a, b) => a.number - b.number,
  );
  const latestExisting = sortedExisting[sortedExisting.length - 1];

  // Count active / future cycles (endsAt > referenceDate and not completed)
  const activeOrFutureCount = sortedExisting.filter(
    (c) => c.endsAt.getTime() > referenceDate.getTime(),
  ).length;

  const needed = Math.max(
    0,
    settings.upcomingCyclesCount - activeOrFutureCount,
  );
  if (needed === 0 && sortedExisting.length > 0) {
    return [];
  }

  const drafts: CalculatedCycleDraft[] = [];

  let nextNumber = latestExisting ? latestExisting.number + 1 : 1;
  let nextStart: Date;

  if (latestExisting) {
    nextStart = new Date(latestExisting.endsAt.getTime() + cooldownMs);
  } else {
    nextStart = getAlignedStartOfWeek(referenceDate, settings.cycleStartDay);
  }

  // Generate at least 1 current + upcoming cycles count if brand new, or `needed` additional cycles
  const totalToGenerate = latestExisting
    ? needed
    : Math.max(1, settings.upcomingCyclesCount);

  for (let i = 0; i < totalToGenerate; i++) {
    const startsAt = new Date(nextStart.getTime());
    const endsAt = new Date(startsAt.getTime() + durationMs);
    drafts.push({
      number: nextNumber,
      name: `Cycle ${nextNumber}`,
      startsAt,
      endsAt,
    });
    nextNumber++;
    nextStart = new Date(endsAt.getTime() + cooldownMs);
  }

  return drafts;
};
