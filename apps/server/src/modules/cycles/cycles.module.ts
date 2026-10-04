import { Module } from '@nestjs/common';
import { TeamsModule } from '../teams/teams.module';
import { IssuesModule } from '../issues/issues.module';
import { IdempotencyModule } from '../../common/idempotency/idempotency.module';
import { EventingModule } from '../eventing/eventing.module';
import { AuditModule } from '../audit/audit.module';
import { CycleRepository } from './infrastructure/cycle.repository';
import { CycleService } from './application/cycle.service';
import { CycleScheduler } from './application/cycle-scheduler.service';
import { CyclesController } from './presentation/cycles.controller';

@Module({
  imports: [
    TeamsModule,
    IssuesModule,
    IdempotencyModule,
    EventingModule,
    AuditModule,
  ],
  controllers: [CyclesController],
  providers: [CycleRepository, CycleService, CycleScheduler],
  exports: [CycleService],
})
export class CyclesModule {}
