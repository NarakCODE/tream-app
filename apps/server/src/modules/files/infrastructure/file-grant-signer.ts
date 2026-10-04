import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  FileGrant,
  FileGrantError,
  type FileGrantClaims,
  type FileGrantOperation,
} from '../domain/file-grant.port';
export interface FileGrantSignerOptions {
  signingSecret: string;
  uploadGrantTtlSeconds: number;
  downloadGrantTtlSeconds: number;
}
interface SignedClaims extends FileGrantClaims {
  version: 1;
  issuedAt: number;
  nonce: string;
}
const fields = [
  'operation',
  'userId',
  'workspaceId',
  'fileId',
  'attachmentId',
  'membershipId',
  'sessionId',
  'expiresAt',
  'version',
  'issuedAt',
  'nonce',
];
const identifiers = [
  'userId',
  'workspaceId',
  'fileId',
  'attachmentId',
  'membershipId',
  'sessionId',
  'nonce',
] as const;
export class FileGrantSigner extends FileGrant {
  constructor(private readonly options: FileGrantSignerOptions) {
    super();
    if (
      Buffer.byteLength(options.signingSecret) < 32 ||
      !Number.isSafeInteger(options.uploadGrantTtlSeconds) ||
      options.uploadGrantTtlSeconds < 1 ||
      options.uploadGrantTtlSeconds > 900 ||
      !Number.isSafeInteger(options.downloadGrantTtlSeconds) ||
      options.downloadGrantTtlSeconds < 1 ||
      options.downloadGrantTtlSeconds > 300
    )
      throw new Error(
        'File grants require a separate signing key and positive bounded lifetimes.',
      );
  }
  sign(claims: FileGrantClaims): string {
    const issuedAt = Math.floor(Date.now() / 1000);
    const value: SignedClaims = {
      ...claims,
      version: 1,
      issuedAt,
      nonce: randomUUID(),
    };
    this.validate(value, claims.operation, issuedAt);
    const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${payload}.${this.signature(payload).toString('base64url')}`;
  }
  verify(token: string, operation: FileGrantOperation): FileGrantClaims {
    try {
      if (token.length > 4096) throw new FileGrantError();
      const parts = token.split('.');
      if (
        parts.length !== 2 ||
        !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))
      )
        throw new FileGrantError();
      const [payload, encodedSignature] = parts as [string, string];
      const signature = Buffer.from(encodedSignature, 'base64url');
      const expected = this.signature(payload);
      if (
        signature.toString('base64url') !== encodedSignature ||
        signature.length !== expected.length ||
        !timingSafeEqual(signature, expected)
      )
        throw new FileGrantError();
      const decoded = Buffer.from(payload, 'base64url');
      if (decoded.toString('base64url') !== payload) throw new FileGrantError();
      const value: unknown = JSON.parse(decoded.toString('utf8'));
      this.validate(value, operation, Math.floor(Date.now() / 1000));
      return {
        operation: value.operation,
        userId: value.userId,
        workspaceId: value.workspaceId,
        fileId: value.fileId,
        attachmentId: value.attachmentId,
        membershipId: value.membershipId,
        sessionId: value.sessionId,
        expiresAt: value.expiresAt,
      };
    } catch {
      throw new FileGrantError();
    }
  }
  private signature(payload: string) {
    return createHmac('sha256', this.options.signingSecret)
      .update('tream-file-grant-v1.')
      .update(payload)
      .digest();
  }
  private validate(
    value: unknown,
    operation: FileGrantOperation,
    now: number,
  ): asserts value is SignedClaims {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      throw new FileGrantError();
    const claim = value as Record<string, unknown>;
    if (
      Object.keys(claim).length !== fields.length ||
      Object.keys(claim).some((key) => !fields.includes(key)) ||
      claim.version !== 1 ||
      claim.operation !== operation ||
      !['upload', 'download'].includes(operation)
    )
      throw new FileGrantError();
    if (
      identifiers.some(
        (key) =>
          typeof claim[key] !== 'string' ||
          !/^[A-Za-z0-9_-]{1,128}$/.test(claim[key]),
      )
    )
      throw new FileGrantError();
    const expiresAt = claim.expiresAt;
    const issuedAt = claim.issuedAt;
    const ttl =
      operation === 'upload'
        ? this.options.uploadGrantTtlSeconds
        : this.options.downloadGrantTtlSeconds;
    if (
      typeof expiresAt !== 'number' ||
      typeof issuedAt !== 'number' ||
      !Number.isSafeInteger(expiresAt) ||
      !Number.isSafeInteger(issuedAt) ||
      issuedAt > now ||
      expiresAt <= now ||
      expiresAt <= issuedAt ||
      expiresAt - issuedAt > ttl ||
      expiresAt - now > ttl
    )
      throw new FileGrantError();
  }
}
