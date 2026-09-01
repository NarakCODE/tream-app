import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { IdempotencyInterceptor } from '../interceptors/idempotency.interceptor';
import { IdempotencyRepository } from './idempotency.repository';
import { IdempotencyService } from './idempotency.service';

@Module({
  imports: [DatabaseModule],
  providers: [
    IdempotencyRepository,
    IdempotencyService,
    IdempotencyInterceptor,
  ],
  exports: [IdempotencyService, IdempotencyInterceptor],
})
export class IdempotencyModule {}
