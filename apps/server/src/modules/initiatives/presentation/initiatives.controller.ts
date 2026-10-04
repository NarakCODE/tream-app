import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
interface Request {
  user: AuthenticatedPrincipal;
  commandIdentity: IdempotencyReservationInput;
}
import { CursorPaginationQueryDto } from '../../../common/dto/cursor-pagination-query.dto';
import { InitiativeService } from '../application/initiative.service';
import {
  CreateInitiativeDto,
  UpdateInitiativeDto,
  InitiativeRevisionDto,
  InitiativeListDto,
  LinkInitiativeProjectDto,
  ReorderInitiativeProjectsDto,
  InitiativeUpdateDto,
  EditInitiativeUpdateDto,
} from './initiative.dto';
@ApiTags('Initiatives')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/initiatives')
export class InitiativesController {
  constructor(private readonly service: InitiativeService) {}
  @Get() list(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Query() q: InitiativeListDto,
  ) {
    return this.service.list(r.user.id, w, q);
  }
  @Post() @TransactionalCommand() create(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Body() d: CreateInitiativeDto,
  ) {
    return this.service.create(r.commandIdentity, w, d);
  }
  @Get(':id') get(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
  ) {
    return this.service.get(r.user.id, w, id);
  }
  @Patch(':id') @TransactionalCommand() update(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
    @Body() d: UpdateInitiativeDto,
  ) {
    return this.service.update(r.commandIdentity, w, id, d);
  }
  @Delete(':id') @HttpCode(200) @TransactionalCommand() deleted(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
    @Body() d: InitiativeRevisionDto,
  ) {
    return this.service.lifecycle(
      r.commandIdentity,
      w,
      id,
      d.expectedRevision,
      'deleted',
    );
  }
  @Post(':id/archive') @HttpCode(200) @TransactionalCommand() archived(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
    @Body() d: InitiativeRevisionDto,
  ) {
    return this.service.lifecycle(
      r.commandIdentity,
      w,
      id,
      d.expectedRevision,
      'archived',
    );
  }
  @Post(':id/restore') @HttpCode(200) @TransactionalCommand() restored(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
    @Body() d: InitiativeRevisionDto,
  ) {
    return this.service.lifecycle(
      r.commandIdentity,
      w,
      id,
      d.expectedRevision,
      'restored',
    );
  }
  @Get(':id/projects') projects(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
  ) {
    return this.service.linkedProjects(r.user.id, w, id);
  }
  @Post(':id/projects') @TransactionalCommand() link(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
    @Body() d: LinkInitiativeProjectDto,
  ) {
    return this.service.link(
      r.commandIdentity,
      w,
      id,
      d.projectId,
      d.expectedRevision,
    );
  }
  @Delete(':id/projects/:projectId') @TransactionalCommand() unlink(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
    @Param('projectId') project: string,
    @Body() d: InitiativeRevisionDto,
  ) {
    return this.service.link(
      r.commandIdentity,
      w,
      id,
      project,
      d.expectedRevision,
      true,
    );
  }
  @Post(':id/projects/reorder') @HttpCode(200) @TransactionalCommand() reorder(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
    @Body() d: ReorderInitiativeProjectsDto,
  ) {
    return this.service.reorder(
      r.commandIdentity,
      w,
      id,
      d.projectIds,
      d.expectedRevision,
    );
  }
  @Get(':id/progress') progress(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
  ) {
    return this.service.progress(r.user.id, w, id);
  }
  @Get(':id/updates') updates(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
    @Query() q: CursorPaginationQueryDto,
  ) {
    return this.service.updates(r.user.id, w, id, q.limit, q.cursor);
  }
  @Post(':id/updates') @TransactionalCommand() publish(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
    @Body() d: InitiativeUpdateDto,
  ) {
    return this.service.publish(r.commandIdentity, w, id, d);
  }
  @Patch(':id/updates/:updateId') @TransactionalCommand() editUpdate(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
    @Param('updateId') updateId: string,
    @Body() d: EditInitiativeUpdateDto,
  ) {
    return this.service.editUpdate(r.commandIdentity, w, id, updateId, d);
  }
  @Delete(':id/updates/:updateId') @TransactionalCommand() deleteUpdate(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
    @Param('updateId') updateId: string,
    @Body() d: InitiativeRevisionDto,
  ) {
    return this.service.editUpdate(r.commandIdentity, w, id, updateId, d, true);
  }
  @Get(':id/subscribers') subscribers(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
    @Query() q: CursorPaginationQueryDto,
  ) {
    return this.service.subscribers(r.user.id, w, id, q.limit, q.cursor);
  }
  @Post(':id/subscription') @TransactionalCommand() subscribe(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
  ) {
    return this.service.subscribe(r.commandIdentity, w, id);
  }
  @Delete(':id/subscription') @TransactionalCommand() unsubscribe(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
  ) {
    return this.service.subscribe(r.commandIdentity, w, id, true);
  }
}
