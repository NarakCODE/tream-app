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
