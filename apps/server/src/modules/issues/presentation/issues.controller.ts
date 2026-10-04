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
import { IssueService } from '../application/issue.service';
import {
  CreateIssueDto,
  CreateTeamIssueDto,
  UpdateIssueDto,
  TransferIssueDto,
  IssueListDto,
  RelationDto,
  RevisionDto,
} from './issue.dto';
interface Request {
  user: AuthenticatedPrincipal;
  commandIdentity: IdempotencyReservationInput;
}
@ApiTags('Issues')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/issues')
export class IssuesController {
  constructor(private readonly service: IssueService) {}
  @Get() list(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Query() q: IssueListDto,
  ) {
    return this.service.list(r.user.id, w, q);
  }
  @Get('identifier/:identifier') lookup(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('identifier') identifier: string,
  ) {
    return this.service.lookup(r.user.id, w, identifier);
  }
  @Post() @TransactionalCommand() create(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Body() dto: CreateIssueDto,
  ) {
    return this.service.create(r.commandIdentity, w, dto);
  }
  @Get(':issueId') get(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('issueId') id: string,
  ) {
    return this.service.get(r.user.id, w, id);
  }
  @Patch(':issueId') @TransactionalCommand() update(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('issueId') id: string,
    @Body() dto: UpdateIssueDto,
  ) {
    return this.service.update(r.commandIdentity, w, id, dto);
  }
  @Delete(':issueId') @TransactionalCommand() delete(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('issueId') id: string,
    @Body() dto: RevisionDto,
  ) {
    return this.service.lifecycle(
      r.commandIdentity,
      w,
      id,
      'delete',
      dto.expectedRevision,
    );
  }
  @HttpCode(200)
  @Post(':issueId/archive')
  @TransactionalCommand()
  archive(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('issueId') id: string,
    @Body() dto: RevisionDto,
  ) {
    return this.service.lifecycle(
      r.commandIdentity,
      w,
      id,
      'archive',
      dto.expectedRevision,
    );
  }
  @HttpCode(200)
  @Post(':issueId/restore')
  @TransactionalCommand()
  restore(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('issueId') id: string,
    @Body() dto: RevisionDto,
  ) {
    return this.service.lifecycle(
      r.commandIdentity,
      w,
      id,
      'restore',
      dto.expectedRevision,
    );
  }
  @HttpCode(200)
  @Post(':issueId/transfer')
  @TransactionalCommand()
  transfer(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('issueId') id: string,
    @Body() dto: TransferIssueDto,
  ) {
    return this.service.transfer(r.commandIdentity, w, id, dto);
  }
  @Get(':issueId/relations') relations(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('issueId') id: string,
  ) {
    return this.service.relations(r.user.id, w, id);
  }
  @Post(':issueId/relations') @TransactionalCommand() addRelation(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('issueId') id: string,
    @Body() dto: RelationDto,
  ) {
    return this.service.addRelation(r.commandIdentity, w, id, dto);
  }
  @Delete(':issueId/relations/:relationId')
  @TransactionalCommand()
  removeRelation(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('issueId') id: string,
    @Param('relationId') relation: string,
    @Body() dto: RevisionDto,
  ) {
    return this.service.removeRelation(
      r.commandIdentity,
      w,
      id,
      relation,
      dto.expectedRevision,
    );
  }
}

@ApiTags('Issues')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/teams/:teamId/issues')
export class TeamIssuesController {
  constructor(private readonly service: IssueService) {}
  @Get() list(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('teamId') teamId: string,
    @Query() query: IssueListDto,
  ) {
    return this.service.list(r.user.id, w, { ...query, teamId });
  }
  @Post() @TransactionalCommand() create(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('teamId') teamId: string,
    @Body() dto: CreateTeamIssueDto,
  ) {
    return this.service.create(r.commandIdentity, w, { ...dto, teamId });
  }
}
