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
    },
    database: {
      url:
        process.env.DATABASE_URL ??
        'postgresql://postgres:postgres@localhost:5432/tream',
    },
    auth: {
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
