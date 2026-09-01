import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { ContactsModule } from '../contacts/contacts.module';
import { IamModule } from '../iam/iam.module';
import { DealsQueryService } from './application/deals-query.service';
import { DealsService } from './application/deals.service';
import { DEALS_REPOSITORY } from './application/ports/deals-repository.port';
import { DealAccessGuard } from './infrastructure/deal-access.guard';
import { DrizzleDealsRepository } from './infrastructure/drizzle-deals.repository';
import { DealsController } from './presentation/deals.controller';
import { WorkspaceDealsController } from './presentation/workspace-deals.controller';

@Module({
  imports: [DatabaseModule, IamModule, ContactsModule],
  controllers: [WorkspaceDealsController, DealsController],
  providers: [
    DealsService,
    DealsQueryService,
    DealAccessGuard,
    DrizzleDealsRepository,
    { provide: DEALS_REPOSITORY, useExisting: DrizzleDealsRepository },
  ],
  exports: [DealsQueryService],
})
export class DealsModule {}
