import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../iam/workspaces.module';
import { IdempotencyModule } from '../../common/idempotency/idempotency.module';
import { OnboardingController } from './onboarding.controller';
import { OnboardingRepository } from './onboarding.repository';
import { OnboardingService } from './onboarding.service';
@Module({
  imports: [WorkspacesModule, IdempotencyModule],
  controllers: [OnboardingController],
  providers: [OnboardingRepository, OnboardingService],
})
export class OnboardingModule {}
