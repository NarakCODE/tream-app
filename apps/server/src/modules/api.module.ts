import { Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module';
import { AuditHistoryModule } from './audit-history/audit-history.module';
import { CollaborationModule } from './collaboration/collaboration.module';
import { CompaniesModule } from './companies/companies.module';
import { ContactsModule } from './contacts/contacts.module';
import { CyclesModule } from './cycles/cycles.module';
import { DealsModule } from './deals/deals.module';
import { DocumentsModule } from './documents/documents.module';
import { DynamicDataModule } from './dynamic-data/dynamic-data.module';
import { EventingModule } from './eventing/eventing.module';
import { FilesModule } from './files/files.module';
import { IamModule } from './iam/iam.module';
import { InitiativesModule } from './initiatives/initiatives.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { IssuesModule } from './issues/issues.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ProjectsModule } from './projects/projects.module';
import { RetentionModule } from './retention/retention.module';
import { ReviewsModule } from './reviews/reviews.module';
import { TasksModule } from './tasks/tasks.module';
import { TeamsModule } from './teams/teams.module';
import { ViewsModule } from './views/views.module';

@Module({
  imports: [
    IamModule,
    TeamsModule,
    ProjectsModule,
    IssuesModule,
    CyclesModule,
    CollaborationModule,
    InitiativesModule,
    DocumentsModule,
    FilesModule,
    ViewsModule,
    NotificationsModule,
    ReviewsModule,
    AuditModule,
    AuditHistoryModule,
    RetentionModule,
    EventingModule,
    IntegrationsModule,
    ContactsModule,
    CompaniesModule,
    DealsModule,
    TasksModule,
    DynamicDataModule,
  ],
})
export class ApiModule {}
