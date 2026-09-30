import type {
  ApplicationConfiguration,
  NodeEnvironment,
} from './configuration.interface';

const parseBoolean = (value: string | undefined, fallback: boolean): boolean =>
  value === undefined ? fallback : value.toLowerCase() === 'true';

const optionalNonEmpty = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0
    ? undefined
    : normalized;
};

export const appConfig = (): ApplicationConfiguration => {
  const smtpUser = optionalNonEmpty(process.env.SMTP_USER);
  const smtpPassword = optionalNonEmpty(process.env.SMTP_PASSWORD);

  return {
    app: {
      nodeEnv: (process.env.NODE_ENV ?? 'development') as NodeEnvironment,
      port: Number.parseInt(process.env.PORT ?? '3002', 10),
      corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
      swaggerEnabled: parseBoolean(process.env.SWAGGER_ENABLED, true),
      trustProxyHops: Number.parseInt(process.env.TRUST_PROXY_HOPS ?? '0', 10),
      backgroundWorkersEnabled: parseBoolean(
        process.env.BACKGROUND_WORKERS_ENABLED,
        false,
      ),
    },
    database: {
      maxPool: Number.parseInt(process.env.DATABASE_POOL_MAX ?? '10', 10),
      connectionTimeoutMs: Number.parseInt(
        process.env.DATABASE_CONNECTION_TIMEOUT_MS ?? '2000',
        10,
      ),
      queryTimeoutMs: Number.parseInt(
        process.env.DATABASE_QUERY_TIMEOUT_MS ?? '10000',
        10,
      ),
      url:
        process.env.DATABASE_URL ??
        'postgresql://postgres:postgres@localhost:5432/tream',
    },
    auth: {
      mailEncryptionKey:
        process.env.AUTH_MAIL_ENCRYPTION_KEY ??
        'c1217da7d757690115606f7c386f73964992611de8f4139a87d79f04b0128c04',
      jwt: {
        issuer: process.env.JWT_ISSUER ?? 'tream-api',
        audience: process.env.JWT_AUDIENCE ?? 'tream-client',
        accessSecret:
          process.env.JWT_ACCESS_SECRET ??
          'development-only-access-secret-change-me',
        accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
        refreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',
      },
      magicLink: {
        ttl: process.env.MAGIC_LINK_TTL ?? '15m',
        baseUrl: process.env.MAGIC_LINK_BASE_URL ?? 'http://localhost:3000',
      },
    },
    mail: {
      smtp: {
        host: process.env.SMTP_HOST ?? 'localhost',
        port: Number.parseInt(process.env.SMTP_PORT ?? '1025', 10),
        secure: parseBoolean(process.env.SMTP_SECURE, false),
        ...(smtpUser === undefined ? {} : { user: smtpUser }),
        ...(smtpPassword === undefined ? {} : { password: smtpPassword }),
        from: process.env.SMTP_FROM ?? 'Tream <no-reply@localhost>',
      },
    },
  };
};
