import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { IamModule } from '../iam/iam.module';
import { DynamicDataService } from './application/dynamic-data.service';
import { DynamicRecordsApplicationService } from './application/dynamic-records-application.service';
import { DYNAMIC_DATA_REPOSITORY } from './application/ports/dynamic-data-repository.port';
import { DrizzleDynamicDataRepository } from './infrastructure/drizzle-dynamic-data.repository';
import { DatabaseFieldsController } from './presentation/database-fields.controller';
import { DatabasesController } from './presentation/databases.controller';
import { RecordsController } from './presentation/records.controller';
import { WorkspaceDatabasesController } from './presentation/workspace-databases.controller';

@Module({
  imports: [DatabaseModule, IamModule],
  controllers: [
    WorkspaceDatabasesController,
    DatabasesController,
    DatabaseFieldsController,
    RecordsController,
  ],
  providers: [
    DynamicDataService,
    DynamicRecordsApplicationService,
    DrizzleDynamicDataRepository,
    {
      provide: DYNAMIC_DATA_REPOSITORY,
      useExisting: DrizzleDynamicDataRepository,
    },
  ],
  exports: [DynamicRecordsApplicationService],
})
export class DynamicDataModule {}
