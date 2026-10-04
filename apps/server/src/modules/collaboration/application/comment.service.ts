import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { comments, commentReactions } from '../../../database/schema';
import { DatabaseService } from '../../../database/database.service';
import type { DatabaseTransaction as Tx } from '../../../database/transaction';
import { CommandBus } from '../../../common/idempotency/command-bus.service';
import type { IdempotencyReservationInput as Identity } from '../../../common/idempotency/idempotency.types';
import { CollaborationAccessService } from './collaboration-access.service';
import { CollaborationFactsService } from './collaboration-facts.service';
import { CollaborationRepository } from '../infrastructure/collaboration.repository';
import {
  authorPermission,
  revision,
  text,
  type Target,
} from '../application/collaboration-policy';
import type {
  CreateCommentDto,
  UpdateCommentDto,
} from '../presentation/collaboration.dto';
@Injectable()
export class CommentService {
  constructor(
    private readonly db: DatabaseService,
    private readonly access: CollaborationAccessService,
    private readonly facts: CollaborationFactsService,
    private readonly repo: CollaborationRepository,
    private readonly commands: CommandBus,
  ) {}
  list(
    userId: string,
    w: string,
    target: Target,
    limit: number,
    cursor?: string,
  ) {
    return this.db.db.transaction(async (tx) => {
      await this.access.target(tx, userId, w, target);
      return this.repo.comments(tx, w, target, limit, cursor);
    });
  }
  get(userId: string, w: string, id: string) {
    return this.db.db.transaction(async (tx) => {
      const { comment } = await this.access.comment(
        tx,
        userId,
        w,
        id,
        false,
        false,
        true,
      );
      return comment.deletedAt ? { ...comment, body: null } : comment;
    });
  }
  create(identity: Identity, w: string, dto: CreateCommentDto) {
    return this.commands.execute(
      identity,
      async (tx) => {
        const member = await this.access.target(
          tx,
          identity.userId,
          w,
          dto,
          true,
        );
        await this.access.mentions(
          tx,
          w,
          dto,
          dto.mentionedMembershipIds ?? [],
        );
        if (dto.parentCommentId) {
          const { comment } = await this.access.comment(
            tx,
            identity.userId,
            w,
            dto.parentCommentId,
          );
          const parent = this.access.targetOf(comment);
          if (
            parent.targetType !== dto.targetType ||
            parent.targetId !== dto.targetId
          )
            throw new BadRequestException(
              'Replies must share the parent target.',
            );
        }
        const [comment] = await tx
          .insert(comments)
          .values({
            id: randomUUID(),
            workspaceId: w,
            authorId: member.id,
            body: text(dto.body),
            mentionedMembershipIds: dto.mentionedMembershipIds ?? [],
            parentCommentId: dto.parentCommentId,
            issueId: dto.targetType === 'issue' ? dto.targetId : null,
            projectId: dto.targetType === 'project' ? dto.targetId : null,
            projectUpdateId:
              dto.targetType === 'project_update' ? dto.targetId : null,
            initiativeId: dto.targetType === 'initiative' ? dto.targetId : null,
            initiativeUpdateId:
              dto.targetType === 'initiative_update' ? dto.targetId : null,
          })
          .returning();
        await this.fact(
          tx,
          w,
          member.id,
          comment!,
          'comment.created',
          dto.mentionedMembershipIds ?? [],
        );
        return comment;
      },
      {
        statusCode: 201,
        authorize: async (tx) => {
          await this.access.target(tx, identity.userId, w, dto, true, true);
          await this.access.mentions(
            tx,
            w,
            dto,
            dto.mentionedMembershipIds ?? [],
          );
        },
      },
    );
  }
  update(identity: Identity, w: string, id: string, dto: UpdateCommentDto) {
    return this.change(
      identity,
      w,
      id,
      dto.expectedRevision,
      'updated',
      dto.body,
      dto.mentionedMembershipIds,
    );
  }
  lifecycle(
    identity: Identity,
    w: string,
    id: string,
    expected: number,
    action: 'deleted' | 'restored',
  ) {
    return this.change(identity, w, id, expected, action);
  }
  private change(
    identity: Identity,
    w: string,
    id: string,
    expected: number,
    action: 'updated' | 'deleted' | 'restored',
    body?: string,
    mentionedMembershipIds?: string[],
  ) {
    const authorize = async (tx: Tx) => {
      const { comment, member } = await this.access.comment(
        tx,
        identity.userId,
        w,
        id,
        true,
        true,
        action !== 'updated',
      );
      authorPermission(comment.authorId, member, action !== 'updated');
      if (action === 'updated')
        await this.access.mentions(
          tx,
          w,
          this.access.targetOf(comment),
          mentionedMembershipIds ?? [],
        );
    };
    return this.commands.execute(
      identity,
      async (tx) => {
        const { comment, member } = await this.access.comment(
          tx,
          identity.userId,
          w,
          id,
          true,
          false,
          action !== 'updated',
        );
        revision(comment.revision, expected);
        if (action === 'deleted' && comment.deletedAt)
          throw new ConflictException('Comment is already deleted.');
        if (action === 'restored' && !comment.deletedAt)
          throw new ConflictException('Comment is not deleted.');
        const now = new Date();
        const [row] = await tx
          .update(comments)
          .set({
            revision: comment.revision + 1,
            updatedAt: now,
            ...(action === 'updated'
              ? {
                  body: text(body!),
                  editedAt: now,
                  ...(mentionedMembershipIds !== undefined
                    ? { mentionedMembershipIds }
                    : {}),
                }
              : { deletedAt: action === 'deleted' ? now : null }),
          })
          .where(eq(comments.id, id))
          .returning();
        await this.fact(
          tx,
          w,
          member.id,
          row!,
          `comment.${action}`,
          mentionedMembershipIds,
        );
        return row;
      },
      { authorize },
    );
  }
  reactions(
    userId: string,
    w: string,
    id: string,
    limit: number,
    cursor?: string,
  ) {
    return this.db.db.transaction(async (tx) => {
      await this.access.comment(tx, userId, w, id);
      return this.repo.reactions(tx, id, limit, cursor);
    });
  }
  react(
    identity: Identity,
    w: string,
    id: string,
    emoji: string,
    remove = false,
  ) {
    const value = text(emoji).normalize('NFC');
    const authorize = async (tx: Tx) => {
      await this.access.comment(tx, identity.userId, w, id, true, true);
    };
    return this.commands.execute(
      identity,
      async (tx) => {
        const { comment, member } = await this.access.comment(
          tx,
          identity.userId,
          w,
          id,
          true,
        );
        const condition = and(
          eq(commentReactions.commentId, id),
          eq(commentReactions.membershipId, member.id),
          eq(commentReactions.emoji, value),
        );
        const [existing] = await tx
          .select()
          .from(commentReactions)
          .where(condition)
          .limit(1);
        if (remove && !existing)
          throw new NotFoundException('Reaction not found.');
        if (!remove && existing)
          throw new ConflictException('Reaction already exists.');
        if (remove) await tx.delete(commentReactions).where(condition);
        else
          await tx.insert(commentReactions).values({
            id: randomUUID(),
            workspaceId: w,
            commentId: id,
            membershipId: member.id,
            emoji: value,
          });
        await this.facts.append(
          tx,
          w,
          member.id,
          'comment',
          id,
          `comment.reaction_${remove ? 'removed' : 'added'}`,
          { comment_id: id, membership_id: member.id, emoji: value },
          comment.issueId ?? undefined,
        );
        return { commentId: id, emoji: value, removed: remove };
      },
      { statusCode: remove ? 200 : 201, authorize },
    );
  }
  private fact(
    tx: Tx,
    w: string,
    actor: string,
    comment: typeof comments.$inferSelect,
    event: string,
    mentionedMembershipIds?: string[],
  ) {
    const target = this.access.targetOf(comment);
    return this.facts.append(
      tx,
      w,
      actor,
      'comment',
      comment.id,
      event,
      {
        comment_id: comment.id,
        target_type: target.targetType,
        target_id: target.targetId,
        parent_comment_id: comment.parentCommentId,
        revision: comment.revision,
        mentioned_membership_ids:
          mentionedMembershipIds ?? comment.mentionedMembershipIds,
      },
      comment.issueId ?? undefined,
      event === 'comment.restored' ? 2 : 3,
    );
  }
}
