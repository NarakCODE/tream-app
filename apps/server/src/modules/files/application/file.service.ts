import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, inArray } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import type { ApplicationConfiguration } from '../../../config/configuration.interface';
import {
  files,
  attachments,
  storageCleanupJobs,
} from '../../../database/schema';
import { DatabaseService } from '../../../database/database.service';
import type { DatabaseTransaction as Tx } from '../../../database/transaction';
import type { AuthenticatedPrincipal } from '../../../common/auth/principal';
import { CommandBus } from '../../../common/idempotency/command-bus.service';
import type { IdempotencyReservationInput as Identity } from '../../../common/idempotency/idempotency.types';
import { ObjectStorage, StorageError } from '../domain/object-storage.port';
import { ContentScanner } from '../domain/content-scanner.port';
import { FileGrant, type FileGrantClaims } from '../domain/file-grant.port';
import {
  ALLOWED_FILE_MIMES,
  FileContentError,
  normalizeFilename,
  validateFileContent,
} from '../domain/file-content-policy';
import {
  canManageFile,
  canRestoreFile,
  publicFile,
} from '../domain/file-policy';
import { FileAccessService } from './file-access.service';
import { FileFactsService } from './file-facts.service';
import {
  FileRepository,
  type FileRecord,
} from '../infrastructure/file.repository';
import type {
  UploadIntentDto,
  FinalizeFileDto,
  AttachmentDto,
  FileTargetDto,
} from '../presentation/file.dto';
const digest = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');
@Injectable()
export class FileService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService<ApplicationConfiguration, true>,
    private readonly commands: CommandBus,
    private readonly access: FileAccessService,
    private readonly repository: FileRepository,
    private readonly facts: FileFactsService,
    private readonly storage: ObjectStorage,
    private readonly scanner: ContentScanner,
    private readonly grants: FileGrant,
  ) {}
  private cfg() {
    return this.config.getOrThrow('files', { infer: true });
  }
  private revision(file: { revision: number }, expected: number) {
    if (file.revision !== expected)
      throw new ConflictException(
        'Revision conflict. Fetch the current resource and retry.',
      );
  }
  intent(
    identity: Identity,
    principal: AuthenticatedPrincipal,
    w: string,
    dto: UploadIntentDto,
  ) {
    let name: string;
    try {
      name = normalizeFilename(dto.name);
    } catch (error) {
      if (error instanceof FileContentError)
        throw new BadRequestException(error.message);
      throw error;
    }
    if (
      !ALLOWED_FILE_MIMES.includes(
        dto.mimeType as (typeof ALLOWED_FILE_MIMES)[number],
      )
    )
      throw new BadRequestException('Unsupported file MIME type.');
    const config = this.cfg();
    if (dto.sizeBytes > config.maxFileBytes)
      throw new BadRequestException(
        'File exceeds the configured upload limit.',
      );
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
        if (
          (await this.repository.reservedBytes(tx, w)) + dto.sizeBytes >
          config.workspaceQuotaBytes
        )
          throw new ConflictException('Workspace file quota exceeded.');
        const id = randomUUID();
        const attachmentId = randomUUID();
        const [file] = await tx
          .insert(files)
          .values({
            id,
            workspaceId: w,
            createdById: member.id,
            sourceAttachmentId: attachmentId,
            storageKey: randomUUID(),
            name,
            declaredMimeType: dto.mimeType,
            sizeBytes: dto.sizeBytes,
            sha256: dto.sha256,
            uploadExpiresAt: new Date(
              Date.now() + config.uploadIntentTtlSeconds * 1000,
            ),
          })
          .returning();
        const [attachment] = await tx
          .insert(attachments)
          .values({
            id: attachmentId,
            workspaceId: w,
            fileId: id,
            createdById: member.id,
            ...this.targetColumns(dto),
          })
          .returning();
        await this.facts.file(tx, w, member.id, id, 'upload_intent_created');
        await this.facts.attachment(tx, w, member.id, attachment!, 'created');
        return {
          file: publicFile(file!),
          attachment,
          ...this.grant(principal, w, file!, attachmentId, member.id, 'upload'),
        };
      },
      {
        statusCode: 201,
        authorize: async (tx) => {
          await this.access.target(tx, identity.userId, w, dto, true, true);
        },
      },
    );
  }
  uploadGrant(
    identity: Identity,
    principal: AuthenticatedPrincipal,
    w: string,
    id: string,
    expected: number,
  ) {
    return this.commands.execute(
      identity,
      async (tx) => {
        const { file, attachment, member } = await this.access.upload(
          tx,
          identity.userId,
          w,
          id,
        );
        this.revision(file, expected);
        return this.grant(
          principal,
          w,
          file,
          attachment.id,
          member.id,
          'upload',
        );
      },
      {
        statusCode: 201,
        authorize: async (tx) => {
          await this.access.upload(tx, identity.userId, w, id, true);
        },
      },
    );
  }
  get(userId: string, w: string, id: string, attachmentId?: string) {
    return this.db.db.transaction(async (tx) =>
      publicFile(
        (await this.access.linked(tx, userId, w, id, attachmentId)).file,
      ),
    );
  }
  async upload(
    principal: AuthenticatedPrincipal,
    w: string,
    id: string,
    token: string,
    bytes: Buffer,
  ) {
    const claims = this.verify(principal, w, id, token, 'upload');
    if (
      !Buffer.isBuffer(bytes) ||
      !bytes.length ||
      bytes.length > this.cfg().maxFileBytes
    )
      throw new BadRequestException('A bounded binary file body is required.');
    return this.db.db.transaction(async (tx) => {
      const { file, member } = await this.access.upload(
        tx,
        principal.id,
        w,
        id,
        true,
      );
      if (
        member.id !== claims.membershipId ||
        file.sourceAttachmentId !== claims.attachmentId
      )
        throw new ForbiddenException('Invalid file grant.');
      if (bytes.length !== file.sizeBytes || digest(bytes) !== file.sha256)
        throw new BadRequestException(
          'Uploaded bytes do not match the declared size and checksum.',
        );
      let mime: string;
      try {
        mime = validateFileContent(bytes, file.declaredMimeType);
      } catch (error) {
        if (error instanceof FileContentError)
          throw new BadRequestException(error.message);
        throw error;
      }
      try {
        await this.storage.put(file.storageKey, bytes);
      } catch (error) {
        if (error instanceof StorageError && error.code === 'CONFLICT')
          throw new ConflictException(
            'The uploaded object cannot be overwritten.',
          );
        throw new ServiceUnavailableException('File storage is unavailable.');
      }
      if (file.status === 'UPLOADED') return publicFile(file);
      const [row] = await tx
        .update(files)
        .set({
          status: 'UPLOADED',
          actualSizeBytes: bytes.length,
          actualSha256: file.sha256,
          actualMimeType: mime,
          uploadedAt: new Date(),
          revision: file.revision + 1,
          updatedAt: new Date(),
        })
        .where(eq(files.id, id))
        .returning();
      await this.facts.file(tx, w, member.id, id, 'uploaded');
      return publicFile(row!);
    });
  }
  finalize(identity: Identity, w: string, id: string, dto: FinalizeFileDto) {
    return this.commands.execute(
      identity,
      async (tx) => {
        const { file, member } = await this.access.manage(
          tx,
          identity.userId,
          w,
          id,
        );
        this.revision(file, dto.expectedRevision);
        if (file.status === 'READY') return publicFile(file);
        if (
          !['UPLOADED', 'QUARANTINED'].includes(file.status) ||
          file.uploadExpiresAt <= new Date()
        )
          throw new ConflictException(
            'Only a usable uploaded file can be finalized.',
          );
        if (dto.sha256 !== file.sha256)
          throw new BadRequestException(
            'Checksum does not match the upload intent.',
          );
        let bytes: Buffer;
        try {
          bytes = await this.storage.read(file.storageKey);
        } catch {
          return this.quarantine(tx, w, member.id, file, 'STORAGE_UNAVAILABLE');
        }
        if (bytes.length !== file.sizeBytes || digest(bytes) !== file.sha256)
          return this.quarantine(tx, w, member.id, file, 'CONTENT_MISMATCH');
        let mime: string;
        try {
          mime = validateFileContent(bytes, file.declaredMimeType);
        } catch {
          return this.quarantine(tx, w, member.id, file, 'CONTENT_MISMATCH');
        }
        try {
          const scan = await this.scanner.scan(bytes);
          if (scan.status !== 'clean')
            return this.quarantine(tx, w, member.id, file, 'INFECTED');
        } catch {
          return this.quarantine(tx, w, member.id, file, 'SCAN_UNAVAILABLE');
        }
        const [row] = await tx
          .update(files)
          .set({
            status: 'READY',
            readyAt: new Date(),
            quarantinedAt: null,
            actualSizeBytes: bytes.length,
            actualSha256: digest(bytes),
            actualMimeType: mime,
            revision: file.revision + 1,
            updatedAt: new Date(),
          })
          .where(eq(files.id, id))
          .returning();
        await this.facts.file(tx, w, member.id, id, 'ready');
        return publicFile(row!);
      },
      {
        authorize: async (tx) => {
          await this.access.manage(tx, identity.userId, w, id, true);
        },
      },
    );
  }
  private async quarantine(
    tx: Tx,
    w: string,
    actor: string,
    file: FileRecord,
    reason: string,
  ) {
    const [row] = await tx
      .update(files)
      .set({
        status: 'QUARANTINED',
        quarantinedAt: new Date(),
        revision: file.revision + 1,
        updatedAt: new Date(),
      })
      .where(eq(files.id, file.id))
      .returning();
    await this.facts.file(tx, w, actor, file.id, 'quarantined', reason);
    return publicFile(row!);
  }
  downloadGrant(
    identity: Identity,
    principal: AuthenticatedPrincipal,
    w: string,
    id: string,
    attachmentId: string,
  ) {
    return this.commands.execute(
      identity,
      async (tx) => {
        const { file, member } = await this.access.linked(
          tx,
          identity.userId,
          w,
          id,
          attachmentId,
        );
        if (file.status !== 'READY')
          throw new ConflictException('File is not ready for download.');
        return this.grant(
          principal,
          w,
          file,
          attachmentId,
          member.id,
          'download',
        );
      },
      {
        statusCode: 201,
        authorize: async (tx) => {
          const { file } = await this.access.linked(
            tx,
            identity.userId,
            w,
            id,
            attachmentId,
            false,
            true,
          );
          if (file.status !== 'READY')
            throw new ConflictException('File is not ready for download.');
        },
      },
    );
  }
  async download(
    principal: AuthenticatedPrincipal,
    w: string,
    id: string,
    token: string,
  ) {
    const claims = this.verify(principal, w, id, token, 'download');
    return this.db.db.transaction(async (tx) => {
      const { file, member } = await this.access.linked(
        tx,
        principal.id,
        w,
        id,
        claims.attachmentId,
        false,
        true,
      );
      if (file.status !== 'READY' || member.id !== claims.membershipId)
        throw new ForbiddenException('File download is no longer available.');
      let bytes: Buffer;
      try {
        bytes = await this.storage.read(file.storageKey);
      } catch {
        throw new ServiceUnavailableException('File storage is unavailable.');
      }
      if (bytes.length !== file.sizeBytes || digest(bytes) !== file.sha256)
        throw new ServiceUnavailableException(
          'File content integrity could not be verified.',
        );
      return { bytes, name: file.name, mimeType: file.actualMimeType! };
    });
  }
  delete(identity: Identity, w: string, id: string, expected: number) {
    return this.commands.execute(
      identity,
      async (tx) => {
        const { file, member } = await this.access.manage(
          tx,
          identity.userId,
          w,
          id,
        );
        this.revision(file, expected);
        if (
          !['PENDING', 'UPLOADED', 'QUARANTINED', 'READY'].includes(file.status)
        )
          throw new ConflictException(
            'File cannot be deleted in its current state.',
          );
        return publicFile(await this.markDeleted(tx, w, member.id, file));
      },
      {
        authorize: async (tx) => {
          await this.access.manage(tx, identity.userId, w, id, true);
        },
      },
    );
  }
  restore(identity: Identity, w: string, id: string, expected: number) {
    return this.commands.execute(
      identity,
      async (tx) => {
        const { file, member } = await this.access.manage(
          tx,
          identity.userId,
          w,
          id,
        );
        this.revision(file, expected);
        if (!canRestoreFile(file, new Date()))
          throw new ConflictException(
            'File cannot be restored after retention or purge claim.',
          );
        const [job] = await tx
          .select()
          .from(storageCleanupJobs)
          .where(
            and(
              eq(storageCleanupJobs.fileId, id),
              eq(storageCleanupJobs.status, 'PROCESSING'),
            ),
          )
          .limit(1);
        if (job) throw new ConflictException('File cleanup has already begun.');
        let stat;
        try {
          stat = await this.storage.stat(file.storageKey);
        } catch {
          throw new ServiceUnavailableException('File storage is unavailable.');
        }
        if (
          !stat ||
          stat.sizeBytes !== file.sizeBytes ||
          stat.checksumSha256 !== file.sha256
        )
          throw new ConflictException('Retained file bytes are unavailable.');
        await tx
          .update(storageCleanupJobs)
          .set({
            status: 'CANCELED',
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(storageCleanupJobs.fileId, id),
              inArray(storageCleanupJobs.status, ['PENDING', 'FAILED']),
            ),
          );
        const [row] = await tx
          .update(files)
          .set({
            status: 'READY',
            deletedAt: null,
            purgeAfter: null,
            revision: file.revision + 1,
            updatedAt: new Date(),
          })
          .where(eq(files.id, id))
          .returning();
        if (!(await this.repository.links(tx, id)).length) {
          const origin = (await this.repository.attachment(
            tx,
            w,
            file.sourceAttachmentId,
          ))!;
          const [restored] = await tx
            .update(attachments)
            .set({
              deletedAt: null,
              revision: origin.revision + 1,
              updatedAt: new Date(),
            })
            .where(eq(attachments.id, origin.id))
            .returning();
          await this.facts.attachment(tx, w, member.id, restored!, 'restored');
        }
        await this.facts.file(tx, w, member.id, id, 'restored');
        return publicFile(row!);
      },
      {
        authorize: async (tx) => {
          await this.access.manage(tx, identity.userId, w, id, true);
        },
      },
    );
  }
  list(
    userId: string,
    w: string,
    target: FileTargetDto,
    limit: number,
    cursor?: string,
  ) {
    return this.db.db.transaction(async (tx) => {
      const member = await this.access.target(tx, userId, w, target);
      return this.repository.list(
        tx,
        w,
        target,
        member.id,
        member.role,
        limit,
        cursor,
      );
    });
  }
  attach(identity: Identity, w: string, dto: AttachmentDto) {
    return this.commands.execute(
      identity,
      async (tx) => {
        const { file } = await this.access.linked(
          tx,
          identity.userId,
          w,
          dto.fileId,
        );
        this.revision(file, dto.expectedRevision);
        if (file.status !== 'READY')
          throw new ConflictException(
            'Only clean ready files can be attached.',
          );
        const member = await this.access.target(
          tx,
          identity.userId,
          w,
          dto,
          true,
        );
        const links = await this.repository.links(tx, file.id);
        if (
          links.some((link) => {
            const target = this.repository.target(link);
            return (
              target.targetType === dto.targetType &&
              target.targetId === dto.targetId
            );
          })
        )
          throw new ConflictException(
            'File is already attached to this target.',
          );
        const [attachment] = await tx
          .insert(attachments)
          .values({
            id: randomUUID(),
            workspaceId: w,
            fileId: file.id,
            createdById: member.id,
            ...this.targetColumns(dto),
          })
          .returning();
        const [row] = await tx
          .update(files)
          .set({ revision: file.revision + 1, updatedAt: new Date() })
          .where(eq(files.id, file.id))
          .returning();
        await this.facts.attachment(tx, w, member.id, attachment!, 'created');
        return { attachment, file: publicFile(row!) };
      },
      {
        statusCode: 201,
        authorize: async (tx) => {
          await this.access.linked(
            tx,
            identity.userId,
            w,
            dto.fileId,
            undefined,
            false,
            true,
          );
          await this.access.target(tx, identity.userId, w, dto, true, true);
        },
      },
    );
  }
  detach(identity: Identity, w: string, id: string, expected: number) {
    const authorize = async (tx: Tx) => {
      const { member } = await this.access.workspace.require(
        tx,
        identity.userId,
        w,
        'workspace.read',
        { lock: true },
      );
      const link = await this.repository.attachment(tx, w, id);
      if (!link) throw new NotFoundException('Attachment not found.');
      await this.access.target(
        tx,
        identity.userId,
        w,
        this.repository.target(link),
        true,
        true,
      );
      if (!canManageFile(link.createdById, member))
        throw new ForbiddenException('Attachment permission denied.');
      const file = await this.repository.file(tx, w, link.fileId, true);
      if (!file) throw new NotFoundException('File not found.');
      const source = (await this.repository.attachment(
        tx,
        w,
        file.sourceAttachmentId,
      ))!;
      await this.access.target(
        tx,
        identity.userId,
        w,
        this.repository.target(source),
      );
    };
    return this.commands.execute(
      identity,
      async (tx) => {
        const link = (await this.repository.attachment(tx, w, id))!;
        this.revision(link, expected);
        if (link.deletedAt)
          throw new ConflictException('Attachment is already detached.');
        const member = await this.access.target(
          tx,
          identity.userId,
          w,
          this.repository.target(link),
          true,
        );
        const [row] = await tx
          .update(attachments)
          .set({
            deletedAt: new Date(),
            revision: link.revision + 1,
            updatedAt: new Date(),
          })
          .where(eq(attachments.id, id))
          .returning();
        await this.facts.attachment(tx, w, member.id, row!, 'detached');
        if (!(await this.repository.links(tx, link.fileId)).length) {
          const file = (await this.repository.file(tx, w, link.fileId))!;
          if (
            ['PENDING', 'UPLOADED', 'QUARANTINED', 'READY'].includes(
              file.status,
            )
          )
            await this.markDeleted(tx, w, member.id, file);
        }
        return row;
      },
      { authorize },
    );
  }
  private async markDeleted(
    tx: Tx,
    w: string,
    actor: string,
    file: FileRecord,
  ) {
    const now = new Date();
    const purgeAfter = new Date(
      now.getTime() + this.cfg().retentionDays * 86400000,
    );
    const [row] = await tx
      .update(files)
      .set({
        status: 'DELETED',
        deletedAt: now,
        purgeAfter,
        revision: file.revision + 1,
        updatedAt: now,
      })
      .where(eq(files.id, file.id))
      .returning();
    await tx.insert(storageCleanupJobs).values({
      id: randomUUID(),
      workspaceId: w,
      fileId: file.id,
      storageKey: file.storageKey,
      reason: 'DELETED',
      runAfter: purgeAfter,
    });
    await this.facts.file(tx, w, actor, file.id, 'deleted');
    return row!;
  }
  private targetColumns(target: FileTargetDto) {
    return {
      issueId: target.targetType === 'issue' ? target.targetId : null,
      projectId: target.targetType === 'project' ? target.targetId : null,
      commentId: target.targetType === 'comment' ? target.targetId : null,
      documentId: target.targetType === 'document' ? target.targetId : null,
    };
  }
  private grant(
    principal: AuthenticatedPrincipal,
    w: string,
    file: FileRecord,
    attachmentId: string,
    membershipId: string,
    operation: 'upload' | 'download',
  ) {
    const cfg = this.cfg();
    const expiresAt = Math.min(
      Math.floor(Date.now() / 1000) +
        (operation === 'upload'
          ? cfg.uploadGrantTtlSeconds
          : cfg.downloadGrantTtlSeconds),
      operation === 'upload'
        ? Math.floor(file.uploadExpiresAt.getTime() / 1000)
        : Number.MAX_SAFE_INTEGER,
    );
    if (expiresAt <= Math.floor(Date.now() / 1000))
      throw new ConflictException(
        'The file grant cannot outlive its upload intent.',
      );
    const token = this.grants.sign({
      operation,
      userId: principal.id,
      sessionId: principal.sessionId,
      workspaceId: w,
      fileId: file.id,
      attachmentId,
      membershipId,
      expiresAt,
    });
    const url = `/api/v1/workspaces/${w}/files/${file.id}/content?grant=${encodeURIComponent(token)}`;
    return {
      [operation === 'upload' ? 'uploadUrl' : 'downloadUrl']: url,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    };
  }
  private verify(
    principal: AuthenticatedPrincipal,
    w: string,
    id: string,
    token: string,
    operation: 'upload' | 'download',
  ): FileGrantClaims {
    let claims: FileGrantClaims;
    try {
      claims = this.grants.verify(token, operation);
    } catch {
      throw new ForbiddenException('Invalid or expired file grant.');
    }
    if (
      claims.userId !== principal.id ||
      claims.sessionId !== principal.sessionId ||
      claims.workspaceId !== w ||
      claims.fileId !== id
    )
      throw new ForbiddenException('Invalid or expired file grant.');
    return claims;
  }
}
