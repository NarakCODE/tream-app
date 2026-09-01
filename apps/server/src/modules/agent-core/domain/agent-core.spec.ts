import {
  canTransitionRun,
  evaluateCondition,
  isSkillAllowed,
  needsApproval,
} from './agent-core';

describe('agent core policies', () => {
  it('enforces the strict run state machine', () => {
    expect(canTransitionRun('QUEUED', 'RUNNING')).toBe(true);
    expect(canTransitionRun('QUEUED', 'COMPLETED')).toBe(false);
    expect(canTransitionRun('COMPLETED', 'RUNNING')).toBe(false);
  });
  it('enforces skill permissions and approval policies', () => {
    expect(
      isSkillAllowed({ skillPermissions: ['mail.send'] }, 'contacts.create'),
    ).toBe(false);
    expect(
      needsApproval('EXTERNAL_ACTIONS', { isWrite: true, isExternal: true }),
    ).toBe(true);
    expect(needsApproval('NONE', { isWrite: true, isExternal: true })).toBe(
      false,
    );
  });
  it('evaluates documented and negative condition operators', () => {
    const payload = { from: 'lead@example.com', score: 80, tags: ['vip'] };
    expect(
      evaluateCondition(
        { field: 'from', operator: 'not_ends_with', value: '@mycompany.com' },
        payload,
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        { field: 'score', operator: 'gte', value: 80 },
        payload,
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        { field: 'tags', operator: 'contains', value: 'vip' },
        payload,
      ),
    ).toBe(true);
  });
});
