import {
  canManageProject,
  isCalendarDate,
  validDateRange,
} from './project-policy';
describe('Project management policy', () => {
  it.each(['OWNER', 'ADMIN'])(
    'allows %s after all team visibility checks',
    (role) => {
      expect(canManageProject(role, false, false, false)).toBe(true);
    },
  );
  it('requires a scoped management relationship for ordinary members', () => {
    expect(canManageProject('MEMBER', false, false, false)).toBe(false);
    expect(canManageProject('MEMBER', true, false, false)).toBe(true);
    expect(canManageProject('MEMBER', false, true, false)).toBe(true);
    expect(canManageProject('MEMBER', false, false, true)).toBe(true);
  });
  it('never upgrades guests using project or team membership', () => {
    expect(canManageProject('GUEST', true, true, true)).toBe(false);
  });
});
describe('Calendar dates', () => {
  it.each(['2024-02-29', '2026-10-02', '2000-02-29'])('accepts %s', (value) =>
    expect(isCalendarDate(value)).toBe(true),
  );
  it.each([
    '0000-01-01',
    '2026-02-29',
    '2026-04-31',
    '2026-13-01',
    '2026-01-00',
    '2026-10-02T00:00:00Z',
    '26-10-02',
  ])('rejects %s without silent date normalization', (value) =>
    expect(isCalendarDate(value)).toBe(false),
  );
  it('allows open ended or equal dates and rejects a reversed interval', () => {
    const start = new Date('2026-10-02T00:00:00Z');
    expect(validDateRange(null, start)).toBe(true);
    expect(validDateRange(start, null)).toBe(true);
    expect(validDateRange(start, start)).toBe(true);
    expect(validDateRange(start, new Date('2026-10-01T00:00:00Z'))).toBe(false);
  });
});
