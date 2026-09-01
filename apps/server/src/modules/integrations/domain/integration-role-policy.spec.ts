import {
  canReadIntegrations,
  canWriteIntegrations,
} from './integration-role-policy';

describe('integration role policy', () => {
  it('allows every workspace member to read connection status and mail', () => {
    expect(canReadIntegrations('OWNER')).toBe(true);
    expect(canReadIntegrations('ADMIN')).toBe(true);
    expect(canReadIntegrations('MEMBER')).toBe(true);
    expect(canReadIntegrations('GUEST')).toBe(true);
  });

  it('limits connection and mail mutations to owners and admins', () => {
    expect(canWriteIntegrations('OWNER')).toBe(true);
    expect(canWriteIntegrations('ADMIN')).toBe(true);
    expect(canWriteIntegrations('MEMBER')).toBe(false);
    expect(canWriteIntegrations('GUEST')).toBe(false);
  });
});
