import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { projectUpdates } from '../../../database/schema';
import type { DatabaseTransaction as Tx } from '../../../database/transaction';
import { WorkspaceAuthorizationService } from '../../iam/workspaces/application/workspace-authorization.service';
import { IssueAccessService } from '../../issues/application/issue-access.service';
import { ProjectAccessService } from '../../projects/application/project-access.service';
import { CollaborationAccessService } from '../../collaboration/application/collaboration-access.service';
import { DocumentAccessService } from '../../documents/application/document-access.service';
import {
  FileRepository,
  type FileRecord,
} from '../infrastructure/file.repository';
import { canManageFile, type FileTarget } from '../domain/file-policy';
@Injectable()
export class FileAccessService {
  constructor(
    readonly workspace: WorkspaceAuthorizationService,
    private readonly issues: IssueAccessService,
    private readonly projects: ProjectAccessService,
    private readonly collaboration: CollaborationAccessService,
    private readonly documents: DocumentAccessService,
    readonly repository: FileRepository,
  ) {}
  async target(
    tx: Tx,
    userId: string,
    w: string,
    target: FileTarget,
    write = false,
    lock = false,
  ) {
    const { member } = await this.workspace.require(
      tx,
      userId,
      w,
      'workspace.read',
      { lock },
    );
    if (write && member.role === 'GUEST')
      throw new ForbiddenException('Guests cannot mutate attachments.');
    if (target.targetType === 'issue') {
      const { issue } = await this.issues.require(
        tx,
        userId,
        w,
        target.targetId,
        write ? 'write' : 'read',
        lock,
      );
      if (issue.deletedAt)
        throw new NotFoundException('Attachment target not found.');
    } else if (target.targetType === 'project') {
      const { project } = await this.projects.require(
        tx,
        userId,
        w,
        target.targetId,
        write ? 'manage' : 'read',
        lock,
      );
      if (project.deletedAt)
        throw new NotFoundException('Attachment target not found.');
    } else if (target.targetType === 'document') {
      await this.documents.require(
        tx,
        userId,
        w,
        target.targetId,
        write ? 'write' : 'read',
        lock,
      );
    } else {
      const { comment } = await this.collaboration.comment(
        tx,
        userId,
        w,
        target.targetId,
        false,
        lock,
      );
      if (write && !canManageFile(comment.authorId, member))
        throw new ForbiddenException('Comment attachment permission denied.');
      const inherited = this.collaboration.targetOf(comment);
      if (inherited.targetType === 'issue') {
        const { issue } = await this.issues.require(
          tx,
          userId,
          w,
          inherited.targetId,
          write ? 'write' : 'read',
          lock,
        );
        if (issue.deletedAt)
          throw new NotFoundException('Attachment target not found.');
      } else if (
        inherited.targetType === 'initiative' ||
        inherited.targetType === 'initiative_update'
      ) {
        await this.collaboration.target(tx, userId, w, inherited, write, lock);
      } else {
        let projectId = inherited.targetId;
        if (inherited.targetType === 'project_update') {
          const [update] = await tx
            .select()
            .from(projectUpdates)
            .where(
              and(
                eq(projectUpdates.workspaceId, w),
                eq(projectUpdates.id, inherited.targetId),
              ),
            )
            .limit(1);
          if (!update || update.deletedAt)
            throw new NotFoundException('Attachment target not found.');
          projectId = update.projectId;
        }
        const { project } = await this.projects.require(
          tx,
          userId,
          w,
          projectId,
          'read',
          lock,
        );
        if (write)
          await this.collaboration.target(tx, userId, w, inherited, true, lock);
        if (project.deletedAt)
          throw new NotFoundException('Attachment target not found.');
      }
    }

    return member;
  }
  async linked(
    tx: Tx,
    userId: string,
    w: string,
    fileId: string,
    attachmentId?: string,
    write = false,
    lock = false,
    allowDeleted = true,
  ) {
    const { member } = await this.workspace.require(
      tx,
      userId,
      w,
      'workspace.read',
      { lock },
    );
    const initial = await this.repository.file(tx, w, fileId);
    if (!initial) throw new NotFoundException('File not found.');
    const source = await this.repository.attachment(
      tx,
      w,
      initial.sourceAttachmentId,
    );
    if (!source || source.fileId !== fileId)
      throw new NotFoundException('File not found.');
    await this.target(
      tx,
      userId,
      w,
      this.repository.target(source),
      false,
      lock,
    );
    const links = attachmentId
      ? [await this.repository.attachment(tx, w, attachmentId)]
      : [
          source,
          ...(await this.repository.links(tx, fileId)).filter(
            (link) => link.id !== source.id,
          ),
        ];
    let permitted: Awaited<ReturnType<FileRepository['attachment']>>;
    for (const link of links) {
      if (
        !link ||
        link.fileId !== fileId ||
        (link.deletedAt &&
          (!!attachmentId || link.id !== initial.sourceAttachmentId))
      )
        continue;
      try {
        await this.target(
          tx,
          userId,
          w,
          this.repository.target(link),
          write,
          lock,
        );
        permitted = link;
        break;
      } catch (error) {
        if (
          !(error instanceof NotFoundException) &&
          !(error instanceof ForbiddenException)
        )
          throw error;
      }
    }
    if (!permitted) throw new NotFoundException('File not found.');
    if (
      ['PENDING', 'UPLOADED', 'QUARANTINED', 'EXPIRED'].includes(
        initial.status,
      ) &&
      initial.createdById !== member.id &&
      !write
    )
      throw new NotFoundException('File not found.');
    if (
      !allowDeleted &&
      ['DELETED', 'PURGING', 'PURGED', 'EXPIRED'].includes(initial.status)
    )
      throw new ConflictException('File is deleted or expired.');
    const file = lock
      ? (await this.repository.file(tx, w, fileId, true))!
      : initial;
    return { file, attachment: permitted, member };
  }
  async manage(tx: Tx, userId: string, w: string, id: string, lock = false) {
    const context = await this.linked(
      tx,
      userId,
      w,
      id,
      undefined,
      false,
      lock,
      true,
    );
    if (
      !canManageFile(context.file.createdById, context.member) ||
      context.member.role === 'GUEST'
    )
      throw new ForbiddenException('File permission denied.');
    const source = (await this.repository.attachment(
      tx,
      w,
      context.file.sourceAttachmentId,
    ))!;
    await this.target(
      tx,
      userId,
      w,
      this.repository.target(source),
      true,
      lock,
    );
    return context;
  }
  async upload(tx: Tx, userId: string, w: string, id: string, lock = false) {
    const context = await this.manage(tx, userId, w, id, lock);
    if (context.file.createdById !== context.member.id)
      throw new ForbiddenException(
        'Upload grants belong to the upload author.',
      );
    this.usableUpload(context.file);
    return context;
  }
  usableUpload(file: FileRecord) {
    if (
      !['PENDING', 'UPLOADED'].includes(file.status) ||
      file.uploadExpiresAt <= new Date()
    )
      throw new ConflictException('Upload intent is no longer usable.');
  }
}
