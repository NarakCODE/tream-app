import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../iam/workspaces.module';
import { AuthenticationModule } from '../iam/authentication.module';
import { IssuesModule } from '../issues/issues.module';
import { ProjectsModule } from '../projects/projects.module';
import { InitiativesModule } from '../initiatives/initiatives.module';
import { DocumentsModule } from '../documents/documents.module';
import { EventingModule } from '../eventing/eventing.module';
import { AuditModule } from '../audit/audit.module';
import { IdempotencyModule } from '../../common/idempotency/idempotency.module';
import { NotificationAccessService } from './application/notification-access.service';
import { NotificationConsumer } from './application/notification-consumer.service';
import { NotificationService } from './application/notification.service';
import { NotificationMailWorker } from './application/notification-mail.worker';
import { NotificationMailSender } from './application/notification-mail';
import { AuthMailNotificationAdapter } from './infrastructure/auth-mail-notification.adapter';
import { NotificationRepository } from './infrastructure/notification.repository';
import { NotificationsController } from './presentation/notifications.controller';
@Module({
  imports: [
    WorkspacesModule,
    AuthenticationModule,
    IssuesModule,
    ProjectsModule,
    InitiativesModule,
    DocumentsModule,
    EventingModule,
    AuditModule,
    IdempotencyModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationAccessService,
    NotificationConsumer,
    NotificationService,
    NotificationMailWorker,
    NotificationRepository,
    { provide: NotificationMailSender, useClass: AuthMailNotificationAdapter },
  ],
  exports: [
    NotificationConsumer,
    NotificationMailWorker,
    NotificationMailSender,
  ],
})
export class NotificationsModule {}
