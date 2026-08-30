import { plainToInstance, Type } from 'class-transformer';
import {
  IsBooleanString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
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
}

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

  return environment;
};
