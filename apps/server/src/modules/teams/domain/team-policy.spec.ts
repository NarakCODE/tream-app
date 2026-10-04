import {
  canManageTeam,
  canReadTeam,
  validateCycleSettings,
} from './team-policy';
describe('Team resource policy', () => {
  it.each(['OWNER', 'ADMIN', 'MEMBER', 'GUEST'])(
    'hides unshared private teams from %s',
    (role) => {
      expect(canReadTeam(role, 'PRIVATE')).toBe(false);
    },
  );
  it.each(['OWNER', 'ADMIN', 'MEMBER'])(
    'allows workspace-visible read for %s',
    (role) => {
      expect(canReadTeam(role, 'WORKSPACE')).toBe(true);
    },
  );
  it('requires an explicit share for guests and always denies guest management', () => {
    expect(canReadTeam('GUEST', 'WORKSPACE')).toBe(false);
    expect(canReadTeam('GUEST', 'PRIVATE', 'MEMBER')).toBe(true);
    expect(canManageTeam('GUEST', 'ADMIN')).toBe(false);
  });
  it('separates scoped team-admin authority from ordinary membership', () => {
    expect(canManageTeam('MEMBER', 'MEMBER')).toBe(false);
    expect(canManageTeam('MEMBER', 'ADMIN')).toBe(true);
  });
});
describe('Cycle settings', () => {
  const valid = {
    timezone: 'Asia/Phnom_Penh',
    cycleDurationWeeks: 2,
    cycleStartDay: 1,
    cycleCooldownDays: 0,
    upcomingCyclesCount: 3,
  };
  it('accepts an IANA timezone and bounded settings', () =>
    expect(() => validateCycleSettings(valid)).not.toThrow());
  it.each([
    { timezone: 'imaginary/timezone' },
    { cycleDurationWeeks: 0 },
    { cycleStartDay: 7 },
    { cycleCooldownDays: -1 },
    { upcomingCyclesCount: 11 },
    { cycleDurationWeeks: 1, cycleCooldownDays: 7 },
  ])('rejects invalid settings %p', (patch) => {
    expect(() => validateCycleSettings({ ...valid, ...patch })).toThrow();
  });
});
