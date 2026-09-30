import { CommandBus } from './command-bus.service';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { IdempotencyInterceptor } from '../interceptors/idempotency.interceptor';
import { IdempotencyRepository } from './idempotency.repository';
import { IdempotencyService } from './idempotency.service';

@Module({
  imports: [DatabaseModule],
  providers: [
    CommandBus,
    IdempotencyRepository,
    IdempotencyService,
    IdempotencyInterceptor,
  ],
  exports: [CommandBus, IdempotencyService, IdempotencyInterceptor],
})
export class IdempotencyModule {}
