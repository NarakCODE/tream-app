import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiCursorPaginatedResponse } from '../../../common/decorators/api-cursor-paginated-response.decorator';
import type { CursorPaginatedResult } from '../../../common/interfaces/api-response.interface';
import { WorkspaceMembershipGuard } from '../../iam/infrastructure/workspace-membership.guard';
import { WorkspaceRoles } from '../../iam/presentation/decorators/workspace-roles.decorator';
import { EventingService } from '../application/eventing.service';
import { EVENT_READ_ROLES } from '../domain/event-role-policy';
import { EventResponseDto, ListEventsQueryDto } from './dto/event.dto';

@ApiTags('Events')
@ApiBearerAuth()
@Controller({ path: 'workspaces/:workspaceId/events', version: '1' })
@UseGuards(WorkspaceMembershipGuard)
export class WorkspaceEventsController {
  constructor(private readonly eventingService: EventingService) {}

  @Get()
  @WorkspaceRoles(...EVENT_READ_ROLES)
  @ApiOperation({ summary: 'Query the immutable workspace event audit log' })
  @ApiCursorPaginatedResponse(EventResponseDto)
  async list(
    @Param('workspaceId') workspaceId: string,
    @Query() query: ListEventsQueryDto,
  ): Promise<CursorPaginatedResult<EventResponseDto>> {
    const page = await this.eventingService.list(workspaceId, query);
    return {
      ...page,
      items: page.items.map((event) => EventResponseDto.fromEntity(event)),
    };
  }
}
