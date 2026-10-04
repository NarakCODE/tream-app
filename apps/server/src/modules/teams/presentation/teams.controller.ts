import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedPrincipal } from '../../../common/auth/principal';
import type { IdempotencyReservationInput } from '../../../common/idempotency/idempotency.types';
import { TransactionalCommand } from '../../../common/decorators/transactional-command.decorator';
import { CursorPaginationQueryDto } from '../../../common/dto/cursor-pagination-query.dto';
import { TeamService } from '../application/team.service';
import { TeamStatusService } from '../application/team-status.service';
import {
  AddTeamMemberDto,
  CreateStatusDto,
  CreateTeamDto,
  ReorderStatusesDto,
  RetireStatusDto,
  TeamMemberRoleDto,
  TeamSettingsDto,
  UpdateStatusDto,
  UpdateTeamDto,
} from './team.dto';
interface Request {
  user: AuthenticatedPrincipal;
  commandIdentity: IdempotencyReservationInput;
}
@ApiTags('Teams')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/teams')
export class TeamsController {
  constructor(
    private readonly service: TeamService,
    private readonly statuses: TeamStatusService,
  ) {}
  @Get() list(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Query() query: CursorPaginationQueryDto,
  ) {
    return this.service.list(
      req.user.id,
      workspaceId,
      query.limit,
      query.cursor,
    );
  }
  @Post() @TransactionalCommand() create(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateTeamDto,
  ) {
    return this.service.create(req.commandIdentity, workspaceId, dto);
  }
  @Get(':teamId') get(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('teamId') teamId: string,
  ) {
    return this.service.get(req.user.id, workspaceId, teamId);
  }
  @Patch(':teamId') @TransactionalCommand() update(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('teamId') teamId: string,
    @Body() dto: UpdateTeamDto,
  ) {
    return this.service.update(req.commandIdentity, workspaceId, teamId, dto);
  }
  @Delete(':teamId') @TransactionalCommand() retire(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('teamId') teamId: string,
  ) {
    return this.service.retire(req.commandIdentity, workspaceId, teamId);
  }
  @Get(':teamId/members') members(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('teamId') teamId: string,
  ) {
    return this.service.members(req.user.id, workspaceId, teamId);
  }
  @Post(':teamId/members') @TransactionalCommand() addMember(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('teamId') teamId: string,
    @Body() dto: AddTeamMemberDto,
  ) {
    return this.service.addMember(
      req.commandIdentity,
      workspaceId,
      teamId,
      dto,
    );
  }
  @Patch(':teamId/members/:membershipId') @TransactionalCommand() changeMember(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('teamId') teamId: string,
    @Param('membershipId') membershipId: string,
    @Body() dto: TeamMemberRoleDto,
  ) {
    return this.service.changeMember(
      req.commandIdentity,
      workspaceId,
      teamId,
      membershipId,
      dto.role,
    );
  }
  @Delete(':teamId/members/:membershipId') @TransactionalCommand() removeMember(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('teamId') teamId: string,
    @Param('membershipId') membershipId: string,
  ) {
    return this.service.changeMember(
      req.commandIdentity,
      workspaceId,
      teamId,
      membershipId,
    );
  }
  @Get(':teamId/settings') settings(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('teamId') teamId: string,
  ) {
    return this.service.settings(req.user.id, workspaceId, teamId);
  }
  @Patch(':teamId/settings') @TransactionalCommand() updateSettings(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('teamId') teamId: string,
    @Body() dto: TeamSettingsDto,
  ) {
    return this.service.updateSettings(
      req.commandIdentity,
      workspaceId,
      teamId,
      dto,
    );
  }
  @Get(':teamId/statuses') catalog(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('teamId') teamId: string,
  ) {
    return this.statuses.list(req.user.id, workspaceId, teamId);
  }
  @Post(':teamId/statuses') @TransactionalCommand() createStatus(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('teamId') teamId: string,
    @Body() dto: CreateStatusDto,
  ) {
    return this.statuses.create(req.commandIdentity, workspaceId, teamId, dto);
  }
  @Post(':teamId/statuses/reorder') @TransactionalCommand() reorder(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('teamId') teamId: string,
    @Body() dto: ReorderStatusesDto,
  ) {
    return this.statuses.reorder(
      req.commandIdentity,
      workspaceId,
      teamId,
      dto.statusIds,
    );
  }
  @Patch(':teamId/statuses/:statusId') @TransactionalCommand() updateStatus(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('teamId') teamId: string,
    @Param('statusId') statusId: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.statuses.update(
      req.commandIdentity,
      workspaceId,
      teamId,
      statusId,
      dto,
    );
  }
  @Post(':teamId/statuses/:statusId/default')
  @TransactionalCommand()
  defaultStatus(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('teamId') teamId: string,
    @Param('statusId') statusId: string,
  ) {
    return this.statuses.setDefault(
      req.commandIdentity,
      workspaceId,
      teamId,
      statusId,
    );
  }
  @Delete(':teamId/statuses/:statusId') @TransactionalCommand() retireStatus(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('teamId') teamId: string,
    @Param('statusId') statusId: string,
    @Body() dto: RetireStatusDto,
  ) {
    return this.statuses.retire(
      req.commandIdentity,
      workspaceId,
      teamId,
      statusId,
      dto?.replacementStatusId,
    );
  }
}
