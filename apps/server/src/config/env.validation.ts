import { plainToInstance, Type } from 'class-transformer';
import {
  IsBooleanString,
  IsIn,
  IsInt,
  isEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Matches,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsOptional()
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: 'development' | 'test' | 'production' = 'development';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3002;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5)
  TRUST_PROXY_HOPS = 0;

  @IsOptional()
  @IsBooleanString()
  BACKGROUND_WORKERS_ENABLED = 'false';

  @IsOptional()
  @Matches(/^[a-f0-9]{64}$/i)
  AUTH_MAIL_ENCRYPTION_KEY =
    'c1217da7d757690115606f7c386f73964992611de8f4139a87d79f04b0128c04';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  DATABASE_POOL_MAX = 10;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(30000)
  DATABASE_CONNECTION_TIMEOUT_MS = 2000;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(60000)
  DATABASE_QUERY_TIMEOUT_MS = 10000;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  CORS_ORIGIN =
    'http://localhost:3000,http://localhost:3001,http://localhost:3002,http://127.0.0.1:3000,http://127.0.0.1:3001,http://127.0.0.1:3002';

  @IsOptional()
  @IsBooleanString()
  SWAGGER_ENABLED = 'true';

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/tream';

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  JWT_ISSUER = 'tream-api';

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  JWT_AUDIENCE = 'tream-client';

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(32)
  JWT_ACCESS_SECRET = 'development-only-access-secret-change-me';

  @IsOptional()
  @Matches(/^\d+(?:ms|s|m|h|d)$/)
  JWT_ACCESS_TTL = '15m';

  @IsOptional()
  @Matches(/^\d+(?:ms|s|m|h|d)$/)
  JWT_REFRESH_TTL = '30d';

  @IsOptional()
  @Matches(/^\d+(?:ms|s|m|h|d)$/)
  MAGIC_LINK_TTL = '15m';

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  MAGIC_LINK_BASE_URL =
    'http://localhost:3000,http://localhost:3001,http://localhost:3002,http://127.0.0.1:3000,http://127.0.0.1:3001,http://127.0.0.1:3002';

  @IsOptional() @IsIn(['filesystem', 's3']) FILES_STORAGE_DRIVER = 'filesystem';
  @IsOptional() @IsString() @IsNotEmpty() FILES_LOCAL_ROOT?: string;
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/)
  FILES_BUCKET = 'tream-development';
  @IsOptional() @IsString() @IsNotEmpty() FILES_ENDPOINT?: string;
  @IsOptional() @IsString() @Matches(/^[a-z][a-z0-9-]{1,63}$/) FILES_REGION =
    'us-east-1';
  @IsOptional() @IsString() @IsNotEmpty() FILES_ACCESS_KEY?: string;
  @IsOptional() @IsString() @IsNotEmpty() FILES_SECRET_KEY?: string;
  @IsOptional() @IsIn(['development', 'clamav']) FILES_SCANNER_DRIVER =
    'development';
  @IsOptional() @IsString() @IsNotEmpty() FILES_CLAMAV_HOST = 'localhost';
  @IsOptional() @IsString() @MinLength(32) FILES_SIGNING_SECRET =
    'development-only-file-grant-secret-change-me';
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  FILES_CLAMAV_PORT = 3310;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(60000)
  FILES_SCAN_TIMEOUT_MS = 5000;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(26214400)
  FILES_MAX_FILE_BYTES = 26214400;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10995116277760)
  FILES_WORKSPACE_QUOTA_BYTES = 1073741824;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(300)
  @Max(604800)
  FILES_UPLOAD_INTENT_TTL_SECONDS = 86400;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(900)
  FILES_UPLOAD_GRANT_TTL_SECONDS = 300;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(300)
  FILES_DOWNLOAD_GRANT_TTL_SECONDS = 60;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  FILES_RETENTION_DAYS = 30;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(3600)
  FILES_CLEANUP_LEASE_SECONDS = 60;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  FILES_CLEANUP_MAX_ATTEMPTS = 10;

  @IsOptional()
  @IsIn(['smtp', 'resend'])
  MAIL_PROVIDER: 'smtp' | 'resend' = 'smtp';

  @IsOptional()
  @IsString()
  RESEND_API_KEY?: string;

  @IsOptional()
  @IsString()
  RESEND_FROM?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  SMTP_HOST = 'localhost';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  SMTP_PORT = 1025;

  @IsOptional()
  @IsBooleanString()
  SMTP_SECURE = 'false';

  @IsOptional()
  @IsString()
  SMTP_USER?: string;

  @IsOptional()
  @IsString()
  SMTP_PASSWORD?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  SMTP_FROM = 'Tream <no-reply@localhost>';
}

const requiredProductionEnvironmentVariables = [
  'AUTH_MAIL_ENCRYPTION_KEY',
  'DATABASE_URL',
  'JWT_ISSUER',
  'JWT_AUDIENCE',
  'JWT_ACCESS_SECRET',
  'JWT_ACCESS_TTL',
  'JWT_REFRESH_TTL',
  'MAGIC_LINK_TTL',
  'MAGIC_LINK_BASE_URL',
  'FILES_STORAGE_DRIVER',
  'FILES_BUCKET',
  'FILES_REGION',
  'FILES_SCANNER_DRIVER',
  'FILES_CLAMAV_HOST',
  'FILES_CLAMAV_PORT',
  'FILES_SIGNING_SECRET',
] as const;

export const validateEnvironment = (
  config: Record<string, unknown>,
): EnvironmentVariables => {
  const normalizedConfig = { ...config };
  for (const variable of ['MAIL_PROVIDER', 'RESEND_API_KEY', 'RESEND_FROM']) {
    if (typeof normalizedConfig[variable] === 'string') {
      const value = normalizedConfig[variable].trim();
      if (value === '') delete normalizedConfig[variable];
      else normalizedConfig[variable] = value;
    }
  }
  const environment = plainToInstance(EnvironmentVariables, normalizedConfig, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(environment, { skipMissingProperties: false });

  if (errors.length > 0) {
    const messages = errors
      .flatMap((error) => Object.values(error.constraints ?? {}))
      .join(', ');
    throw new Error(`Environment validation failed: ${messages}`);
  }

  if (environment.NODE_ENV === 'production') {
    const mailVariables =
      environment.MAIL_PROVIDER === 'resend'
        ? ['RESEND_API_KEY', 'RESEND_FROM']
        : ['SMTP_HOST', 'SMTP_PORT', 'SMTP_FROM'];
    const missing = [
      ...requiredProductionEnvironmentVariables,
      ...mailVariables,
    ].filter(
      (variable) =>
        typeof config[variable] !== 'string' || config[variable].trim() === '',
    );
    if (missing.length > 0) {
      throw new Error(
        `Environment validation failed: missing production variables: ${missing.join(', ')}`,
      );
    }
  }

  for (const value of [
    environment.FILES_LOCAL_ROOT,
    environment.FILES_ACCESS_KEY,
    environment.FILES_SECRET_KEY,
    environment.FILES_CLAMAV_HOST,
  ]) {
    if (value !== undefined && value.trim() === '')
      throw new Error(
        'Environment validation failed: file paths, credentials and scanner host cannot be blank.',
      );
  }
  if (environment.FILES_SIGNING_SECRET.trim().length < 32)
    throw new Error(
      'Environment validation failed: file signing secret requires at least 32 non-padding characters.',
    );
  if (
    environment.FILES_MAX_FILE_BYTES > environment.FILES_WORKSPACE_QUOTA_BYTES
  ) {
    throw new Error(
      'Environment validation failed: file size limit cannot exceed workspace quota.',
    );
  }
  if (
    environment.FILES_UPLOAD_GRANT_TTL_SECONDS >
    environment.FILES_UPLOAD_INTENT_TTL_SECONDS
  ) {
    throw new Error(
      'Environment validation failed: upload grant cannot outlive upload intent.',
    );
  }
  if (
    Boolean(environment.FILES_ACCESS_KEY) !==
    Boolean(environment.FILES_SECRET_KEY)
  ) {
    throw new Error(
      'Environment validation failed: FILES_ACCESS_KEY and FILES_SECRET_KEY must be set together.',
    );
  }
  if (environment.FILES_SIGNING_SECRET === environment.JWT_ACCESS_SECRET) {
    throw new Error(
      'Environment validation failed: file signing secret must be distinct from JWT access secret.',
    );
  }
  if (environment.FILES_ENDPOINT) {
    try {
      const endpoint = new URL(environment.FILES_ENDPOINT);
      if (
        !['http:', 'https:'].includes(endpoint.protocol) ||
        endpoint.username ||
        endpoint.password ||
        endpoint.search ||
        endpoint.hash ||
        (environment.NODE_ENV === 'production' &&
          endpoint.protocol !== 'https:')
      )
        throw new Error();
    } catch {
      throw new Error(
        'Environment validation failed: FILES_ENDPOINT must be an HTTP URL without credentials, query or fragment; production requires HTTPS.',
      );
    }
  }
  if (environment.NODE_ENV === 'production') {
    if (
      environment.FILES_STORAGE_DRIVER !== 's3' ||
      environment.FILES_SCANNER_DRIVER !== 'clamav'
    )
      throw new Error(
        'Environment validation failed: production files require S3 storage and ClamAV scanning.',
      );
    if (
      /^(development|change-me|example)/i.test(environment.FILES_SIGNING_SECRET)
    )
      throw new Error(
        'Environment validation failed: production file signing secret must not be a development placeholder.',
      );
  }

  let databaseUrl: URL;
  try {
    databaseUrl = new URL(environment.DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol))
      throw new Error();
  } catch {
    throw new Error(
      'Environment validation failed: DATABASE_URL must be a PostgreSQL URL.',
    );
  }
  const origins = environment.CORS_ORIGIN.split(',').map((origin) =>
    origin.trim(),
  );
  if (
    origins.length === 0 ||
    origins.some((origin) => {
      try {
        const url = new URL(origin);
        return (
          url.origin !== origin || !['http:', 'https:'].includes(url.protocol)
        );
      } catch {
        return true;
      }
    })
  ) {
    throw new Error(
      'Environment validation failed: CORS_ORIGIN must list explicit HTTP origins.',
    );
  }
  if (environment.NODE_ENV === 'production') {
    if (
      environment.AUTH_MAIL_ENCRYPTION_KEY ===
      'c1217da7d757690115606f7c386f73964992611de8f4139a87d79f04b0128c04'
    ) {
      throw new Error(
        'Environment validation failed: production mail key must not be the development key.',
      );
    }
    if (
      environment.JWT_ACCESS_SECRET ===
        'development-only-access-secret-change-me' ||
      /^(development|change-me|example)/i.test(environment.JWT_ACCESS_SECRET)
    ) {
      throw new Error(
        'Environment validation failed: production access secret must not be a development placeholder.',
      );
    }
    if (
      decodeURIComponent(databaseUrl.password) === 'postgres' ||
      databaseUrl.password === ''
    ) {
      throw new Error(
        'Environment validation failed: production database password must not be empty or the default.',
      );
    }
    if (
      origins.some((origin) => !origin.startsWith('https://')) ||
      !environment.MAGIC_LINK_BASE_URL.startsWith('https://')
    ) {
      throw new Error(
        'Environment validation failed: production browser origins and magic-link URL require HTTPS.',
      );
    }
  }

  if (environment.MAIL_PROVIDER === 'resend') {
    if (
      !environment.RESEND_API_KEY ||
      !/^re_\S+$/.test(environment.RESEND_API_KEY)
    ) {
      throw new Error(
        'Environment validation failed: RESEND_API_KEY must be a nonempty Resend API key starting with re_.',
      );
    }
    const sender = environment.RESEND_FROM ?? '';
    const mailboxMatch = sender.match(/^[^<>\r\n]+<([^<>]+)>$/);
    const mailbox = (mailboxMatch?.[1] ?? sender).trim();
    if (/[\r\n<>]/.test(mailbox) || !isEmail(mailbox)) {
      throw new Error(
        'Environment validation failed: RESEND_FROM must contain a valid sender email address.',
      );
    }
    if (
      environment.NODE_ENV === 'production' &&
      /@(?:[^@]+\.)?resend\.dev$/i.test(mailbox)
    ) {
      throw new Error(
        'Environment validation failed: production RESEND_FROM requires your verified sender domain.',
      );
    }
  }

  const hasSmtpUser = environment.SMTP_USER !== undefined;
  const hasSmtpPassword = environment.SMTP_PASSWORD !== undefined;
  if (environment.MAIL_PROVIDER === 'smtp' && hasSmtpUser !== hasSmtpPassword) {
    throw new Error(
      'Environment validation failed: SMTP_USER and SMTP_PASSWORD must be set together.',
    );
  }

  return environment;
};
