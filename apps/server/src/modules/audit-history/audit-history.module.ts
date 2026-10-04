import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../iam/workspaces.module';
import { AuditHistoryController } from './presentation/audit-history.controller';
import { AuditHistoryService } from './application/audit-history.service';
@Module({
  imports: [WorkspacesModule],
  controllers: [AuditHistoryController],
  providers: [AuditHistoryService],
  exports: [AuditHistoryService],
})
export class AuditHistoryModule {}
