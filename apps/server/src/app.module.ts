import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { RequestContextModule } from './common/context/request-context.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { IdempotencyModule } from './common/idempotency/idempotency.module';
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor';
import { AppValidationPipe } from './common/pipes/validation.pipe';
import { appConfig } from './config/app.config';
import { validateEnvironment } from './config/env.validation';
import { CompaniesModule } from './modules/companies/companies.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { DealsModule } from './modules/deals/deals.module';
import { DynamicDataModule } from './modules/dynamic-data/dynamic-data.module';
import { EventingModule } from './modules/eventing/eventing.module';
import { HealthModule } from './modules/health/health.module';
import { IamModule } from './modules/iam/iam.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { UsersModule } from './modules/users/users.module';
import { WorkManagementModule } from './modules/work-management/work-management.module';
import { LoggerModule } from './shared/logger/logger.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [appConfig],
      validate: validateEnvironment,
    }),
    RequestContextModule,
    LoggerModule,
    HealthModule,
    IamModule,
    IdempotencyModule,
    ContactsModule,
    DealsModule,
    CompaniesModule,
    TasksModule,
    WorkManagementModule,
    DynamicDataModule,
    EventingModule,
    UsersModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: AppValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseTransformInterceptor },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule {}
