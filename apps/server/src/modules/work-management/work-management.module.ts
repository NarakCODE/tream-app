import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { IamModule } from '../iam/iam.module';
import { CyclesService } from './application/cycles.service';
import { IssuesService } from './application/issues.service';
import { CYCLES_REPOSITORY } from './application/ports/cycles-repository.port';
import { ISSUES_REPOSITORY } from './application/ports/issues-repository.port';
import { PROJECTS_REPOSITORY } from './application/ports/projects-repository.port';
import { TEAMS_REPOSITORY } from './application/ports/teams-repository.port';
import { ProjectsService } from './application/projects.service';
import { TeamsService } from './application/teams.service';
import { CycleAccessGuard } from './infrastructure/cycle-access.guard';
import { DrizzleCyclesRepository } from './infrastructure/drizzle-cycles.repository';
import { DrizzleIssuesRepository } from './infrastructure/drizzle-issues.repository';
import { DrizzleProjectsRepository } from './infrastructure/drizzle-projects.repository';
import { DrizzleTeamsRepository } from './infrastructure/drizzle-teams.repository';
import { IssueAccessGuard } from './infrastructure/issue-access.guard';
import { ProjectAccessGuard } from './infrastructure/project-access.guard';
import { TeamAccessGuard } from './infrastructure/team-access.guard';
import { CyclesController } from './presentation/cycles.controller';
import { IssuesController } from './presentation/issues.controller';
import { ProjectTeamsController } from './presentation/project-teams.controller';
import { ProjectsController } from './presentation/projects.controller';
import { TeamCyclesController } from './presentation/team-cycles.controller';
import { TeamIssueStatusesController } from './presentation/team-issue-statuses.controller';
import { TeamMembersController } from './presentation/team-members.controller';
import { TeamIssuesController } from './presentation/team-issues.controller';
import { TeamsController } from './presentation/teams.controller';
import { WorkspaceIssuesController } from './presentation/workspace-issues.controller';
import { WorkspaceProjectsController } from './presentation/workspace-projects.controller';
import { WorkspaceTeamsController } from './presentation/workspace-teams.controller';

@Module({
  imports: [DatabaseModule, IamModule],
  controllers: [
    WorkspaceTeamsController,
    TeamsController,
    TeamMembersController,
    TeamIssueStatusesController,
    WorkspaceProjectsController,
    ProjectsController,
    ProjectTeamsController,
    WorkspaceIssuesController,
    TeamIssuesController,
    IssuesController,
    TeamCyclesController,
    CyclesController,
  ],
  providers: [
    TeamsService,
    ProjectsService,
    IssuesService,
    CyclesService,
    TeamAccessGuard,
    ProjectAccessGuard,
    IssueAccessGuard,
    CycleAccessGuard,
    DrizzleTeamsRepository,
    {
      provide: TEAMS_REPOSITORY,
      useExisting: DrizzleTeamsRepository,
    },
    DrizzleProjectsRepository,
    {
      provide: PROJECTS_REPOSITORY,
      useExisting: DrizzleProjectsRepository,
    },
    DrizzleIssuesRepository,
    {
      provide: ISSUES_REPOSITORY,
      useExisting: DrizzleIssuesRepository,
    },
    DrizzleCyclesRepository,
    {
      provide: CYCLES_REPOSITORY,
      useExisting: DrizzleCyclesRepository,
    },
  ],
  exports: [
    TeamsService,
    ProjectsService,
    IssuesService,
    CyclesService,
    TEAMS_REPOSITORY,
    PROJECTS_REPOSITORY,
    ISSUES_REPOSITORY,
    CYCLES_REPOSITORY,
  ],
})
export class WorkManagementModule {}
