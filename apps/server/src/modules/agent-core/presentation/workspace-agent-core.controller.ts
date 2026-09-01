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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiCursorPaginatedResponse } from '../../../common/decorators/api-cursor-paginated-response.decorator';
import {
  ApiStandardArrayResponse,
  ApiStandardResponse,
} from '../../../common/decorators/api-standard-response.decorator';
import type { CursorPaginatedResult } from '../../../common/interfaces/api-response.interface';
import type { AuthenticatedUser } from '../../iam/domain/auth-user';
import { WorkspaceMembershipGuard } from '../../iam/infrastructure/workspace-membership.guard';
import { CurrentUser } from '../../iam/presentation/decorators/current-user.decorator';
import { WorkspaceRoles } from '../../iam/presentation/decorators/workspace-roles.decorator';
import { AgentCoreService } from '../application/agent-core.service';
import {
  AgentResponseDto,
  ApprovalResponseDto,
  CreateAgentDto,
  ListApprovalsQueryDto,
  ListRunsQueryDto,
  RunResponseDto,
} from './dto/agent-core.dto';

@ApiTags('Agents')
@ApiBearerAuth()
@Controller({ path: 'workspaces/:workspaceId', version: '1' })
@UseGuards(WorkspaceMembershipGuard)
export class WorkspaceAgentCoreController {
  constructor(private readonly service: AgentCoreService) {}
  @Get('agents')
  @WorkspaceRoles('OWNER', 'ADMIN', 'MEMBER')
  @ApiStandardArrayResponse(AgentResponseDto)
  async agents(
    @Param('workspaceId') ws: string,
    @CurrentUser() u: AuthenticatedUser,
  ): Promise<AgentResponseDto[]> {
    return (await this.service.listAgents(ws, u.id)).map(AgentResponseDto.from);
  }
  @Post('agents')
  @WorkspaceRoles('OWNER', 'ADMIN')
  @ApiStandardResponse(AgentResponseDto, HttpStatus.CREATED)
  async create(
    @Param('workspaceId') ws: string,
    @CurrentUser() u: AuthenticatedUser,
    @Body() dto: CreateAgentDto,
  ): Promise<AgentResponseDto> {
    return AgentResponseDto.from(
      await this.service.createAgent(ws, u.id, {
        ...dto,
        description: dto.description ?? null,
      }),
    );
  }
  @Get('agent-runs')
  @WorkspaceRoles('OWNER', 'ADMIN', 'MEMBER')
  @ApiCursorPaginatedResponse(RunResponseDto)
  async runs(
    @Param('workspaceId') ws: string,
    @CurrentUser() u: AuthenticatedUser,
    @Query() q: ListRunsQueryDto,
  ): Promise<CursorPaginatedResult<RunResponseDto>> {
    const page = await this.service.listRuns(ws, u.id, q);
    return { ...page, items: page.items.map(RunResponseDto.from) };
  }
  @Get('approvals')
  @WorkspaceRoles('OWNER', 'ADMIN', 'MEMBER')
  @ApiStandardArrayResponse(ApprovalResponseDto)
  async approvals(
    @Param('workspaceId') ws: string,
    @CurrentUser() u: AuthenticatedUser,
    @Query() q: ListApprovalsQueryDto,
  ): Promise<ApprovalResponseDto[]> {
    return (await this.service.listApprovals(ws, u.id, q.status)).map(
      ApprovalResponseDto.from,
    );
  }
}
