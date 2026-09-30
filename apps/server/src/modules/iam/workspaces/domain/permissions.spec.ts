import {
  canManageRole,
  hasPermission,
  PERMISSIONS,
  retainsActiveOwner,
  ROLES,
  type WorkspaceRole,
  type WorkspacePermission,
} from './permissions';
describe('Workspace RBAC policy', () => {
  const expected: Record<WorkspaceRole, readonly WorkspacePermission[]> = {
    OWNER: [...PERMISSIONS],
    ADMIN: PERMISSIONS.filter(
      (permission) =>
        permission !== 'workspace.delete' && permission !== 'audit.read',
    ),
    MEMBER: [
      'workspace.read',
      'membership.read',
      'issue.read',
      'issue.update',
      'preferences.update',
    ],
    GUEST: ['workspace.read', 'preferences.update'],
  };
  for (const role of ROLES)
    for (const permission of PERMISSIONS) {
      it(`${role} ${permission}`, () => {
        expect(hasPermission(role, permission)).toBe(
          expected[role].includes(permission),
        );
      });
    }
  for (const actor of ROLES)
    for (const current of ROLES)
      for (const desired of ROLES) {
        it(`${actor} managing ${current} to ${desired}`, () => {
          expect(canManageRole(actor, current, desired)).toBe(
            actor === 'OWNER' ||
              (actor === 'ADMIN' &&
                ['MEMBER', 'GUEST'].includes(current) &&
                ['MEMBER', 'GUEST'].includes(desired)),
          );
        });
      }
  it('prevents deleting, suspending or demoting final active owner', () => {
    const members = [
      { id: 'owner', role: 'OWNER' as const, state: 'ACTIVE' as const },
      { id: 'suspended', role: 'OWNER' as const, state: 'SUSPENDED' as const },
    ];
    expect(retainsActiveOwner(members, 'owner', 'OWNER', 'LEFT')).toBe(false);
    expect(retainsActiveOwner(members, 'owner', 'OWNER', 'SUSPENDED')).toBe(
      false,
    );
    expect(retainsActiveOwner(members, 'owner', 'ADMIN', 'ACTIVE')).toBe(false);
    expect(retainsActiveOwner(members, 'owner', 'OWNER', 'ACTIVE')).toBe(true);
  });
  it('allows owner departure with another active owner', () => {
    expect(
      retainsActiveOwner(
        [
          { id: 'first', role: 'OWNER', state: 'ACTIVE' },
          { id: 'second', role: 'OWNER', state: 'ACTIVE' },
        ],
        'first',
        'MEMBER',
        'LEFT',
      ),
    ).toBe(true);
  });
});
