import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../iam/workspaces.module';
import { ProjectsModule } from '../projects/projects.module';
import { TeamsModule } from '../teams/teams.module';
import { InitiativesModule } from '../initiatives/initiatives.module';
import { IdempotencyModule } from '../../common/idempotency/idempotency.module';
import { EventingModule } from '../eventing/eventing.module';
import { AuditModule } from '../audit/audit.module';
import { DocumentAccessService } from './application/document-access.service';
import { DocumentService } from './application/document.service';
import { DocumentsController } from './presentation/documents.controller';
@Module({
  imports: [
    WorkspacesModule,
    ProjectsModule,
    TeamsModule,
    InitiativesModule,
    IdempotencyModule,
    EventingModule,
    AuditModule,
  ],
  controllers: [DocumentsController],
  providers: [DocumentAccessService, DocumentService],
  exports: [DocumentAccessService],
})
export class DocumentsModule {}
