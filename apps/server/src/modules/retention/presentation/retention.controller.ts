import { WorkspaceTrashService } from '../application/workspace-trash.service';
import { CursorPaginationQueryDto } from '../../../common/dto/cursor-pagination-query.dto';
import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedPrincipal } from '../../../common/auth/principal';
import { WorkspaceAuthorizationService } from '../../iam/workspaces/application/workspace-authorization.service';
import { DatabaseService } from '../../../database/database.service';
import { RetentionPolicyService } from '../application/retention-policy.service';
import { TrashQueryService } from '../application/trash-query.service';
import { TrashQueryDto } from './trash-query.dto';
@ApiTags('Retention')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId')
export class RetentionController {
  constructor(
    private readonly policyService: RetentionPolicyService,
    private readonly trash: TrashQueryService,
    private readonly db: DatabaseService,
    private readonly access: WorkspaceAuthorizationService,
  ) {}
  @Get('retention-policy') policy(
    @Req() r: { user: AuthenticatedPrincipal },
    @Param('workspaceId') w: string,
  ) {
    return this.db.db.transaction(async (tx) => {
      await this.access.require(tx, r.user.id, w, 'workspace.read', {
        archived: true,
      });
      return this.policyService.policy();
    });
  }
  @Get('trash') list(
    @Req() r: { user: AuthenticatedPrincipal },
    @Param('workspaceId') w: string,
    @Query() query: TrashQueryDto,
  ) {
    return this.trash.list(r.user.id, w, query);
  }
}

@ApiTags('Retention')
@ApiBearerAuth()
@Controller('workspaces')
export class WorkspaceTrashController {
  constructor(private readonly trash: WorkspaceTrashService) {}
  @Get('trash') list(
    @Req() r: { user: AuthenticatedPrincipal },
    @Query() query: CursorPaginationQueryDto,
  ) {
    return this.trash.list(r.user.id, query);
  }
}
