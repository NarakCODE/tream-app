import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { IamModule } from '../iam/iam.module';
import { ContactsService } from './application/contacts.service';
import { ContactsQueryService } from './application/contacts-query.service';
import { CONTACTS_REPOSITORY } from './application/ports/contacts-repository.port';
import { ContactAccessGuard } from './infrastructure/contact-access.guard';
import { DrizzleContactsRepository } from './infrastructure/drizzle-contacts.repository';
import { ContactsController } from './presentation/contacts.controller';
import { WorkspaceContactsController } from './presentation/workspace-contacts.controller';

@Module({
  imports: [DatabaseModule, IamModule],
  controllers: [WorkspaceContactsController, ContactsController],
  providers: [
    ContactsService,
    ContactsQueryService,
    ContactAccessGuard,
    DrizzleContactsRepository,
    { provide: CONTACTS_REPOSITORY, useExisting: DrizzleContactsRepository },
  ],
  exports: [ContactsQueryService],
})
export class ContactsModule {}
