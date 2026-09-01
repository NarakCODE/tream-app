export interface Cycle {
  id: string;
  teamId: string;
  number: number;
  name: string;
  startsAt: Date;
  endsAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CycleProgress {
  totalIssues: number;
  completedIssues: number;
  percent: number;
}

export interface CycleSettings {
  cycleDurationWeeks: number;
  cycleStartDay: number;
  cycleCooldownDays: number;
  upcomingCyclesCount: number;
  cyclesEnabled: boolean;
  timezone: string;
}

export const calculateCycleProgress = (
  totalIssues: number,
  completedIssues: number,
): CycleProgress => {
  const percent =
    totalIssues === 0 ? 0 : Math.round((completedIssues / totalIssues) * 100);
  return {
    totalIssues,
    completedIssues,
    percent,
  };
};
