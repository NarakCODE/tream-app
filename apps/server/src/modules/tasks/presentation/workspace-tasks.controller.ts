import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiCursorPaginatedResponse } from '../../../common/decorators/api-cursor-paginated-response.decorator';
import { ApiStandardResponse } from '../../../common/decorators/api-standard-response.decorator';
import type { CursorPaginatedResult } from '../../../common/interfaces/api-response.interface';
import type { AuthenticatedUser } from '../../iam/domain/auth-user';
import { WorkspaceMembershipGuard } from '../../iam/infrastructure/workspace-membership.guard';
import { CurrentUser } from '../../iam/presentation/decorators/current-user.decorator';
import { WorkspaceRoles } from '../../iam/presentation/decorators/workspace-roles.decorator';
import { TasksService } from '../application/tasks.service';
import { TASK_READ_ROLES, TASK_WRITE_ROLES } from '../domain/task-role-policy';
import {
  CreateTaskDto,
  ListTasksQueryDto,
  TaskResponseDto,
} from './dto/task.dto';

@ApiTags('Tasks')
@ApiBearerAuth()
@Controller({ path: 'workspaces/:workspaceId/tasks', version: '1' })
@UseGuards(WorkspaceMembershipGuard)
export class WorkspaceTasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  @WorkspaceRoles(...TASK_READ_ROLES)
  @ApiOperation({ summary: 'List active workspace tasks' })
  @ApiCursorPaginatedResponse(TaskResponseDto)
  async list(
    @Param('workspaceId') workspaceId: string,
    @Query() query: ListTasksQueryDto,
  ): Promise<CursorPaginatedResult<TaskResponseDto>> {
    const page = await this.tasksService.list(workspaceId, query);
    return {
      ...page,
      items: page.items.map((task) => TaskResponseDto.fromEntity(task)),
    };
  }

  @Post()
  @WorkspaceRoles(...TASK_WRITE_ROLES)
  @ApiOperation({ summary: 'Create a workspace task' })
  @ApiStandardResponse(TaskResponseDto, HttpStatus.CREATED)
  async create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateTaskDto,
  ): Promise<TaskResponseDto> {
    return TaskResponseDto.fromEntity(
      await this.tasksService.create(workspaceId, user.id, input),
    );
  }
}
