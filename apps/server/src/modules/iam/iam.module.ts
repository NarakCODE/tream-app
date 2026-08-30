import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { DatabaseModule } from '../../database/database.module';
import { AuthService } from './application/auth.service';
import { PasswordHasher } from './application/password-hasher.service';
import { ProfileService } from './application/profile.service';
import { WorkspaceService } from './application/workspace.service';
import { TokenService } from './application/token.service';
import { AUTH_REPOSITORY } from './application/ports/auth-repository.port';
import { MAGIC_LINK_SENDER } from './application/ports/magic-link-sender.port';
import { WORKSPACE_REPOSITORY } from './application/ports/workspace-repository.port';
import { DrizzleAuthRepository } from './infrastructure/drizzle-auth.repository';
import { DrizzleWorkspaceRepository } from './infrastructure/drizzle-workspace.repository';
import { JwtAuthGuard } from './infrastructure/jwt-auth.guard';
import { JwtStrategy } from './infrastructure/jwt.strategy';
import { SmtpMagicLinkSender } from './infrastructure/smtp-magic-link.sender';
import { WorkspaceMembershipGuard } from './infrastructure/workspace-membership.guard';
import { AuthController } from './presentation/auth.controller';
import { MeController } from './presentation/me.controller';
import { WorkspaceMembersController } from './presentation/workspace-members.controller';
import { WorkspacesController } from './presentation/workspaces.controller';

@Module({
  imports: [
    DatabaseModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
  ],
  controllers: [
    AuthController,
    MeController,
    WorkspacesController,
    WorkspaceMembersController,
  ],
  providers: [
    AuthService,
    ProfileService,
    WorkspaceService,
    PasswordHasher,
    TokenService,
    DrizzleAuthRepository,
    DrizzleWorkspaceRepository,
    SmtpMagicLinkSender,
    JwtStrategy,
    JwtAuthGuard,
    WorkspaceMembershipGuard,
    { provide: AUTH_REPOSITORY, useExisting: DrizzleAuthRepository },
    { provide: MAGIC_LINK_SENDER, useExisting: SmtpMagicLinkSender },
    { provide: WORKSPACE_REPOSITORY, useExisting: DrizzleWorkspaceRepository },
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
  ],
})
export class IamModule {}
