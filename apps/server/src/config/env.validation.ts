import { plainToInstance, Type } from 'class-transformer';
import {
  IsBooleanString,
  IsIn,
  IsInt,
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
  CORS_ORIGIN = 'http://localhost:3000';

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
  MAGIC_LINK_BASE_URL = 'http://localhost:3000';

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
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_FROM',
] as const;

export const validateEnvironment = (
  config: Record<string, unknown>,
): EnvironmentVariables => {
  const environment = plainToInstance(EnvironmentVariables, config, {
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
    const missing = requiredProductionEnvironmentVariables.filter(
      (variable) =>
        typeof config[variable] !== 'string' || config[variable].trim() === '',
    );
    if (missing.length > 0) {
      throw new Error(
        `Environment validation failed: missing production variables: ${missing.join(', ')}`,
      );
    }
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

  const hasSmtpUser = environment.SMTP_USER !== undefined;
  const hasSmtpPassword = environment.SMTP_PASSWORD !== undefined;
  if (hasSmtpUser !== hasSmtpPassword) {
    throw new Error(
      'Environment validation failed: SMTP_USER and SMTP_PASSWORD must be set together.',
    );
  }

  return environment;
};
