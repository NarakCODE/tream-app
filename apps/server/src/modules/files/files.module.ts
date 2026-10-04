import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../iam/workspaces.module';
import { IssuesModule } from '../issues/issues.module';
import { ProjectsModule } from '../projects/projects.module';
import { CollaborationModule } from '../collaboration/collaboration.module';
import { DocumentsModule } from '../documents/documents.module';
import { EventingModule } from '../eventing/eventing.module';
import { AuditModule } from '../audit/audit.module';
import { IdempotencyModule } from '../../common/idempotency/idempotency.module';
import { FileProvidersModule } from './infrastructure/file-providers.module';
import { FileRepository } from './infrastructure/file.repository';
import { FileAccessService } from './application/file-access.service';
import { FileFactsService } from './application/file-facts.service';
import { FileService } from './application/file.service';
import { FileCleanupWorker } from './application/file-cleanup.worker';
import { FilesController } from './presentation/files.controller';
@Module({
  imports: [
    WorkspacesModule,
    IssuesModule,
    ProjectsModule,
    CollaborationModule,
    DocumentsModule,
    EventingModule,
    AuditModule,
    IdempotencyModule,
    FileProvidersModule,
  ],
  controllers: [FilesController],
  providers: [
    FileRepository,
    FileAccessService,
    FileFactsService,
    FileService,
    FileCleanupWorker,
  ],
  exports: [FileCleanupWorker],
})
export class FilesModule {}
