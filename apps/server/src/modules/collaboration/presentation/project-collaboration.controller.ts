import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedPrincipal } from '../../../common/auth/principal';
import type { IdempotencyReservationInput } from '../../../common/idempotency/idempotency.types';
import { TransactionalCommand } from '../../../common/decorators/transactional-command.decorator';
import { CursorPaginationQueryDto } from '../../../common/dto/cursor-pagination-query.dto';
import { LabelService } from '../application/label.service';
import { SubscriberService } from '../application/subscriber.service';
import { CommentService } from '../application/comment.service';
import { LabelLinkDto, LabelUnlinkDto } from './collaboration.dto';
interface Request {
  user: AuthenticatedPrincipal;
  commandIdentity: IdempotencyReservationInput;
}
@ApiTags('Collaboration')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/projects/:targetId')
export class ProjectCollaborationController {
  constructor(
    private readonly labels: LabelService,
    private readonly subscribers: SubscriberService,
    private readonly comments: CommentService,
  ) {}
  @Get('comments') listComments(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('targetId') id: string,
    @Query() q: CursorPaginationQueryDto,
  ) {
    return this.comments.list(
      r.user.id,
      w,
      { targetType: 'project', targetId: id },
      q.limit,
      q.cursor,
    );
  }
  @Get('labels') listLabels(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('targetId') id: string,
    @Query() q: CursorPaginationQueryDto,
  ) {
    return this.labels.assignments(
      r.user.id,
      w,
      {
        targetType: 'project',
        targetId: id,
      },
      q.limit,
      q.cursor,
    );
  }
  @Post('labels') @TransactionalCommand() link(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('targetId') id: string,
    @Body() d: LabelLinkDto,
  ) {
    return this.labels.link(
      r.commandIdentity,
      w,
      { targetType: 'project', targetId: id },
      d.labelId,
      d.expectedRevision,
    );
  }
  @Delete('labels/:labelId') @TransactionalCommand() unlink(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('targetId') id: string,
    @Param('labelId') labelId: string,
    @Body() d: LabelUnlinkDto,
  ) {
    return this.labels.link(
      r.commandIdentity,
      w,
      { targetType: 'project', targetId: id },
      labelId,
      d.expectedRevision,
      true,
    );
  }
  @Get('subscribers') listSubscribers(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('targetId') id: string,
    @Query() q: CursorPaginationQueryDto,
  ) {
    return this.subscribers.list(
      r.user.id,
      w,
      {
        targetType: 'project',
        targetId: id,
      },
      q.limit,
      q.cursor,
    );
  }
  @Post('subscription') @TransactionalCommand() subscribe(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('targetId') id: string,
  ) {
    return this.subscribers.change(r.commandIdentity, w, {
      targetType: 'project',
      targetId: id,
    });
  }
  @Delete('subscription') @TransactionalCommand() unsubscribe(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('targetId') id: string,
  ) {
    return this.subscribers.change(
      r.commandIdentity,
      w,
      { targetType: 'project', targetId: id },
      true,
    );
  }
}
