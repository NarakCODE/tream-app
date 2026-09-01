import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiStandardResponse } from '../../../common/decorators/api-standard-response.decorator';
import type { AuthenticatedUser } from '../../iam/domain/auth-user';
import { CurrentUser } from '../../iam/presentation/decorators/current-user.decorator';
import { ProjectsService } from '../application/projects.service';
import { ProjectAccessGuard } from '../infrastructure/project-access.guard';
import { WorkManagementAccessMode } from './decorators/work-management-access.decorator';
import { ProjectResponseDto, UpdateProjectDto } from './dto/project.dto';

@ApiTags('Projects')
@ApiBearerAuth()
@Controller({ path: 'projects/:projectId', version: '1' })
@UseGuards(ProjectAccessGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @WorkManagementAccessMode('read')
  @ApiOperation({ summary: 'Get project details' })
  @ApiStandardResponse(ProjectResponseDto)
  async get(
    @Param('projectId') projectId: string,
  ): Promise<ProjectResponseDto> {
    const project = await this.projectsService.findById(projectId);
    return ProjectResponseDto.fromEntity(project);
  }

  @Patch()
  @WorkManagementAccessMode('write')
  @ApiOperation({ summary: 'Update project details' })
  @ApiStandardResponse(ProjectResponseDto)
  async update(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: UpdateProjectDto,
  ): Promise<ProjectResponseDto> {
    const project = await this.projectsService.update(
      projectId,
      user.id,
      input,
    );
    return ProjectResponseDto.fromEntity(project);
  }

  @Delete()
  @WorkManagementAccessMode('write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete project' })
  async delete(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.projectsService.delete(projectId, user.id);
  }
}
