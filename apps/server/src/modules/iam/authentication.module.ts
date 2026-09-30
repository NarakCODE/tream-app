import { AuthMailOutbox } from './authentication/infrastructure/auth-mail-outbox';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthenticationService } from './authentication/application/authentication.service';
import { AUTH_REPOSITORY } from './authentication/application/authentication.types';
import { AUTH_MAIL_SENDER } from './authentication/application/auth-mail';
import { PostgresAuthRepository } from './authentication/infrastructure/postgres-auth.repository';
import { SmtpMailSender } from './authentication/infrastructure/smtp-auth.mail';
import {
  AuthenticationController,
  ProfileController,
} from './authentication/presentation/authentication.controller';
import { AuthenticationGuard } from './authentication/presentation/authentication.guard';
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthenticationController, ProfileController],
  providers: [
    AuthenticationService,
    AuthMailOutbox,
    { provide: AUTH_REPOSITORY, useClass: PostgresAuthRepository },
    { provide: AUTH_MAIL_SENDER, useClass: SmtpMailSender },
    { provide: APP_GUARD, useClass: AuthenticationGuard },
  ],
  exports: [AuthenticationService, AUTH_MAIL_SENDER, AuthMailOutbox],
})
export class AuthenticationModule {}
