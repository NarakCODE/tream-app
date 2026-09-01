import { Controller, Get, HttpStatus, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiStandardResponse } from '../../../common/decorators/api-standard-response.decorator';
import { TeamsService } from '../application/teams.service';
import { TeamAccessGuard } from '../infrastructure/team-access.guard';
import { WorkManagementAccessMode } from './decorators/work-management-access.decorator';
import { IssueStatusResponseDto } from './dto/team.dto';

@ApiTags('Teams')
@ApiBearerAuth()
@Controller({ path: 'teams/:teamId/issue-statuses', version: '1' })
@UseGuards(TeamAccessGuard)
export class TeamIssueStatusesController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  @WorkManagementAccessMode('read')
  @ApiOperation({ summary: 'List team issue workflow statuses' })
  @ApiStandardResponse(IssueStatusResponseDto, HttpStatus.OK)
  async list(
    @Param('teamId') teamId: string,
  ): Promise<IssueStatusResponseDto[]> {
    const statuses = await this.teamsService.listStatuses(teamId);
    return statuses.map((s) => IssueStatusResponseDto.fromEntity(s));
  }
}
