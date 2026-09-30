import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedPrincipal } from '../../../common/auth/principal';
import { OutboxMonitor } from '../application/outbox-monitor.service';
import { OutboxQueryDto } from './dto/outbox-query.dto';
@ApiTags('Eventing')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/outbox')
export class OutboxController {
  constructor(private readonly monitor: OutboxMonitor) {}
  @Get() list(
    @Req() request: { user: AuthenticatedPrincipal },
    @Param('workspaceId') workspaceId: string,
    @Query() query: OutboxQueryDto,
  ) {
    return this.monitor.list(request.user.id, workspaceId, query);
  }
}
