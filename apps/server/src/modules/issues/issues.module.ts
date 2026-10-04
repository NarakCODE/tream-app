import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../iam/workspaces.module';
import { TeamsModule } from '../teams/teams.module';
import { ProjectsModule } from '../projects/projects.module';
import { IdempotencyModule } from '../../common/idempotency/idempotency.module';
import { EventingModule } from '../eventing/eventing.module';
import { AuditModule } from '../audit/audit.module';
import { IssueRepository } from './infrastructure/issue.repository';
import { IssueAccessService } from './application/issue-access.service';
import { IssueMutationService } from './application/issue-mutation.service';
import { IssueService } from './application/issue.service';
import {
  IssuesController,
  TeamIssuesController,
} from './presentation/issues.controller';
@Module({
  imports: [
    WorkspacesModule,
    TeamsModule,
    ProjectsModule,
    IdempotencyModule,
    EventingModule,
    AuditModule,
  ],
  controllers: [IssuesController, TeamIssuesController],
  providers: [
    IssueRepository,
    IssueAccessService,
    IssueMutationService,
    IssueService,
  ],
  exports: [
    IssueRepository,
    IssueAccessService,
    IssueMutationService,
    IssueService,
  ],
})
export class IssuesModule {}
