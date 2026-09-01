import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { ContactsModule } from '../contacts/contacts.module';
import { DealsModule } from '../deals/deals.module';
import { IamModule } from '../iam/iam.module';
import { CompaniesService } from './application/companies.service';
import { COMPANIES_REPOSITORY } from './application/ports/companies-repository.port';
import { CompanyAccessGuard } from './infrastructure/company-access.guard';
import { DrizzleCompaniesRepository } from './infrastructure/drizzle-companies.repository';
import { CompaniesController } from './presentation/companies.controller';
import { WorkspaceCompaniesController } from './presentation/workspace-companies.controller';

@Module({
  imports: [DatabaseModule, IamModule, ContactsModule, DealsModule],
  controllers: [WorkspaceCompaniesController, CompaniesController],
  providers: [
    CompaniesService,
    CompanyAccessGuard,
    DrizzleCompaniesRepository,
    { provide: COMPANIES_REPOSITORY, useExisting: DrizzleCompaniesRepository },
  ],
})
export class CompaniesModule {}
