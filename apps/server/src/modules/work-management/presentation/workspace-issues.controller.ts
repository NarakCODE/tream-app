import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiCursorPaginatedResponse } from '../../../common/decorators/api-cursor-paginated-response.decorator';
import type { CursorPaginatedResult } from '../../../common/interfaces/api-response.interface';
import { WorkspaceMembershipGuard } from '../../iam/infrastructure/workspace-membership.guard';
import { WorkspaceRoles } from '../../iam/presentation/decorators/workspace-roles.decorator';
import { IssuesService } from '../application/issues.service';
import { WORK_MANAGEMENT_READ_ROLES } from '../domain/work-management-roles';
import { IssueResponseDto, ListIssuesQueryDto } from './dto/issue.dto';

@ApiTags('Issues')
@ApiBearerAuth()
@Controller({ path: 'workspaces/:workspaceId/issues', version: '1' })
@UseGuards(WorkspaceMembershipGuard)
export class WorkspaceIssuesController {
  constructor(private readonly issuesService: IssuesService) {}

  @Get()
  @WorkspaceRoles(...WORK_MANAGEMENT_READ_ROLES)
  @ApiOperation({ summary: 'List workspace issues across teams' })
  @ApiCursorPaginatedResponse(IssueResponseDto)
  async list(
    @Param('workspaceId') workspaceId: string,
    @Query() query: ListIssuesQueryDto,
  ): Promise<CursorPaginatedResult<IssueResponseDto>> {
    const page = await this.issuesService.list(workspaceId, query);
    return {
      ...page,
      items: page.items.map((issue) => IssueResponseDto.fromEntity(issue)),
    };
  }
}
