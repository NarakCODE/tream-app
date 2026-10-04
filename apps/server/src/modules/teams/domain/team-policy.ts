export const TERMINAL_CATEGORIES = ['COMPLETED', 'CANCELED', 'DUPLICATE'];
export function validateCycleSettings(settings: {
  timezone: string;
  cycleDurationWeeks: number;
  cycleCooldownDays: number;
  cycleStartDay: number;
  upcomingCyclesCount: number;
}) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: settings.timezone });
  } catch {
    throw new Error('Invalid timezone.');
  }
  if (
    !Number.isInteger(settings.cycleDurationWeeks) ||
    settings.cycleDurationWeeks < 1 ||
    settings.cycleDurationWeeks > 8 ||
    !Number.isInteger(settings.cycleStartDay) ||
    settings.cycleStartDay < 0 ||
    settings.cycleStartDay > 6 ||
    !Number.isInteger(settings.cycleCooldownDays) ||
    settings.cycleCooldownDays < 0 ||
    settings.cycleCooldownDays > 14 ||
    settings.cycleCooldownDays >= settings.cycleDurationWeeks * 7 ||
    !Number.isInteger(settings.upcomingCyclesCount) ||
    settings.upcomingCyclesCount < 1 ||
    settings.upcomingCyclesCount > 10
  )
    throw new Error('Invalid cycle settings.');
}
export function canReadTeam(
  workspaceRole: string,
  visibility: string,
  teamRole?: string,
) {
  return (
    !!teamRole || (workspaceRole !== 'GUEST' && visibility === 'WORKSPACE')
  );
}
export function canManageTeam(workspaceRole: string, teamRole?: string) {
  return (
    workspaceRole !== 'GUEST' &&
    (['OWNER', 'ADMIN'].includes(workspaceRole) || teamRole === 'ADMIN')
  );
}
