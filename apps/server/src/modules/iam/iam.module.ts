import { Module } from '@nestjs/common';
import { AuthenticationModule } from './authentication.module';
import { WorkspacesModule } from './workspaces.module';
@Module({ imports: [AuthenticationModule, WorkspacesModule] })
export class IamModule {}
