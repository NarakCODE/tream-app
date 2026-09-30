import { EventContractRegistry } from './event-contract-registry';
describe('EventContractRegistry', () => {
  const registry = new EventContractRegistry();
  it('validates published v1 and membership contracts', () => {
    expect(() =>
      registry.validate('workspace.created', 1, 'workspace', {
        workspace_id: 'ws1',
        owner_membership_id: 'mem1',
      }),
    ).not.toThrow();
    expect(() =>
      registry.validate('membership.updated', 1, 'membership', {
        workspace_id: 'ws1',
        membership_id: 'mem1',
        role: 'ADMIN',
      }),
    ).not.toThrow();
  });
  it.each([
    [
      'workspace.created',
      2,
      'workspace',
      { workspace_id: 'ws1', owner_membership_id: 'mem1' },
    ],
    [
      'workspace.created',
      1,
      'issue',
      { workspace_id: 'ws1', owner_membership_id: 'mem1' },
    ],
    [
      'workspace.created',
      1,
      'workspace',
      { workspace_id: 'ws1', owner_membership_id: 'mem1', token: 'secret' },
    ],
    ['workspace.created', 1, 'workspace', { workspace_id: 'ws1' }],
  ])(
    'rejects unknown versions, wrong aggregate, secrets and incomplete payloads',
    (type, version, aggregate, payload) => {
      expect(() =>
        registry.validate(
          type,
          version,
          aggregate,
          payload as Record<string, unknown>,
        ),
      ).toThrow();
    },
  );
});
