import { canReadEvents, canReprocessEvents } from './event-role-policy';

describe('event role policy', () => {
  it.each(['OWNER', 'ADMIN', 'MEMBER', 'GUEST'] as const)(
    'allows %s to read events',
    (role) => {
      expect(canReadEvents(role)).toBe(true);
    },
  );

  it.each([
    ['OWNER', true],
    ['ADMIN', true],
    ['MEMBER', false],
    ['GUEST', false],
  ] as const)('evaluates %s reprocessing permission', (role, allowed) => {
    expect(canReprocessEvents(role)).toBe(allowed);
  });
});
