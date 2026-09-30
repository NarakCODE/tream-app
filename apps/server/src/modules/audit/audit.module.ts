import { Module } from '@nestjs/common';
import { AuditWriter } from './application/audit-writer.service';
@Module({ providers: [AuditWriter], exports: [AuditWriter] })
export class AuditModule {}
