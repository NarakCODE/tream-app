import {
  Body,
  Controller,
  Delete,
  Get,
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
import { TeamsService } from '../application/teams.service';
import { TeamAccessGuard } from '../infrastructure/team-access.guard';
import { WorkManagementAccessMode } from './decorators/work-management-access.decorator';
import {
  AddTeamMemberDto,
  TeamMemberDetailsDto,
  TeamMembershipResponseDto,
} from './dto/team.dto';

@ApiTags('Teams')
@ApiBearerAuth()
@Controller({ path: 'teams/:teamId/members', version: '1' })
@UseGuards(TeamAccessGuard)
export class TeamMembersController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  @WorkManagementAccessMode('read')
  @ApiOperation({ summary: 'List team members' })
  @ApiStandardResponse(TeamMemberDetailsDto, HttpStatus.OK)
  async list(@Param('teamId') teamId: string): Promise<TeamMemberDetailsDto[]> {
    const members = await this.teamsService.listMembers(teamId);
    return members.map((m) => TeamMemberDetailsDto.fromEntity(m));
  }

  @Post()
  @WorkManagementAccessMode('write')
  @ApiOperation({ summary: 'Add member to team' })
  @ApiStandardResponse(TeamMembershipResponseDto, HttpStatus.CREATED)
  async add(
    @Param('teamId') teamId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: AddTeamMemberDto,
  ): Promise<TeamMembershipResponseDto> {
    const membership = await this.teamsService.addMember(
      teamId,
      user.id,
      input.memberId,
    );
    return TeamMembershipResponseDto.fromEntity(membership);
  }

  @Delete(':membershipId')
  @WorkManagementAccessMode('write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove member from team' })
  async remove(
    @Param('teamId') teamId: string,
    @Param('membershipId') membershipId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.teamsService.removeMember(teamId, user.id, membershipId);
  }
}
