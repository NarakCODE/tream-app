import { Module } from '@nestjs/common';
import { RequestContextModule } from '../../common/context/request-context.module';
import { AuditWriter } from './application/audit-writer.service';
@Module({
  imports: [RequestContextModule],
  providers: [AuditWriter],
  exports: [AuditWriter],
})
export class AuditModule {}
