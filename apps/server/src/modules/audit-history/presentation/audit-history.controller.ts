import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedPrincipal } from '../../../common/auth/principal';
import { AuditHistoryService } from '../application/audit-history.service';
import { AuditQueryDto } from './audit-query.dto';
@ApiTags('Audit')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/audit')
export class AuditHistoryController {
  constructor(private readonly service: AuditHistoryService) {}
  @Get() list(
    @Req() req: { user: AuthenticatedPrincipal },
    @Param('workspaceId') workspaceId: string,
    @Query() query: AuditQueryDto,
  ) {
    return this.service.list(req.user.id, workspaceId, query);
  }
}
