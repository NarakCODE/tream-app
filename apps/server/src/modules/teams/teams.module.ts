import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../iam/workspaces.module';
import { IdempotencyModule } from '../../common/idempotency/idempotency.module';
import { EventingModule } from '../eventing/eventing.module';
import { AuditModule } from '../audit/audit.module';
import { TeamRepository } from './infrastructure/team.repository';
import { TeamAccessService } from './application/team-access.service';
import { TeamCommandService } from './application/team-command.service';
import { TeamService } from './application/team.service';
import { TeamStatusService } from './application/team-status.service';
import { TeamIssueNumberAllocator } from './application/team-issue-number-allocator';
import { TeamsController } from './presentation/teams.controller';
@Module({
  imports: [WorkspacesModule, IdempotencyModule, EventingModule, AuditModule],
  controllers: [TeamsController],
  providers: [
    TeamRepository,
    TeamAccessService,
    TeamCommandService,
    TeamService,
    TeamStatusService,
    TeamIssueNumberAllocator,
  ],
  exports: [TeamAccessService, TeamIssueNumberAllocator],
})
export class TeamsModule {}
