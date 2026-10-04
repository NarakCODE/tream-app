import { resolve } from 'node:path';
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
  const resendApiKey = optionalNonEmpty(process.env.RESEND_API_KEY);
  const smtpUser = optionalNonEmpty(process.env.SMTP_USER);
  const smtpPassword = optionalNonEmpty(process.env.SMTP_PASSWORD);
  const endpoint = optionalNonEmpty(process.env.FILES_ENDPOINT);
  const accessKey = optionalNonEmpty(process.env.FILES_ACCESS_KEY);
  const secretKey = optionalNonEmpty(process.env.FILES_SECRET_KEY);

  return {
    app: {
      nodeEnv: (process.env.NODE_ENV ?? 'development') as NodeEnvironment,
      port: Number.parseInt(process.env.PORT ?? '3002', 10),
      corsOrigin:
        process.env.CORS_ORIGIN ??
        'http://localhost:3000,http://localhost:3001,http://localhost:3002,http://127.0.0.1:3000,http://127.0.0.1:3001,http://127.0.0.1:3002',
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
        baseUrl:
          process.env.MAGIC_LINK_BASE_URL ??
          'http://localhost:3000,http://localhost:3001,http://localhost:3002,http://127.0.0.1:3000,http://127.0.0.1:3001,http://127.0.0.1:3002',
      },
    },
    files: {
      storageDriver: (process.env.FILES_STORAGE_DRIVER ?? 'filesystem') as
        'filesystem' | 's3',
      localRoot:
        process.env.FILES_LOCAL_ROOT ?? resolve(process.cwd(), '.local/files'),
      bucket: process.env.FILES_BUCKET ?? 'tream-development',
      region: process.env.FILES_REGION ?? 'us-east-1',
      ...(endpoint ? { endpoint } : {}),
      ...(accessKey ? { accessKey } : {}),
      ...(secretKey ? { secretKey } : {}),
      scannerDriver: (process.env.FILES_SCANNER_DRIVER ?? 'development') as
        'development' | 'clamav',
      clamavHost: process.env.FILES_CLAMAV_HOST ?? 'localhost',
      clamavPort: Number(process.env.FILES_CLAMAV_PORT ?? 3310),
      scanTimeoutMs: Number(process.env.FILES_SCAN_TIMEOUT_MS ?? 5000),
      maxFileBytes: Number(
        process.env.FILES_MAX_FILE_BYTES ?? 25 * 1024 * 1024,
      ),
      workspaceQuotaBytes: Number(
        process.env.FILES_WORKSPACE_QUOTA_BYTES ?? 1024 * 1024 * 1024,
      ),
      uploadIntentTtlSeconds: Number(
        process.env.FILES_UPLOAD_INTENT_TTL_SECONDS ?? 86400,
      ),
      uploadGrantTtlSeconds: Number(
        process.env.FILES_UPLOAD_GRANT_TTL_SECONDS ?? 300,
      ),
      downloadGrantTtlSeconds: Number(
        process.env.FILES_DOWNLOAD_GRANT_TTL_SECONDS ?? 60,
      ),
      retentionDays: Number(process.env.FILES_RETENTION_DAYS ?? 30),
      cleanupLeaseSeconds: Number(
        process.env.FILES_CLEANUP_LEASE_SECONDS ?? 60,
      ),
      cleanupMaxAttempts: Number(process.env.FILES_CLEANUP_MAX_ATTEMPTS ?? 10),
      signingSecret:
        process.env.FILES_SIGNING_SECRET ??
        'development-only-file-grant-secret-change-me',
    },
    mail: {
      provider: (optionalNonEmpty(process.env.MAIL_PROVIDER) ?? 'smtp') as
        'smtp' | 'resend',
      resend: {
        ...(resendApiKey === undefined ? {} : { apiKey: resendApiKey }),
        from: optionalNonEmpty(process.env.RESEND_FROM) ?? '',
      },
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
