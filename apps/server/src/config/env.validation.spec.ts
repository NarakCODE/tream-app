import 'reflect-metadata';
import { validateEnvironment } from './env.validation';

describe('environment boundaries', () => {
  it('accepts explicit multi-origin development configuration', () => {
    expect(
      validateEnvironment({
        CORS_ORIGIN: 'http://localhost:3000, http://localhost:3001',
      }).CORS_ORIGIN,
    ).toContain('3001');
  });

  it.each([
    { CORS_ORIGIN: '*' },
    { CORS_ORIGIN: 'https://example.com/path' },
    { DATABASE_URL: 'https://example.com' },
    { TRUST_PROXY_HOPS: '10' },
    { DATABASE_POOL_MAX: '0' },
    { AUTH_MAIL_ENCRYPTION_KEY: 'short' },
  ])('rejects unsafe or malformed settings %j', (input) => {
    expect(() => validateEnvironment(input)).toThrow('Environment validation');
  });

  it('requires explicit production credentials and delivery configuration', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'production' })).toThrow(
      'missing production variables',
    );
  });
});

describe('private file environment boundaries', () => {
  const production = {
    NODE_ENV: 'production',
    AUTH_MAIL_ENCRYPTION_KEY: 'a'.repeat(64),
    DATABASE_URL:
      'postgresql://runtime:random-db-password@db.example.com/tream',
    JWT_ISSUER: 'tream-api',
    JWT_AUDIENCE: 'tream-client',
    JWT_ACCESS_SECRET: 'jwt-production-credential-unique-0123456789',
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '30d',
    MAGIC_LINK_TTL: '15m',
    MAGIC_LINK_BASE_URL: 'https://app.example.com',
    CORS_ORIGIN: 'https://app.example.com',
    SMTP_HOST: 'mail.example.com',
    SMTP_PORT: '465',
    SMTP_FROM: 'Tream <noreply@example.com>',
    FILES_STORAGE_DRIVER: 's3',
    FILES_BUCKET: 'private-uploads',
    FILES_REGION: 'us-east-1',
    FILES_SCANNER_DRIVER: 'clamav',
    FILES_CLAMAV_HOST: 'scanner',
    FILES_CLAMAV_PORT: '3310',
    FILES_SIGNING_SECRET: 'file-production-credential-unique-9876543210',
  };
  it('accepts production Resend without SMTP configuration', () => {
    const base: Record<string, unknown> = { ...production };
    delete base.SMTP_HOST;
    delete base.SMTP_PORT;
    delete base.SMTP_FROM;
    expect(
      validateEnvironment({
        ...base,
        MAIL_PROVIDER: 'resend',
        RESEND_API_KEY: 're_production_credential',
        RESEND_FROM: 'Tream <sender@example.com>',
      }).MAIL_PROVIDER,
    ).toBe('resend');
  });
  it('rejects the Resend testing domain in production', () => {
    expect(() =>
      validateEnvironment({
        ...production,
        MAIL_PROVIDER: 'resend',
        RESEND_API_KEY: 're_production_credential',
        RESEND_FROM: 'Tream <onboarding@resend.dev>',
      }),
    ).toThrow('verified sender domain');
  });
  it('provides bounded local defaults', () => {
    const config = validateEnvironment({});
    expect(config.FILES_STORAGE_DRIVER).toBe('filesystem');
    expect(config.FILES_MAX_FILE_BYTES).toBe(25 * 1024 * 1024);
    expect(config.FILES_WORKSPACE_QUOTA_BYTES).toBe(1024 * 1024 * 1024);
  });
  it('accepts production IAM credentials without hardcoded access keys', () => {
    expect(validateEnvironment(production).FILES_STORAGE_DRIVER).toBe('s3');
  });
  it.each([
    { FILES_STORAGE_DRIVER: 'filesystem' },
    { FILES_SCANNER_DRIVER: 'development' },
    { FILES_ENDPOINT: 'http://storage.example.com' },
    { FILES_SIGNING_SECRET: 'development-only-file-grant-secret-change-me' },
    { FILES_SIGNING_SECRET: production.JWT_ACCESS_SECRET },
    { FILES_BUCKET: '' },
    { FILES_REGION: '' },
    { FILES_CLAMAV_HOST: '' },
  ])('rejects unsafe production file settings %j', (input) => {
    expect(() => validateEnvironment({ ...production, ...input })).toThrow(
      'Environment validation',
    );
  });
  it.each([
    { FILES_MAX_FILE_BYTES: '0' },
    { FILES_MAX_FILE_BYTES: '1.5' },
    { FILES_MAX_FILE_BYTES: '26214401' },
    { FILES_WORKSPACE_QUOTA_BYTES: '100' },
    { FILES_CLAMAV_PORT: '65536' },
    { FILES_SCAN_TIMEOUT_MS: '999999' },
    { FILES_CLEANUP_LEASE_SECONDS: '0' },
    { FILES_CLEANUP_MAX_ATTEMPTS: '0' },
    { FILES_RETENTION_DAYS: '0' },
    { FILES_DOWNLOAD_GRANT_TTL_SECONDS: '301' },
    {
      FILES_UPLOAD_GRANT_TTL_SECONDS: '301',
      FILES_UPLOAD_INTENT_TTL_SECONDS: '300',
    },
    { FILES_ENDPOINT: 'https://user:password@storage.example.com' },
    { FILES_ENDPOINT: 'https://storage.example.com?token=secret' },
    { FILES_ACCESS_KEY: 'one-key' },
    { FILES_SECRET_KEY: 'one-secret' },
    { FILES_ACCESS_KEY: ' ', FILES_SECRET_KEY: ' ' },
    { FILES_SIGNING_SECRET: ' '.repeat(32) },
    { FILES_SIGNING_SECRET: 'development-only-access-secret-change-me' },
  ])(
    'rejects invalid size, grant, adapter and credential limits %j',
    (input) => {
      expect(() => validateEnvironment(input)).toThrow(
        'Environment validation',
      );
    },
  );
  it('supports explicit local S3 endpoints with paired credentials', () => {
    expect(
      validateEnvironment({
        FILES_STORAGE_DRIVER: 's3',
        FILES_ENDPOINT: 'http://localhost:9000',
        FILES_ACCESS_KEY: 'local-key',
        FILES_SECRET_KEY: 'local-secret',
      }).FILES_ENDPOINT,
    ).toBe('http://localhost:9000');
  });
});

describe('Resend configuration', () => {
  const resend = {
    MAIL_PROVIDER: 'resend',
    RESEND_API_KEY: 're_test_credential',
    RESEND_FROM: 'Tream <onboarding@resend.dev>',
  };

  it('keeps SMTP as the default and accepts blank unused Resend settings', () => {
    expect(
      validateEnvironment({ RESEND_API_KEY: ' ', RESEND_FROM: '' })
        .MAIL_PROVIDER,
    ).toBe('smtp');
  });

  it('accepts a display name sender and trims Resend credentials', () => {
    expect(
      validateEnvironment({ ...resend, RESEND_API_KEY: ' re_test_credential ' })
        .RESEND_API_KEY,
    ).toBe('re_test_credential');
    expect(
      validateEnvironment({ ...resend, RESEND_FROM: 'sender@example.com' })
        .RESEND_FROM,
    ).toBe('sender@example.com');
  });

  it.each([
    { MAIL_PROVIDER: 'unknown' },
    { RESEND_API_KEY: undefined },
    { RESEND_API_KEY: ' ' },
    { RESEND_API_KEY: 're_' },
    { RESEND_API_KEY: 'invalid-secret' },
    { RESEND_API_KEY: 're_invalid key' },
    { RESEND_FROM: undefined },
    { RESEND_FROM: ' ' },
    { RESEND_FROM: 'Tream <invalid>' },
    { RESEND_FROM: 'Tream\r\nInjected <sender@example.com>' },
  ])('rejects missing and malformed Resend settings %j', (input) => {
    expect(() => validateEnvironment({ ...resend, ...input })).toThrow(
      'Environment validation',
    );
  });

  it('does not expose rejected API keys in errors', () => {
    expect(() =>
      validateEnvironment({
        ...resend,
        RESEND_API_KEY: 'private-secret-value',
      }),
    ).not.toThrow('private-secret-value');
  });
});
