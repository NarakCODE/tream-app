import {
  canNotify,
  deliveryIdentity,
  isDefinitiveMailRejection,
  retryDelayMs,
} from './notification-policy';
describe('notification privacy and delivery semantics', () => {
  it('deduplicates by source event, recipient and notification kind', () => {
    expect(deliveryIdentity('event', 'member', 'MENTION')).toBe(
      deliveryIdentity('event', 'member', 'MENTION'),
    );
    expect(deliveryIdentity('event', 'member', 'MENTION')).not.toBe(
      deliveryIdentity('event', 'member', 'SUBSCRIPTION'),
    );
  });
  it('never notifies the actor, departed users or disabled accounts', () => {
    const recipient = { id: 'member', state: 'ACTIVE', disabledAt: null };
    expect(canNotify('actor', recipient)).toBe(true);
    expect(canNotify('member', recipient)).toBe(false);
    expect(canNotify('actor', { ...recipient, state: 'SUSPENDED' })).toBe(
      false,
    );
    expect(canNotify('actor', { ...recipient, disabledAt: new Date() })).toBe(
      false,
    );
  });
  it('only explicit SMTP rejection is safe for automatic retry; timeouts are ambiguous', () => {
    expect(isDefinitiveMailRejection({ responseCode: 451 })).toBe(true);
    expect(isDefinitiveMailRejection({ responseCode: 550 })).toBe(true);
    expect(isDefinitiveMailRejection({ code: 'ETIMEDOUT' })).toBe(false);
    expect(
      isDefinitiveMailRejection(new Error('socket closed after DATA')),
    ).toBe(false);
    expect(isDefinitiveMailRejection(null)).toBe(false);
  });
  it('backs off retries with a one-hour ceiling', () => {
    expect(retryDelayMs(1)).toBe(60000);
    expect(retryDelayMs(100)).toBe(3600000);
  });
});
