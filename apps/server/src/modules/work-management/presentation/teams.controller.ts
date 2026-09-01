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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiStandardResponse } from '../../../common/decorators/api-standard-response.decorator';
import type { AuthenticatedUser } from '../../iam/domain/auth-user';
import { CurrentUser } from '../../iam/presentation/decorators/current-user.decorator';
import { TeamsService } from '../application/teams.service';
import { TeamAccessGuard } from '../infrastructure/team-access.guard';
import { WorkManagementAccessMode } from './decorators/work-management-access.decorator';
import {
  TeamResponseDto,
  UpdateCycleSettingsDto,
  UpdateTeamDto,
} from './dto/team.dto';

@ApiTags('Teams')
@ApiBearerAuth()
@Controller({ path: 'teams/:teamId', version: '1' })
@UseGuards(TeamAccessGuard)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  @WorkManagementAccessMode('read')
  @ApiOperation({ summary: 'Get team details' })
  @ApiStandardResponse(TeamResponseDto)
  async get(@Param('teamId') teamId: string): Promise<TeamResponseDto> {
    const team = await this.teamsService.findById(teamId);
    return TeamResponseDto.fromEntity(team);
  }

  @Patch()
  @WorkManagementAccessMode('admin')
  @ApiOperation({ summary: 'Update team details' })
  @ApiStandardResponse(TeamResponseDto)
  async update(
    @Param('teamId') teamId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: UpdateTeamDto,
  ): Promise<TeamResponseDto> {
    const team = await this.teamsService.update(teamId, user.id, input);
    return TeamResponseDto.fromEntity(team);
  }

  @Delete()
  @WorkManagementAccessMode('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Retire team' })
  async delete(
    @Param('teamId') teamId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.teamsService.retire(teamId, user.id);
  }

  @Post('restore')
  @WorkManagementAccessMode('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore retired team' })
  @ApiStandardResponse(TeamResponseDto)
  async restore(
    @Param('teamId') teamId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TeamResponseDto> {
    const team = await this.teamsService.restore(teamId, user.id);
    return TeamResponseDto.fromEntity(team);
  }

  @Patch('cycle-settings')
  @WorkManagementAccessMode('admin')
  @ApiOperation({ summary: 'Update team cycle settings' })
  @ApiStandardResponse(TeamResponseDto)
  async updateCycleSettings(
    @Param('teamId') teamId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: UpdateCycleSettingsDto,
  ): Promise<TeamResponseDto> {
    const team = await this.teamsService.updateCycleSettings(
      teamId,
      user.id,
      input,
    );
    return TeamResponseDto.fromEntity(team);
  }
}
