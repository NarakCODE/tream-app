import { Module } from '@nestjs/common';
import { InitiativesModule } from '../initiatives/initiatives.module';
import { WorkspacesModule } from '../iam/workspaces.module';
import { TeamsModule } from '../teams/teams.module';
import { IssuesModule } from '../issues/issues.module';
import { ProjectsModule } from '../projects/projects.module';
import { EventingModule } from '../eventing/eventing.module';
import { AuditModule } from '../audit/audit.module';
import { IdempotencyModule } from '../../common/idempotency/idempotency.module';
import { CollaborationAccessService } from './application/collaboration-access.service';
import { CollaborationFactsService } from './application/collaboration-facts.service';
import { CommentService } from './application/comment.service';
import { LabelService } from './application/label.service';
import { SubscriberService } from './application/subscriber.service';
import { TemplateService } from './application/template.service';
import { CollaborationRepository } from './infrastructure/collaboration.repository';
import { CollaborationController } from './presentation/collaboration.controller';
import { IssueCollaborationController } from './presentation/issue-collaboration.controller';
import { ProjectCollaborationController } from './presentation/project-collaboration.controller';
@Module({
  imports: [
    WorkspacesModule,
    InitiativesModule,
    TeamsModule,
    IssuesModule,
    ProjectsModule,
    EventingModule,
    AuditModule,
    IdempotencyModule,
  ],
  controllers: [
    CollaborationController,
    IssueCollaborationController,
    ProjectCollaborationController,
  ],
  providers: [
    CollaborationAccessService,
    CollaborationFactsService,
    CommentService,
    LabelService,
    SubscriberService,
    TemplateService,
    CollaborationRepository,
  ],
  exports: [CollaborationAccessService],
})
export class CollaborationModule {}
