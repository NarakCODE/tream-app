import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { RequestContextModule } from '../common/context/request-context.module';
import { GlobalExceptionFilter } from '../common/filters/global-exception.filter';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';
import { IdempotencyInterceptor } from '../common/interceptors/idempotency.interceptor';
import { ResponseTransformInterceptor } from '../common/interceptors/response-transform.interceptor';
import { AppValidationPipe } from '../common/pipes/validation.pipe';
import { appConfig } from '../config/app.config';
import { validateEnvironment } from '../config/env.validation';
import { DatabaseModule } from '../database/database.module';
import { LoggerModule } from '../shared/logger/logger.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [appConfig],
      validate: validateEnvironment,
    }),
    RequestContextModule,
    LoggerModule,
    DatabaseModule,
    IdempotencyModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: AppValidationPipe },
    // Reuse the interceptor owned by IdempotencyModule. Ordering preserves the
    // transformed response envelope in stored idempotency responses.
    { provide: APP_INTERCEPTOR, useExisting: IdempotencyInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseTransformInterceptor },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class CoreModule {}
