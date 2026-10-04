import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../iam/workspaces.module';
import { ProjectsModule } from '../projects/projects.module';
import { IdempotencyModule } from '../../common/idempotency/idempotency.module';
import { EventingModule } from '../eventing/eventing.module';
import { AuditModule } from '../audit/audit.module';
import { InitiativeAccessService } from './application/initiative-access.service';
import { InitiativeService } from './application/initiative.service';
import { InitiativesController } from './presentation/initiatives.controller';
@Module({
  imports: [
    WorkspacesModule,
    ProjectsModule,
    IdempotencyModule,
    EventingModule,
    AuditModule,
  ],
  controllers: [InitiativesController],
  providers: [InitiativeAccessService, InitiativeService],
  exports: [InitiativeAccessService],
})
export class InitiativesModule {}
