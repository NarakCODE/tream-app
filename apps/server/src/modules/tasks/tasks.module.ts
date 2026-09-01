import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { IamModule } from '../iam/iam.module';
import { TASKS_REPOSITORY } from './application/ports/tasks-repository.port';
import { TasksService } from './application/tasks.service';
import { DrizzleTasksRepository } from './infrastructure/drizzle-tasks.repository';
import { TaskAccessGuard } from './infrastructure/task-access.guard';
import { TasksController } from './presentation/tasks.controller';
import { WorkspaceTasksController } from './presentation/workspace-tasks.controller';

@Module({
  imports: [DatabaseModule, IamModule],
  controllers: [WorkspaceTasksController, TasksController],
  providers: [
    TasksService,
    TaskAccessGuard,
    DrizzleTasksRepository,
    { provide: TASKS_REPOSITORY, useExisting: DrizzleTasksRepository },
  ],
})
export class TasksModule {}
