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
interface Request {
  user: AuthenticatedPrincipal;
  commandIdentity: IdempotencyReservationInput;
}
import { ProjectService } from '../application/project.service';
import { ProjectCollaborationService } from '../application/project-collaboration.service';
import {
  CreateProjectDto,
  UpdateProjectDto,
  AddProjectTeamDto,
  AddProjectMemberDto,
  CreateMilestoneDto,
  UpdateMilestoneDto,
  ReorderMilestonesDto,
  CreateProjectUpdateDto,
} from './project.dto';
@ApiTags('Projects')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/projects')
export class ProjectsController {
  constructor(
    private readonly service: ProjectService,
    private readonly collaboration: ProjectCollaborationService,
  ) {}
  @Get('') list(
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
  @Post('') @TransactionalCommand() create(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateProjectDto,
  ) {
    return this.service.create(req.commandIdentity, workspaceId, dto);
  }
  @Get(':projectId') get(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
  ) {
    return this.service.get(req.user.id, workspaceId, projectId);
  }
  @Patch(':projectId') @TransactionalCommand() update(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.service.update(
      req.commandIdentity,
      workspaceId,
      projectId,
      dto,
    );
  }
  @Delete(':projectId') @TransactionalCommand() delete(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
  ) {
    return this.service.lifecycle(
      req.commandIdentity,
      workspaceId,
      projectId,
      'delete',
    );
  }
  @Post(':projectId/archive') @TransactionalCommand() archive(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
  ) {
    return this.service.lifecycle(
      req.commandIdentity,
      workspaceId,
      projectId,
      'archive',
    );
  }
  @Post(':projectId/restore') @TransactionalCommand() restore(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
  ) {
    return this.service.lifecycle(
      req.commandIdentity,
      workspaceId,
      projectId,
      'restore',
    );
  }
  @Get(':projectId/teams') teams(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
  ) {
    return this.service.teamsList(req.user.id, workspaceId, projectId);
  }
  @Post(':projectId/teams') @TransactionalCommand() addTeam(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Body() dto: AddProjectTeamDto,
  ) {
    return this.service.addTeam(
      req.commandIdentity,
      workspaceId,
      projectId,
      dto.teamId,
    );
  }
  @Delete(':projectId/teams/:teamId') @TransactionalCommand() removeTeam(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Param('teamId') teamId: string,
  ) {
    return this.service.removeTeam(
      req.commandIdentity,
      workspaceId,
      projectId,
      teamId,
    );
  }
  @Get(':projectId/members') members(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
  ) {
    return this.service.members(req.user.id, workspaceId, projectId);
  }
  @Post(':projectId/members') @TransactionalCommand() addMember(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Body() dto: AddProjectMemberDto,
  ) {
    return this.service.addMember(
      req.commandIdentity,
      workspaceId,
      projectId,
      dto.membershipId,
    );
  }
  @Delete(':projectId/members/:membershipId')
  @TransactionalCommand()
  removeMember(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Param('membershipId') membershipId: string,
  ) {
    return this.service.removeMember(
      req.commandIdentity,
      workspaceId,
      projectId,
      membershipId,
    );
  }
  @Get(':projectId/progress') progress(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
  ) {
    return this.service.progress(req.user.id, workspaceId, projectId);
  }
  @Get(':projectId/milestones') milestones(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
  ) {
    return this.collaboration.milestones(req.user.id, workspaceId, projectId);
  }
  @Post(':projectId/milestones') @TransactionalCommand() createMilestone(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Body() dto: CreateMilestoneDto,
  ) {
    return this.collaboration.createMilestone(
      req.commandIdentity,
      workspaceId,
      projectId,
      dto,
    );
  }
  @Post(':projectId/milestones/reorder')
  @TransactionalCommand()
  reorderMilestones(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Body() dto: ReorderMilestonesDto,
  ) {
    return this.collaboration.reorderMilestones(
      req.commandIdentity,
      workspaceId,
      projectId,
      dto.milestoneIds,
    );
  }
  @Patch(':projectId/milestones/:milestoneId')
  @TransactionalCommand()
  updateMilestone(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Param('milestoneId') milestoneId: string,
    @Body() dto: UpdateMilestoneDto,
  ) {
    return this.collaboration.updateMilestone(
      req.commandIdentity,
      workspaceId,
      projectId,
      milestoneId,
      dto,
    );
  }
  @Delete(':projectId/milestones/:milestoneId')
  @TransactionalCommand()
  deleteMilestone(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Param('milestoneId') milestoneId: string,
  ) {
    return this.collaboration.deleteMilestone(
      req.commandIdentity,
      workspaceId,
      projectId,
      milestoneId,
    );
  }
  @Get(':projectId/updates') updates(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Query() query: CursorPaginationQueryDto,
  ) {
    return this.collaboration.updates(
      req.user.id,
      workspaceId,
      projectId,
      query.limit,
      query.cursor,
    );
  }
  @Post(':projectId/updates') @TransactionalCommand() publishUpdate(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Body() dto: CreateProjectUpdateDto,
  ) {
    return this.collaboration.publish(
      req.commandIdentity,
      workspaceId,
      projectId,
      dto,
    );
  }
}
