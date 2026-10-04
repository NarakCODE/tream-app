import { WorkspaceTrashService } from './application/workspace-trash.service';
import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../iam/workspaces.module';
import { FilesModule } from '../files/files.module';
import { RetentionPolicyService } from './application/retention-policy.service';
import { TrashQueryService } from './application/trash-query.service';
import { RetentionWorker } from './application/retention-worker.service';
import {
  RetentionController,
  WorkspaceTrashController,
} from './presentation/retention.controller';
@Module({
  imports: [WorkspacesModule, FilesModule],
  controllers: [RetentionController, WorkspaceTrashController],
  providers: [
    RetentionPolicyService,
    TrashQueryService,
    WorkspaceTrashService,
    RetentionWorker,
  ],
  exports: [RetentionPolicyService, RetentionWorker],
})
export class RetentionModule {}
