import type { WorkspaceRole } from '../../iam/domain/workspace-membership';
import { canReadTasks, canWriteTasks } from './task-role-policy';

describe('task role policy', () => {
  it.each<WorkspaceRole>(['OWNER', 'ADMIN', 'MEMBER', 'GUEST'])(
    'allows %s to read tasks',
    (role) => {
      expect(canReadTasks(role)).toBe(true);
    },
  );

  it.each<[WorkspaceRole, boolean]>([
    ['OWNER', true],
    ['ADMIN', true],
    ['MEMBER', true],
    ['GUEST', false],
  ])('applies write access for %s', (role, expected) => {
    expect(canWriteTasks(role)).toBe(expected);
  });
});
