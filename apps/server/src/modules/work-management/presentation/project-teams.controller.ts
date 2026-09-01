import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiStandardResponse } from '../../../common/decorators/api-standard-response.decorator';
import type { AuthenticatedUser } from '../../iam/domain/auth-user';
import { CurrentUser } from '../../iam/presentation/decorators/current-user.decorator';
import { ProjectsService } from '../application/projects.service';
import { ProjectAccessGuard } from '../infrastructure/project-access.guard';
import { WorkManagementAccessMode } from './decorators/work-management-access.decorator';
import { AddProjectTeamDto, ProjectTeamResponseDto } from './dto/project.dto';

@ApiTags('Projects')
@ApiBearerAuth()
@Controller({ path: 'projects/:projectId/teams', version: '1' })
@UseGuards(ProjectAccessGuard)
export class ProjectTeamsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @WorkManagementAccessMode('write')
  @ApiOperation({ summary: 'Associate team with project' })
  @ApiStandardResponse(ProjectTeamResponseDto, HttpStatus.CREATED)
  async add(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: AddProjectTeamDto,
  ): Promise<ProjectTeamResponseDto> {
    const association = await this.projectsService.addTeam(
      projectId,
      user.id,
      input.teamId,
    );
    return ProjectTeamResponseDto.fromEntity(association);
  }

  @Delete(':teamId')
  @WorkManagementAccessMode('write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove team association from project' })
  async remove(
    @Param('projectId') projectId: string,
    @Param('teamId') teamId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.projectsService.removeTeam(projectId, user.id, teamId);
  }
}
