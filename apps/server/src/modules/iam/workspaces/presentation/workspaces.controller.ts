import { RequireWorkspacePermission } from './workspace-permission.guard';
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
import type { AuthenticatedPrincipal } from '../../../../common/auth/principal';
import type { IdempotencyReservationInput } from '../../../../common/idempotency/idempotency.types';
import { TransactionalCommand } from '../../../../common/decorators/transactional-command.decorator';
import { CursorPaginationQueryDto } from '../../../../common/dto/cursor-pagination-query.dto';
import { WorkspaceService } from '../application/workspace.service';
import {
  AcceptInvitationDto,
  CreateInvitationDto,
  CreateWorkspaceDto,
  UpdateMembershipDto,
  UpdatePreferencesDto,
  UpdateWorkspaceDto,
} from './dto/workspace.dto';
interface AuthenticatedRequest {
  user: AuthenticatedPrincipal;
  commandIdentity: IdempotencyReservationInput;
}
@ApiTags('Workspaces')
@ApiBearerAuth()
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly service: WorkspaceService) {}
  @Get() list(
    @Req() req: AuthenticatedRequest,
    @Query() query: CursorPaginationQueryDto,
  ) {
    return this.service.list(req.user.id, query.limit, query.cursor);
  }
  @Post() @TransactionalCommand() create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateWorkspaceDto,
  ) {
    return this.service.create(req.commandIdentity, dto);
  }
  @Post('invitations/accept') @TransactionalCommand() accept(
    @Req() req: AuthenticatedRequest,
    @Body() dto: AcceptInvitationDto,
  ) {
    return this.service.accept(req.commandIdentity, dto.token);
  }
  @Get('active')
  active(@Req() req: AuthenticatedRequest) {
    return this.service.active(req.user.id);
  }
  @Post(':workspaceId/leave')
  @TransactionalCommand()
  @RequireWorkspacePermission('workspace.read')
  leave(@Req() req: AuthenticatedRequest, @Param('workspaceId') id: string) {
    return this.service.leave(req.commandIdentity, id);
  }
  @Get(':workspaceId')
  @RequireWorkspacePermission('workspace.read')
  get(@Req() req: AuthenticatedRequest, @Param('workspaceId') id: string) {
    return this.service.get(req.user.id, id);
  }
  @Patch(':workspaceId')
  @TransactionalCommand()
  @RequireWorkspacePermission('workspace.update', {
    archived: true,
    deleted: true,
  })
  update(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') id: string,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.service.update(req.commandIdentity, id, dto);
  }
  @Delete(':workspaceId')
  @TransactionalCommand()
  @RequireWorkspacePermission('workspace.delete', { archived: true })
  remove(@Req() req: AuthenticatedRequest, @Param('workspaceId') id: string) {
    return this.service.remove(req.commandIdentity, id);
  }
  @Post(':workspaceId/select')
  @TransactionalCommand()
  @RequireWorkspacePermission('workspace.read')
  select(@Req() req: AuthenticatedRequest, @Param('workspaceId') id: string) {
    return this.service.select(req.commandIdentity, id);
  }
  @Get(':workspaceId/members')
  @RequireWorkspacePermission('membership.read')
  members(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') id: string,
    @Query() query: CursorPaginationQueryDto,
  ) {
    return this.service.members(req.user.id, id, query.limit, query.cursor);
  }
  @Patch(':workspaceId/members/:membershipId')
  @TransactionalCommand()
  @RequireWorkspacePermission('membership.change_role')
  member(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') id: string,
    @Param('membershipId') memberId: string,
    @Body() dto: UpdateMembershipDto,
  ) {
    return this.service.changeMember(req.commandIdentity, id, memberId, dto);
  }
  @Delete(':workspaceId/members/:membershipId')
  @TransactionalCommand()
  @RequireWorkspacePermission('membership.change_role')
  removeMember(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') id: string,
    @Param('membershipId') memberId: string,
  ) {
    return this.service.changeMember(req.commandIdentity, id, memberId, {
      state: 'LEFT',
    });
  }
  @Get(':workspaceId/invitations')
  @RequireWorkspacePermission('membership.invite')
  invitations(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') id: string,
    @Query() query: CursorPaginationQueryDto,
  ) {
    return this.service.invitations(req.user.id, id, query.limit, query.cursor);
  }
  @Post(':workspaceId/invitations')
  @TransactionalCommand()
  @RequireWorkspacePermission('membership.invite')
  invite(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') id: string,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.service.invite(req.commandIdentity, id, dto);
  }
  @Delete(':workspaceId/invitations/:invitationId')
  @TransactionalCommand()
  @RequireWorkspacePermission('membership.invite')
  revoke(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') id: string,
    @Param('invitationId') invitationId: string,
  ) {
    return this.service.revokeInvitation(req.commandIdentity, id, invitationId);
  }
  @Get(':workspaceId/preferences')
  @RequireWorkspacePermission('preferences.update')
  preferences(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') id: string,
  ) {
    return this.service.preferences(req.user.id, id);
  }
  @Patch(':workspaceId/preferences')
  @TransactionalCommand()
  @RequireWorkspacePermission('preferences.update')
  savePreferences(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') id: string,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.service.savePreferences(req.commandIdentity, id, dto);
  }
}
