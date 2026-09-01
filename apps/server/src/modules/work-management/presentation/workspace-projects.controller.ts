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
import { ProjectsService } from '../application/projects.service';
import {
  WORK_MANAGEMENT_READ_ROLES,
  WORK_MANAGEMENT_WRITE_ROLES,
} from '../domain/work-management-roles';
import {
  CreateProjectDto,
  ListProjectsQueryDto,
  ProjectResponseDto,
} from './dto/project.dto';

@ApiTags('Projects')
@ApiBearerAuth()
@Controller({ path: 'workspaces/:workspaceId/projects', version: '1' })
@UseGuards(WorkspaceMembershipGuard)
export class WorkspaceProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @WorkspaceRoles(...WORK_MANAGEMENT_READ_ROLES)
  @ApiOperation({ summary: 'List workspace projects' })
  @ApiCursorPaginatedResponse(ProjectResponseDto)
  async list(
    @Param('workspaceId') workspaceId: string,
    @Query() query: ListProjectsQueryDto,
  ): Promise<CursorPaginatedResult<ProjectResponseDto>> {
    const page = await this.projectsService.list(workspaceId, query);
    return {
      ...page,
      items: page.items.map((p) => ProjectResponseDto.fromEntity(p)),
    };
  }

  @Post()
  @WorkspaceRoles(...WORK_MANAGEMENT_WRITE_ROLES)
  @ApiOperation({ summary: 'Create a new project in workspace' })
  @ApiStandardResponse(ProjectResponseDto, HttpStatus.CREATED)
  async create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateProjectDto,
  ): Promise<ProjectResponseDto> {
    const project = await this.projectsService.create(
      workspaceId,
      user.id,
      input,
    );
    return ProjectResponseDto.fromEntity(project);
  }
}
