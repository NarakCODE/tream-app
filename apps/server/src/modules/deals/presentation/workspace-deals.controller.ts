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
import { DealsService } from '../application/deals.service';
import { DEAL_READ_ROLES, DEAL_WRITE_ROLES } from '../domain/deal-role-policy';
import {
  CreateDealDto,
  DealResponseDto,
  ListDealsQueryDto,
} from './dto/deal.dto';

@ApiTags('Deals')
@ApiBearerAuth()
@Controller({ path: 'workspaces/:workspaceId/deals', version: '1' })
@UseGuards(WorkspaceMembershipGuard)
export class WorkspaceDealsController {
  constructor(private readonly dealsService: DealsService) {}

  @Get()
  @WorkspaceRoles(...DEAL_READ_ROLES)
  @ApiOperation({ summary: 'List active workspace deals' })
  @ApiCursorPaginatedResponse(DealResponseDto)
  async list(
    @Param('workspaceId') workspaceId: string,
    @Query() query: ListDealsQueryDto,
  ): Promise<CursorPaginatedResult<DealResponseDto>> {
    const page = await this.dealsService.list(
      workspaceId,
      query.stage,
      query.companyId,
      query.cursor,
      query.limit,
    );
    return {
      ...page,
      items: page.items.map((deal) => DealResponseDto.fromEntity(deal)),
    };
  }

  @Post()
  @WorkspaceRoles(...DEAL_WRITE_ROLES)
  @ApiOperation({ summary: 'Create a workspace deal' })
  @ApiStandardResponse(DealResponseDto, HttpStatus.CREATED)
  async create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateDealDto,
  ): Promise<DealResponseDto> {
    return DealResponseDto.fromEntity(
      await this.dealsService.create(workspaceId, user.id, input),
    );
  }
}
