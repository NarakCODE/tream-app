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
import { TeamsService } from '../application/teams.service';
import {
  WORK_MANAGEMENT_ADMIN_ROLES,
  WORK_MANAGEMENT_READ_ROLES,
} from '../domain/work-management-roles';
import {
  CreateTeamDto,
  ListTeamsQueryDto,
  TeamResponseDto,
} from './dto/team.dto';

@ApiTags('Teams')
@ApiBearerAuth()
@Controller({ path: 'workspaces/:workspaceId/teams', version: '1' })
@UseGuards(WorkspaceMembershipGuard)
export class WorkspaceTeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  @WorkspaceRoles(...WORK_MANAGEMENT_READ_ROLES)
  @ApiOperation({ summary: 'List teams in workspace' })
  @ApiCursorPaginatedResponse(TeamResponseDto)
  async list(
    @Param('workspaceId') workspaceId: string,
    @Query() query: ListTeamsQueryDto,
  ): Promise<CursorPaginatedResult<TeamResponseDto>> {
    const page = await this.teamsService.list(workspaceId, query);
    return {
      ...page,
      items: page.items.map((team) => TeamResponseDto.fromEntity(team)),
    };
  }

  @Post()
  @WorkspaceRoles(...WORK_MANAGEMENT_ADMIN_ROLES)
  @ApiOperation({ summary: 'Create a new team in workspace' })
  @ApiStandardResponse(TeamResponseDto, HttpStatus.CREATED)
  async create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateTeamDto,
  ): Promise<TeamResponseDto> {
    const team = await this.teamsService.create(workspaceId, user.id, input);
    return TeamResponseDto.fromEntity(team);
  }
}
