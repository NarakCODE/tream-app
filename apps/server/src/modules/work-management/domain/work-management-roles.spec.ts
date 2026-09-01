import {
  canAdministerWorkManagement,
  canJoinTeam,
  canReadWorkManagement,
  canWriteWorkManagement,
} from './work-management-roles';

describe('Work Management Role Policies', () => {
  it('allows all roles to read work management resources', () => {
    expect(canReadWorkManagement('OWNER')).toBe(true);
    expect(canReadWorkManagement('ADMIN')).toBe(true);
    expect(canReadWorkManagement('MEMBER')).toBe(true);
    expect(canReadWorkManagement('GUEST')).toBe(true);
  });

  it('allows owner, admin, and member to write, but denies guest', () => {
    expect(canWriteWorkManagement('OWNER')).toBe(true);
    expect(canWriteWorkManagement('ADMIN')).toBe(true);
    expect(canWriteWorkManagement('MEMBER')).toBe(true);
    expect(canWriteWorkManagement('GUEST')).toBe(false);
  });

  it('restricts administrative actions to owner and admin', () => {
    expect(canAdministerWorkManagement('OWNER')).toBe(true);
    expect(canAdministerWorkManagement('ADMIN')).toBe(true);
    expect(canAdministerWorkManagement('MEMBER')).toBe(false);
    expect(canAdministerWorkManagement('GUEST')).toBe(false);
  });

  it('permits owner, admin, and member to join public teams, but denies guest', () => {
    expect(canJoinTeam('OWNER')).toBe(true);
    expect(canJoinTeam('ADMIN')).toBe(true);
    expect(canJoinTeam('MEMBER')).toBe(true);
    expect(canJoinTeam('GUEST')).toBe(false);
  });
});
