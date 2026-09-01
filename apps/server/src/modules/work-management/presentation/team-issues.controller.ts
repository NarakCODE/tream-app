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
import { CurrentUser } from '../../iam/presentation/decorators/current-user.decorator';
import { IssuesService } from '../application/issues.service';
import { TeamAccessGuard } from '../infrastructure/team-access.guard';
import { WorkManagementAccessMode } from './decorators/work-management-access.decorator';
import {
  CreateIssueDto,
  IssueResponseDto,
  ListIssuesQueryDto,
} from './dto/issue.dto';
import type { TeamRequest } from '../infrastructure/work-management-request';
import { Request } from '@nestjs/common';

@ApiTags('Issues')
@ApiBearerAuth()
@Controller({ path: 'teams/:teamId/issues', version: '1' })
@UseGuards(TeamAccessGuard)
export class TeamIssuesController {
  constructor(private readonly issuesService: IssuesService) {}

  @Get()
  @WorkManagementAccessMode('read')
  @ApiOperation({ summary: 'List issues for a specific team' })
  @ApiCursorPaginatedResponse(IssueResponseDto)
  async list(
    @Param('teamId') teamId: string,
    @Request() req: TeamRequest,
    @Query() query: ListIssuesQueryDto,
  ): Promise<CursorPaginatedResult<IssueResponseDto>> {
    const workspaceId = req.teamAccess!.team.workspaceId;
    const page = await this.issuesService.list(workspaceId, {
      ...query,
      teamId,
    });
    return {
      ...page,
      items: page.items.map((issue) => IssueResponseDto.fromEntity(issue)),
    };
  }

  @Post()
  @WorkManagementAccessMode('write')
  @ApiOperation({ summary: 'Create an issue under a team' })
  @ApiStandardResponse(IssueResponseDto, HttpStatus.CREATED)
  async create(
    @Param('teamId') teamId: string,
    @Request() req: TeamRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateIssueDto,
  ): Promise<IssueResponseDto> {
    const workspaceId = req.teamAccess!.team.workspaceId;
    const issue = await this.issuesService.create(
      workspaceId,
      teamId,
      user.id,
      input,
    );
    return IssueResponseDto.fromEntity(issue);
  }
}
