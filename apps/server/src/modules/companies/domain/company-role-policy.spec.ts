import type { WorkspaceRole } from '../../iam/domain/workspace-membership';
import { canReadCompanies, canWriteCompanies } from './company-role-policy';

describe('company role policy', () => {
  it.each<WorkspaceRole>(['OWNER', 'ADMIN', 'MEMBER', 'GUEST'])(
    'allows %s to read companies',
    (role) => {
      expect(canReadCompanies(role)).toBe(true);
    },
  );

  it.each<[WorkspaceRole, boolean]>([
    ['OWNER', true],
    ['ADMIN', true],
    ['MEMBER', true],
    ['GUEST', false],
  ])('applies write access for %s', (role, expected) => {
    expect(canWriteCompanies(role)).toBe(expected);
  });
});
