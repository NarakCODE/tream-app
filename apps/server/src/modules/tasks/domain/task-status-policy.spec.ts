import type { TaskStatus } from './task';
import {
  canPatchTaskStatus,
  statusAfterCompletion,
  statusAfterReopen,
} from './task-status-policy';

describe('task status policy', () => {
  it.each<TaskStatus>(['TODO', 'IN_PROGRESS'])(
    'allows a patch transition from %s',
    (status) => {
      expect(canPatchTaskStatus(status, 'TODO')).toBe(true);
      expect(canPatchTaskStatus(status, 'IN_PROGRESS')).toBe(true);
    },
  );

  it('requires the reopen action before patching a completed task', () => {
    expect(canPatchTaskStatus('DONE', 'TODO')).toBe(false);
    expect(canPatchTaskStatus('DONE', 'IN_PROGRESS')).toBe(false);
  });

  it.each<[TaskStatus, TaskStatus]>([
    ['TODO', 'DONE'],
    ['IN_PROGRESS', 'DONE'],
    ['DONE', 'DONE'],
  ])('completes %s as %s', (current, expected) => {
    expect(statusAfterCompletion(current)).toBe(expected);
  });

  it.each<[TaskStatus, TaskStatus]>([
    ['TODO', 'TODO'],
    ['IN_PROGRESS', 'IN_PROGRESS'],
    ['DONE', 'TODO'],
  ])('reopens %s as %s', (current, expected) => {
    expect(statusAfterReopen(current)).toBe(expected);
  });
});
