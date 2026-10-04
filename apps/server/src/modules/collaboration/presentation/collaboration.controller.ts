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
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedPrincipal } from '../../../common/auth/principal';
import type { IdempotencyReservationInput } from '../../../common/idempotency/idempotency.types';
import { TransactionalCommand } from '../../../common/decorators/transactional-command.decorator';
import { CursorPaginationQueryDto } from '../../../common/dto/cursor-pagination-query.dto';
import { CommentService } from '../application/comment.service';
import { LabelService } from '../application/label.service';
import { TemplateService } from '../application/template.service';
import {
  CreateCommentDto,
  UpdateCommentDto,
  ReactionDto,
  RevisionDto,
  CreateLabelDto,
  UpdateLabelDto,
  CreateTemplateDto,
  UpdateTemplateDto,
  InstantiateTemplateDto,
  TargetDto,
} from './collaboration.dto';
interface Request {
  user: AuthenticatedPrincipal;
  commandIdentity: IdempotencyReservationInput;
}
class CommentQueryDto extends CursorPaginationQueryDto {
  @IsIn([
    'issue',
    'project',
    'project_update',
    'initiative',
    'initiative_update',
  ])
  targetType!: TargetDto['targetType'];
  @IsString() @MinLength(1) @MaxLength(100) targetId!: string;
}
@ApiTags('Collaboration')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId')
export class CollaborationController {
  constructor(
    private readonly comments: CommentService,
    private readonly labels: LabelService,
    private readonly templates: TemplateService,
  ) {}
  @Get('comments') commentsList(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Query() q: CommentQueryDto,
  ) {
    return this.comments.list(r.user.id, w, q, q.limit, q.cursor);
  }
  @Post('comments') @TransactionalCommand() createComment(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Body() d: CreateCommentDto,
  ) {
    return this.comments.create(r.commandIdentity, w, d);
  }
  @Get('comments/:id') comment(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
  ) {
    return this.comments.get(r.user.id, w, id);
  }
  @Patch('comments/:id') @TransactionalCommand() updateComment(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
    @Body() d: UpdateCommentDto,
  ) {
    return this.comments.update(r.commandIdentity, w, id, d);
  }
  @Delete('comments/:id') @TransactionalCommand() deleteComment(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
    @Body() d: RevisionDto,
  ) {
    return this.comments.lifecycle(
      r.commandIdentity,
      w,
      id,
      d.expectedRevision,
      'deleted',
    );
  }
  @Post('comments/:id/restore') @TransactionalCommand() restoreComment(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
    @Body() d: RevisionDto,
  ) {
    return this.comments.lifecycle(
      r.commandIdentity,
      w,
      id,
      d.expectedRevision,
      'restored',
    );
  }
  @Get('comments/:id/reactions') reactions(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
    @Query() q: CursorPaginationQueryDto,
  ) {
    return this.comments.reactions(r.user.id, w, id, q.limit, q.cursor);
  }
  @Post('comments/:id/reactions') @TransactionalCommand() addReaction(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
    @Body() d: ReactionDto,
  ) {
    return this.comments.react(r.commandIdentity, w, id, d.emoji);
  }
  @Delete('comments/:id/reactions') @TransactionalCommand() removeReaction(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
    @Body() d: ReactionDto,
  ) {
    return this.comments.react(r.commandIdentity, w, id, d.emoji, true);
  }
  @Get('labels') labelList(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Query() q: CursorPaginationQueryDto,
  ) {
    return this.labels.list(r.user.id, w, q.limit, q.cursor);
  }
  @Post('labels') @TransactionalCommand() createLabel(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Body() d: CreateLabelDto,
  ) {
    return this.labels.create(r.commandIdentity, w, d);
  }
  @Get('labels/:id') label(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
  ) {
    return this.labels.get(r.user.id, w, id);
  }
  @Patch('labels/:id') @TransactionalCommand() updateLabel(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
    @Body() d: UpdateLabelDto,
  ) {
    return this.labels.update(r.commandIdentity, w, id, d);
  }
  @Post('labels/:id/archive') @TransactionalCommand() archiveLabel(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
    @Body() d: RevisionDto,
  ) {
    return this.labels.lifecycle(r.commandIdentity, w, id, d.expectedRevision);
  }
  @Post('labels/:id/restore') @TransactionalCommand() restoreLabel(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
    @Body() d: RevisionDto,
  ) {
    return this.labels.lifecycle(
      r.commandIdentity,
      w,
      id,
      d.expectedRevision,
      true,
    );
  }
  @Get('issue-templates') templateList(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Query() q: CursorPaginationQueryDto,
  ) {
    return this.templates.list(r.user.id, w, q.limit, q.cursor);
  }
  @Post('issue-templates') @TransactionalCommand() createTemplate(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Body() d: CreateTemplateDto,
  ) {
    return this.templates.create(r.commandIdentity, w, d);
  }
  @Get('issue-templates/:id') template(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
  ) {
    return this.templates.get(r.user.id, w, id);
  }
  @Patch('issue-templates/:id') @TransactionalCommand() updateTemplate(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
    @Body() d: UpdateTemplateDto,
  ) {
    return this.templates.update(r.commandIdentity, w, id, d);
  }
  @Post('issue-templates/:id/archive') @TransactionalCommand() archiveTemplate(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
    @Body() d: RevisionDto,
  ) {
    return this.templates.lifecycle(
      r.commandIdentity,
      w,
      id,
      d.expectedRevision,
    );
  }
  @Post('issue-templates/:id/restore') @TransactionalCommand() restoreTemplate(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
    @Body() d: RevisionDto,
  ) {
    return this.templates.lifecycle(
      r.commandIdentity,
      w,
      id,
      d.expectedRevision,
      true,
    );
  }
  @Post('issue-templates/:id/instantiate') @TransactionalCommand() instantiate(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
    @Body() d: InstantiateTemplateDto,
  ) {
    return this.templates.instantiate(r.commandIdentity, w, id, d);
  }
}
