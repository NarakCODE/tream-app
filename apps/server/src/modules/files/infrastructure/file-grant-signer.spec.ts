import { createHmac } from 'node:crypto';
import { FileGrantSigner } from './file-grant-signer';
import type { FileGrantClaims } from '../domain/file-grant.port';
const secret = 'a-private-files-signing-key-of-at-least-32-bytes';
const options = {
  signingSecret: secret,
  uploadGrantTtlSeconds: 300,
  downloadGrantTtlSeconds: 60,
};
const claims = (): FileGrantClaims => ({
  operation: 'upload',
  userId: 'user_1',
  workspaceId: 'workspace_1',
  fileId: 'file_1',
  attachmentId: 'attachment_1',
  membershipId: 'member_1',
  sessionId: 'session_1',
  expiresAt: Math.floor(Date.now() / 1000) + 300,
});
function trustedToken(value: unknown) {
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update('tream-file-grant-v1.').update(payload).digest('base64url')}`;
}
describe('user and session bound API file grants', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-02T00:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());
  it('roundtrips exact scope without exposing any storage key and uses unique nonces', () => {
    const signer = new FileGrantSigner(options);
    const scope = claims();
    const a = signer.sign(scope);
    const b = signer.sign(scope);
    expect(a).not.toBe(b);
    expect(signer.verify(a, 'upload')).toEqual(scope);
    const payload = JSON.parse(
      Buffer.from(a.split('.')[0]!, 'base64url').toString(),
    ) as Record<string, unknown>;
    expect(payload.storageKey).toBeUndefined();
    expect(payload.nonce).toBeDefined();
  });
  it('rejects expiry exactly at the boundary and a different operation', () => {
    const signer = new FileGrantSigner(options);
    const token = signer.sign(claims());
    expect(() => signer.verify(token, 'download')).toThrow('Invalid');
    jest.advanceTimersByTime(300000);
    expect(() => signer.verify(token, 'upload')).toThrow('expired');
  });
  it('rejects tampering of authenticated resource and identity scopes', () => {
    const signer = new FileGrantSigner(options);
    const token = signer.sign(claims());
    const [payload, signature] = token.split('.');
    const modified = JSON.parse(
      Buffer.from(payload!, 'base64url').toString(),
    ) as Record<string, unknown>;
    modified.workspaceId = 'other_workspace';
    expect(() =>
      signer.verify(
        `${Buffer.from(JSON.stringify(modified)).toString('base64url')}.${signature}`,
        'upload',
      ),
    ).toThrow('Invalid');
    expect(() =>
      new FileGrantSigner({
        ...options,
        signingSecret: 'another-independent-signing-key-for-files',
      }).verify(token, 'upload'),
    ).toThrow('Invalid');
  });
  it.each(['token', 'a.b.c', 'a.=', '', 'x'.repeat(4097)])(
    'rejects malformed token %s',
    (token) =>
      expect(() =>
        new FileGrantSigner(options).verify(token, 'upload'),
      ).toThrow('Invalid'),
  );
  it('rejects valid signatures carrying future issuance, excessive expiry, extra fields or wrong versions', () => {
    const signer = new FileGrantSigner(options);
    const baseline = {
      ...claims(),
      version: 1,
      issuedAt: Math.floor(Date.now() / 1000),
      nonce: 'nonce_1',
    };
    for (const patch of [
      { issuedAt: baseline.issuedAt + 1 },
      { expiresAt: baseline.expiresAt + 1 },
      { storageKey: 'secret_object_key' },
      { version: 2 },
      { userId: '../user' },
    ])
      expect(() =>
        signer.verify(trustedToken({ ...baseline, ...patch }), 'upload'),
      ).toThrow('Invalid');
  });
  it('enforces operation-specific TTL even when the token is correctly signed', () => {
    const signer = new FileGrantSigner(options);
    expect(() => signer.sign({ ...claims(), operation: 'download' })).toThrow(
      'Invalid',
    );
    const value = {
      ...claims(),
      operation: 'download' as const,
      expiresAt: Math.floor(Date.now() / 1000) + 60,
    };
    expect(signer.verify(signer.sign(value), 'download')).toEqual(value);
  });
  it('rejects weak signing keys', () =>
    expect(
      () => new FileGrantSigner({ ...options, signingSecret: 'short' }),
    ).toThrow());
});
