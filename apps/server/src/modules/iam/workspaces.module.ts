import { WorkspacePermissionGuard } from './workspaces/presentation/workspace-permission.guard';
import { Module } from '@nestjs/common';
import { AuthenticationModule } from './authentication.module';
import { IdempotencyModule } from '../../common/idempotency/idempotency.module';
import { EventingModule } from '../eventing/eventing.module';
import { AuditModule } from '../audit/audit.module';
import { WorkspaceRepository } from './workspaces/application/ports/workspace.repository';
import { DrizzleWorkspaceRepository } from './workspaces/infrastructure/drizzle-workspace.repository';
import { WorkspaceAuthorizationService } from './workspaces/application/workspace-authorization.service';
import { WorkspaceService } from './workspaces/application/workspace.service';
import { InvitationDeliveryService } from './workspaces/application/invitation-delivery.service';
import { WorkspacesController } from './workspaces/presentation/workspaces.controller';
@Module({
  imports: [
    AuthenticationModule,
    IdempotencyModule,
    EventingModule,
    AuditModule,
  ],
  controllers: [WorkspacesController],
  providers: [
    { provide: WorkspaceRepository, useClass: DrizzleWorkspaceRepository },
    WorkspaceAuthorizationService,
    WorkspaceService,
    InvitationDeliveryService,
    WorkspacePermissionGuard,
  ],
  exports: [
    WorkspaceAuthorizationService,
    WorkspaceRepository,
    WorkspaceService,
    WorkspacePermissionGuard,
  ],
})
export class WorkspacesModule {}
