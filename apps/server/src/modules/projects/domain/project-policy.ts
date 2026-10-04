export const PROJECT_CATEGORIES = [
  'PLANNED',
  'STARTED',
  'PAUSED',
  'COMPLETED',
  'CANCELED',
] as const;
export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];
export const PROJECT_HEALTH = ['ON_TRACK', 'AT_RISK', 'OFF_TRACK'] as const;
export function canManageProject(
  role: string,
  lead: boolean,
  member: boolean,
  allTeamAdmin: boolean,
) {
  return (
    role !== 'GUEST' &&
    (role === 'OWNER' || role === 'ADMIN' || lead || member || allTeamAdmin)
  );
}
export function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-'))
    return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
export function validDateRange(start: Date | null, target: Date | null) {
  return !start || !target || target >= start;
}
