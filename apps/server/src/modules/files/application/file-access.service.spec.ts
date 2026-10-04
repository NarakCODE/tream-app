import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { FileAccessService } from './file-access.service';
import type { FileRepository } from '../infrastructure/file.repository';
import type { WorkspaceAuthorizationService } from '../../iam/workspaces/application/workspace-authorization.service';
import type { IssueAccessService } from '../../issues/application/issue-access.service';
import type { ProjectAccessService } from '../../projects/application/project-access.service';
import type { CollaborationAccessService } from '../../collaboration/application/collaboration-access.service';
import type { DocumentAccessService } from '../../documents/application/document-access.service';
import type { DatabaseTransaction } from '../../../database/transaction';
describe('file authorization anchor', () => {
  const tx = {} as DatabaseTransaction;
  function fixture() {
    const source = {
      id: 'origin',
      fileId: 'file',
      issueId: 'private',
      projectId: null,
      commentId: null,
      deletedAt: null as Date | null,
    };
    const publicLink = { ...source, id: 'publiclink', issueId: 'public' };
    const file = {
      id: 'file',
      sourceAttachmentId: 'origin',
      createdById: 'author',
      status: 'READY',
      revision: 1,
    };
    const member = { id: 'author', role: 'MEMBER' };
    const workspace = { require: jest.fn().mockResolvedValue({ member }) };
    const repository = {
      file: jest.fn().mockResolvedValue(file),
      attachment: jest
        .fn()
        .mockImplementation((_tx: unknown, _w: string, id: string) =>
          Promise.resolve(id === 'origin' ? source : publicLink),
        ),
      links: jest.fn().mockResolvedValue([source, publicLink]),
      target: jest.fn().mockImplementation((x: typeof source) => ({
        targetType: 'issue',
        targetId: x.issueId,
      })),
    };
    const service = new FileAccessService(
      workspace as unknown as WorkspaceAuthorizationService,
      {} as IssueAccessService,
      {} as ProjectAccessService,
      {} as CollaborationAccessService,
      {} as DocumentAccessService,
      repository as unknown as FileRepository,
    );
    const target = jest
      .spyOn(service, 'target')
      .mockResolvedValue(
        member as Awaited<ReturnType<FileAccessService['target']>>,
      );
    return { service, target, source, publicLink, file, repository, member };
  }
  it('denies a public secondary link when the original private target is inaccessible', async () => {
    const f = fixture();
    f.target.mockImplementation((_tx, _u, _w, target) => {
      if (target.targetId === 'private')
        return Promise.reject(new NotFoundException());
      return Promise.resolve(
        f.member as Awaited<ReturnType<FileAccessService['target']>>,
      );
    });
    await expect(
      f.service.linked(tx, 'user', 'workspace', 'file', 'publiclink'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(f.target).toHaveBeenCalledTimes(1);
  });
  it('metadata and lifecycle keep original attribution after source detachment', async () => {
    const f = fixture();
    f.source.deletedAt = new Date();
    f.repository.links.mockResolvedValue([]);
    await expect(
      f.service.linked(tx, 'user', 'workspace', 'file'),
    ).resolves.toMatchObject({ attachment: { id: 'origin' } });
    await expect(
      f.service.linked(tx, 'user', 'workspace', 'file', 'origin'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('secondary comment ownership cannot block the file author managing their original bytes', async () => {
    const f = fixture();
    await expect(
      f.service.manage(tx, 'user', 'workspace', 'file'),
    ).resolves.toMatchObject({ file: { id: 'file' } });
    expect(
      f.target.mock.calls.every((call) => call[3].targetId === 'private'),
    ).toBe(true);
    expect(f.target.mock.calls.some((call) => call[4] === true)).toBe(true);
  });
  it('source access alone does not grant another member file lifecycle ownership', async () => {
    const f = fixture();
    f.member.id = 'other';
    await expect(
      f.service.manage(tx, 'user', 'workspace', 'file'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
