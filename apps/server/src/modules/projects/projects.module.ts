import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../iam/workspaces.module';
import { TeamsModule } from '../teams/teams.module';
import { IdempotencyModule } from '../../common/idempotency/idempotency.module';
import { EventingModule } from '../eventing/eventing.module';
import { AuditModule } from '../audit/audit.module';
import { ProjectRepository } from './infrastructure/project.repository';
import { ProjectAccessService } from './application/project-access.service';
import { ProjectCommandService } from './application/project-command.service';
import { ProjectService } from './application/project.service';
import { ProjectStatusService } from './application/project-status.service';
import { ProjectCollaborationService } from './application/project-collaboration.service';
import { ProjectsController } from './presentation/projects.controller';
import { ProjectStatusesController } from './presentation/project-statuses.controller';
@Module({
  imports: [
    WorkspacesModule,
    TeamsModule,
    IdempotencyModule,
    EventingModule,
    AuditModule,
  ],
  controllers: [ProjectsController, ProjectStatusesController],
  providers: [
    ProjectRepository,
    ProjectAccessService,
    ProjectCommandService,
    ProjectService,
    ProjectStatusService,
    ProjectCollaborationService,
  ],
  exports: [ProjectAccessService],
})
export class ProjectsModule {}
