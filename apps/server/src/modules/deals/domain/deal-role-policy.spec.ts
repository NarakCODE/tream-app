import type { WorkspaceRole } from '../../iam/domain/workspace-membership';
import { canReadDeals, canWriteDeals } from './deal-role-policy';

describe('deal role policy', () => {
  it.each<WorkspaceRole>(['OWNER', 'ADMIN', 'MEMBER', 'GUEST'])(
    'allows %s to read deals',
    (role) => {
      expect(canReadDeals(role)).toBe(true);
    },
  );

  it.each<[WorkspaceRole, boolean]>([
    ['OWNER', true],
    ['ADMIN', true],
    ['MEMBER', true],
    ['GUEST', false],
  ])('applies write access for %s', (role, expected) => {
    expect(canWriteDeals(role)).toBe(expected);
  });
});
