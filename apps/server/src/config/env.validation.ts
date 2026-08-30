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

  const hasSmtpUser = environment.SMTP_USER !== undefined;
  const hasSmtpPassword = environment.SMTP_PASSWORD !== undefined;
  if (hasSmtpUser !== hasSmtpPassword) {
    throw new Error(
      'Environment validation failed: SMTP_USER and SMTP_PASSWORD must be set together.',
    );
  }

  return environment;
};
