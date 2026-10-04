import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../iam/workspaces.module';
import { TeamsModule } from '../teams/teams.module';
import { ProjectsModule } from '../projects/projects.module';
import { IssuesModule } from '../issues/issues.module';
import { InitiativesModule } from '../initiatives/initiatives.module';
import { IdempotencyModule } from '../../common/idempotency/idempotency.module';
import { EventingModule } from '../eventing/eventing.module';
import { AuditModule } from '../audit/audit.module';
import { ViewRepository } from './infrastructure/view.repository';
import { ResourceQueryRepository } from './infrastructure/resource-query.repository';
import { ViewService } from './application/view.service';
import { ViewsController } from './presentation/views.controller';

@Module({
  imports: [
    WorkspacesModule,
    TeamsModule,
    ProjectsModule,
    IssuesModule,
    InitiativesModule,
    IdempotencyModule,
    EventingModule,
    AuditModule,
  ],
  providers: [ViewRepository, ResourceQueryRepository, ViewService],
  controllers: [ViewsController],
  exports: [ViewService],
})
export class ViewsModule {}
