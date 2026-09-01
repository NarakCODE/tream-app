import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiStandardResponse } from '../../../common/decorators/api-standard-response.decorator';
import type { AuthenticatedUser } from '../../iam/domain/auth-user';
import { CurrentUser } from '../../iam/presentation/decorators/current-user.decorator';
import { TasksService } from '../application/tasks.service';
import type { TaskAccess } from '../application/ports/tasks-repository.port';
import { TaskAccessGuard } from '../infrastructure/task-access.guard';
import { CurrentTaskAccess } from './decorators/current-task-access.decorator';
import { TaskAccessMode } from './decorators/task-access.decorator';
import {
  AssignTaskDto,
  TaskIdParamDto,
  TaskResponseDto,
  UpdateTaskDto,
} from './dto/task.dto';

@ApiTags('Tasks')
@ApiBearerAuth()
@Controller({ path: 'tasks', version: '1' })
@UseGuards(TaskAccessGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get(':taskId')
  @ApiOperation({ summary: 'Get an active task' })
  @ApiStandardResponse(TaskResponseDto)
  get(
    @Param() _params: TaskIdParamDto,
    @CurrentTaskAccess() access: TaskAccess,
  ): TaskResponseDto {
    return TaskResponseDto.fromEntity(access.task);
  }

  @Patch(':taskId')
  @TaskAccessMode('write')
  @ApiOperation({ summary: 'Update an active task' })
  @ApiStandardResponse(TaskResponseDto)
  async update(
    @Param() params: TaskIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: UpdateTaskDto,
  ): Promise<TaskResponseDto> {
    return TaskResponseDto.fromEntity(
      await this.tasksService.update(params.taskId, user.id, input),
    );
  }

  @Post(':taskId/assign')
  @TaskAccessMode('write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign a task to a workspace member' })
  @ApiStandardResponse(TaskResponseDto)
  async assign(
    @Param() params: TaskIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: AssignTaskDto,
  ): Promise<TaskResponseDto> {
    return TaskResponseDto.fromEntity(
      await this.tasksService.assign(params.taskId, user.id, input.memberId),
    );
  }

  @Post(':taskId/complete')
  @TaskAccessMode('write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a task as completed' })
  @ApiStandardResponse(TaskResponseDto)
  async complete(
    @Param() params: TaskIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TaskResponseDto> {
    return TaskResponseDto.fromEntity(
      await this.tasksService.complete(params.taskId, user.id),
    );
  }

  @Post(':taskId/reopen')
  @TaskAccessMode('write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reopen a completed task' })
  @ApiStandardResponse(TaskResponseDto)
  async reopen(
    @Param() params: TaskIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TaskResponseDto> {
    return TaskResponseDto.fromEntity(
      await this.tasksService.reopen(params.taskId, user.id),
    );
  }

  @Delete(':taskId')
  @TaskAccessMode('write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete an active task' })
  @ApiNoContentResponse({ description: 'The task was deleted.' })
  async delete(
    @Param() params: TaskIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.tasksService.delete(params.taskId, user.id);
  }
}
