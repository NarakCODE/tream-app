import { Test } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join as joinPath } from 'node:path';
import { PinoLogger } from 'nestjs-pino';
import { AppModule } from '../src/app.module';
import {
  configureApplication,
  createFastifyAdapter,
} from '../src/application.factory';
import { AUTH_MAIL_SENDER } from '../src/modules/iam/authentication/application/auth-mail';
import { EventWriter } from '../src/modules/eventing/application/event-writer.service';
import {
  ObjectStorage,
  StorageError,
} from '../src/modules/files/domain/object-storage.port';
import {
  ContentScanner,
  ScanError,
} from '../src/modules/files/domain/content-scanner.port';
import { FilesystemObjectStorage } from '../src/modules/files/infrastructure/storage/filesystem-object-storage';
import { DevelopmentContentScanner } from '../src/modules/files/infrastructure/scanning/development-content-scanner';
import { FileCleanupWorker } from '../src/modules/files/application/file-cleanup.worker';
import { prepareIntegrationDatabase } from './helpers/integration-environment';

type User = { accessToken: string; user: { id: string }; email: string };
type FileRecord = {
  id: string;
  revision: number;
  status: string;
  name: string;
  sizeBytes: number;
  storageKey?: string;
  sha256: string;
  purgeAfter: string | null;
};
type Attachment = {
  id: string;
  revision: number;
  fileId: string;
  issueId: string | null;
  commentId: string | null;
  projectId: string | null;
};
type Intent = { file: FileRecord; attachment: Attachment; uploadUrl: string };
type Entity = {
  id: string;
  revision: number;
  identifier: string;
  number: number;
  teamId: string;
  statusId: string;
  projectId: string | null;
  milestoneId: string | null;
  cycleId: string | null;
  parentId: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
  title: string;
  isDefault: boolean;
  category: string;
};
type Fixture = {
  owner: User;
  workspaceId: string;
  base: string;
  path: string;
  team: Entity;
};

describe('M10 private files PostgreSQL HTTP and local storage contracts', () => {
  let app: NestFastifyApplication;
  let database: Awaited<ReturnType<typeof prepareIntegrationDatabase>>;
  let events: EventWriter;
  let storage: FilesystemObjectStorage;
  let scanner: DevelopmentContentScanner;
  let storageRoot: string;
  let cleanup: FileCleanupWorker;
  let requestNumber = 0;
  beforeAll(async () => {
    database = await prepareIntegrationDatabase();
    storageRoot = await mkdtemp(joinPath(tmpdir(), 'tream-file-http-'));
    process.env.FILES_LOCAL_ROOT = storageRoot;
    process.env.FILES_WORKSPACE_QUOTA_BYTES = '2097152';
    storage = new FilesystemObjectStorage({
      rootDirectory: storageRoot,
      maxFileBytes: 26214400,
    });
    scanner = new DevelopmentContentScanner('test');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ObjectStorage)
      .useValue(storage)
      .overrideProvider(ContentScanner)
      .useValue(scanner)
      .overrideProvider(AUTH_MAIL_SENDER)
      .useValue({ send: () => Promise.resolve() })
      .compile();
    (await module.resolve(PinoLogger)).logger.level = 'silent';
    events = module.get(EventWriter);
    cleanup = module.get(FileCleanupWorker);
    app = await configureApplication(
      module.createNestApplication<NestFastifyApplication>(
        createFastifyAdapter(),
        { bufferLogs: true },
      ),
    );
    app.useLogger(false);
    PinoLogger.root.level = 'silent';
  });
  afterAll(async () => {
    await app?.close();
    await database?.cleanup();
    await rm(storageRoot, { recursive: true, force: true });
    delete process.env.FILES_WORKSPACE_QUOTA_BYTES;
    delete process.env.FILES_LOCAL_ROOT;
  });
  function request(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    user?: User,
    payload?: object,
    key = randomUUID(),
  ) {
    return app.inject({
      method,
      url: `/api/v1${path}`,
      headers: {
        ...(user ? { authorization: `Bearer ${user.accessToken}` } : {}),
        'idempotency-key': key,
      },
      remoteAddress: `10.71.${Math.floor(++requestNumber / 250)}.${(requestNumber % 250) + 1}`,
      ...(payload ? { payload } : {}),
    });
  }
  async function signup(): Promise<User> {
    const email = `files-${randomUUID()}@example.test`;
    const r = await request('POST', '/auth/signup', undefined, {
      email,
      password: 'Integration-password-2026',
      fullName: 'Issues tester',
    });
    expect(r.statusCode).toBe(201);
    // Domain fixtures require a verified principal; token verification is covered
    // by the authentication contract suite.
    await database.connection.query(
      'UPDATE users SET email_verified_at = now() WHERE email = $1',
      [email],
    );
    const login = await request('POST', '/auth/login', undefined, {
      email,
      password: 'Integration-password-2026',
    });
    expect(login.statusCode).toBe(201);
    return { ...login.json<{ data: User }>().data, email };
  }
  async function team(
    f: Pick<Fixture, 'base' | 'owner'>,
    visibility = 'WORKSPACE',
  ) {
    const r = await request('POST', `${f.base}/teams`, f.owner, {
      name: 'Issue team',
      key: `I${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`,
      visibility,
    });
    expect(r.statusCode).toBe(201);
    return r.json<{ data: Entity }>().data;
  }
  async function fixture(): Promise<Fixture> {
    const owner = await signup();
    const r = await request('POST', '/workspaces', owner, {
      name: 'Issue workspace',
      slug: `issues-${randomUUID()}`,
    });
    expect(r.statusCode).toBe(201);
    const workspaceId = r.json<{ data: Entity }>().data.id;
    const base = `/workspaces/${workspaceId}`;
    const t = await team({ owner, base });
    return { owner, workspaceId, base, path: `${base}/issues`, team: t };
  }
  async function join(f: Fixture, role = 'MEMBER') {
    const user = await signup();
    const membershipId = randomUUID();
    await database.connection.query(
      'INSERT INTO memberships(id,workspace_id,user_id,role) VALUES($1,$2,$3,$4)',
      [membershipId, f.workspaceId, user.user.id, role],
    );
    return { user, membershipId };
  }
  async function create(f: Fixture, extra: object = {}, key = randomUUID()) {
    const r = await request(
      'POST',
      f.path,
      f.owner,
      { teamId: f.team.id, title: 'Issue', ...extra },
      key,
    );
    expect(r.statusCode).toBe(201);
    return r.json<{ data: Entity }>().data;
  }

  const checksum = (bytes: Buffer) =>
    createHash('sha256').update(bytes).digest('hex');
  async function intent(
    f: Fixture,
    bytes = Buffer.from('Private text'),
    extra: object = {},
    user = f.owner,
    key = randomUUID(),
  ) {
    const r = await request(
      'POST',
      `${f.base}/files/upload-intents`,
      user,
      {
        targetType: 'issue',
        targetId: (await create(f)).id,
        name: 'safe.txt',
        mimeType: 'text/plain',
        sizeBytes: bytes.length,
        sha256: checksum(bytes),
        ...extra,
      },
      key,
    );
    expect(r.statusCode).toBe(201);
    return r.json<{ data: Intent }>().data;
  }
  function upload(url: string, user: User, bytes: Buffer) {
    return app.inject({
      method: 'PUT',
      url,
      headers: {
        authorization: `Bearer ${user.accessToken}`,
        'content-type': 'application/octet-stream',
      },
      payload: bytes,
      remoteAddress: `10.72.0.${(++requestNumber % 250) + 1}`,
    });
  }
  async function ready(
    f: Fixture,
    bytes = Buffer.from('Private text'),
    extra: object = {},
    user = f.owner,
  ) {
    const created = await intent(f, bytes, extra, user);
    const uploaded = await upload(created.uploadUrl, user, bytes);
    expect(uploaded.statusCode).toBe(200);
    const file = uploaded.json<{ data: FileRecord }>().data;
    const finalized = await request(
      'POST',
      `${f.base}/files/${file.id}/finalize`,
      user,
      { expectedRevision: file.revision, sha256: checksum(bytes) },
    );
    expect(finalized.statusCode).toBe(200);
    return {
      ...created,
      file: finalized.json<{ data: FileRecord }>().data,
      bytes,
    };
  }
  async function downloadGrant(
    f: Fixture,
    file: FileRecord,
    attachment: Attachment,
    user = f.owner,
  ) {
    const r = await request(
      'POST',
      `${f.base}/files/${file.id}/download-grants`,
      user,
      { attachmentId: attachment.id },
    );
    expect(r.statusCode).toBe(201);
    return r.json<{ data: { downloadUrl: string } }>().data.downloadUrl;
  }
  function fetch(url: string, user?: User) {
    return app.inject({
      method: 'GET',
      url,
      headers: user ? { authorization: `Bearer ${user.accessToken}` } : {},
    });
  }

  it('uploads immutable bytes, verifies them, hides storage keys and downloads private content', async () => {
    const f = await fixture();
    const bytes = Buffer.from('Private UTF-8 document');
    const i = await intent(f, bytes);
    expect(i.file.status).toBe('PENDING');
    expect(i.file.storageKey).toBeUndefined();
    expect(i.file.revision).toBe(1);
    const first = await upload(i.uploadUrl, f.owner, bytes);
    expect(first.statusCode).toBe(200);
    const uploaded = first.json<{ data: FileRecord }>().data;
    expect(uploaded.status).toBe('UPLOADED');
    expect(uploaded.revision).toBe(2);
    const duplicate = await upload(i.uploadUrl, f.owner, bytes);
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json<{ data: FileRecord }>().data.revision).toBe(2);
    expect(
      (await upload(i.uploadUrl, f.owner, Buffer.from('Different bytes')))
        .statusCode,
    ).toBe(400);
    const key = randomUUID();
    const body = { expectedRevision: 2, sha256: checksum(bytes) };
    const final = await request(
      'POST',
      `${f.base}/files/${i.file.id}/finalize`,
      f.owner,
      body,
      key,
    );
    expect(final.statusCode).toBe(200);
    const file = final.json<{ data: FileRecord }>().data;
    expect(file.status).toBe('READY');
    expect(file.revision).toBe(3);
    const replay = await request(
      'POST',
      `${f.base}/files/${i.file.id}/finalize`,
      f.owner,
      body,
      key,
    );
    expect(replay.statusCode).toBe(200);
    expect(replay.json<{ data: FileRecord }>().data).toEqual(file);
    const url = await downloadGrant(f, file, i.attachment);
    expect((await fetch(url, f.owner)).rawPayload).toEqual(bytes);
    expect((await fetch(url)).statusCode).toBe(401);
  });

  it('binds upload and download capabilities to the current user and session', async () => {
    const f = await fixture();
    const member = await join(f);
    const i = await intent(f);
    expect(
      (await upload(i.uploadUrl, member.user, Buffer.from('Private text')))
        .statusCode,
    ).toBe(403);
    const logged = await request('POST', '/auth/login', undefined, {
      email: f.owner.email,
      password: 'Integration-password-2026',
    });
    expect(logged.statusCode).toBe(201);
    const second = {
      ...logged.json<{ data: User }>().data,
      email: f.owner.email,
    };
    expect(
      (await upload(i.uploadUrl, second, Buffer.from('Private text')))
        .statusCode,
    ).toBe(403);
    const completed = await ready(f);
    const url = await downloadGrant(f, completed.file, completed.attachment);
    expect((await fetch(url, member.user)).statusCode).toBe(403);
    expect((await fetch(url, second)).statusCode).toBe(403);
  });

  it('reauthorizes private target grants, target deletion and membership revocation', async () => {
    const f = await fixture();
    const member = await join(f);
    const privateTeam = await team(f, 'PRIVATE');
    const issue = await create(f, { teamId: privateTeam.id });
    expect(
      (
        await request('POST', `${f.base}/files/upload-intents`, member.user, {
          targetType: 'issue',
          targetId: issue.id,
          name: 'safe.txt',
          mimeType: 'text/plain',
          sizeBytes: 4,
          sha256: checksum(Buffer.from('text')),
        })
      ).statusCode,
    ).toBe(404);
    await database.connection.query(
      'INSERT INTO team_memberships(id,workspace_id,team_id,membership_id) VALUES($1,$2,$3,$4)',
      [randomUUID(), f.workspaceId, privateTeam.id, member.membershipId],
    );
    const content = await ready(f, Buffer.from('text'), { targetId: issue.id });
    const url = await downloadGrant(
      f,
      content.file,
      content.attachment,
      member.user,
    );
    expect((await fetch(url, member.user)).statusCode).toBe(200);
    await database.connection.query(
      'DELETE FROM team_memberships WHERE team_id=$1 AND membership_id=$2',
      [privateTeam.id, member.membershipId],
    );
    expect((await fetch(url, member.user)).statusCode).toBe(404);
    const ownerUrl = await downloadGrant(f, content.file, content.attachment);
    expect(
      (
        await request('DELETE', `${f.path}/${issue.id}`, f.owner, {
          expectedRevision: issue.revision,
        })
      ).statusCode,
    ).toBe(200);
    expect((await fetch(ownerUrl, f.owner)).statusCode).toBe(404);
    const publicContent = await ready(f);
    const memberUrl = await downloadGrant(
      f,
      publicContent.file,
      publicContent.attachment,
      member.user,
    );
    await database.connection.query(
      "UPDATE memberships SET state='SUSPENDED' WHERE id=$1",
      [member.membershipId],
    );
    expect([403, 404]).toContain(
      (await fetch(memberUrl, member.user)).statusCode,
    );
  });

  it('prevents cross-workspace attachment and confines comment uploads to the comment author', async () => {
    const f = await fixture();
    const member = await join(f);
    const issue = await create(f);
    const comment = await request('POST', `${f.base}/comments`, member.user, {
      targetType: 'issue',
      targetId: issue.id,
      body: 'Member comment',
    });
    expect(comment.statusCode).toBe(201);
    const commentId = comment.json<{ data: Entity }>().data.id;
    const nonAuthor = await join(f);
    const body = {
      targetType: 'comment',
      targetId: commentId,
      name: 'safe.txt',
      mimeType: 'text/plain',
      sizeBytes: 4,
      sha256: checksum(Buffer.from('text')),
    };
    expect(
      (
        await request(
          'POST',
          `${f.base}/files/upload-intents`,
          nonAuthor.user,
          body,
        )
      ).statusCode,
    ).toBe(403);
    const own = await request(
      'POST',
      `${f.base}/files/upload-intents`,
      member.user,
      body,
    );
    expect(own.statusCode).toBe(201);
    const other = await fixture();
    const foreign = await ready(other);
    expect(
      (await request('GET', `${f.base}/files/${foreign.file.id}`, f.owner))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await request('POST', `${f.base}/file-attachments`, f.owner, {
          fileId: foreign.file.id,
          targetType: 'issue',
          targetId: issue.id,
          expectedRevision: foreign.file.revision,
        })
      ).statusCode,
    ).toBe(404);
  });

  it('rejects spoofed uploads and quarantines corrupt, infected or inconclusive content', async () => {
    const f = await fixture();
    const mismatch = await intent(f, Buffer.from('changed'), {
      sha256: checksum(Buffer.from('expected')),
    });
    expect(
      (await upload(mismatch.uploadUrl, f.owner, Buffer.from('changed')))
        .statusCode,
    ).toBe(400);
    const spoof = await intent(f, Buffer.from('not a PNG'), {
      mimeType: 'image/png',
    });
    expect(
      (await upload(spoof.uploadUrl, f.owner, Buffer.from('not a PNG')))
        .statusCode,
    ).toBe(400);
    const eicar = Buffer.from(
      'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
    );
    const infected = await intent(f, eicar);
    const infectedUpload = await upload(infected.uploadUrl, f.owner, eicar);
    expect(infectedUpload.statusCode).toBe(200);
    const infectedFile = infectedUpload.json<{ data: FileRecord }>().data;
    const rejected = await request(
      'POST',
      `${f.base}/files/${infectedFile.id}/finalize`,
      f.owner,
      { expectedRevision: infectedFile.revision, sha256: checksum(eicar) },
    );
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json<{ data: FileRecord }>().data.status).toBe(
      'QUARANTINED',
    );
    expect(
      (
        await request(
          'POST',
          `${f.base}/files/${infectedFile.id}/download-grants`,
          f.owner,
          { attachmentId: infected.attachment.id },
        )
      ).statusCode,
    ).toBe(409);
    const valid = await intent(f);
    const uploaded = await upload(
      valid.uploadUrl,
      f.owner,
      Buffer.from('Private text'),
    );
    const file = uploaded.json<{ data: FileRecord }>().data;
    const corrupt = jest
      .spyOn(storage, 'read')
      .mockResolvedValueOnce(Buffer.from('Corrupt object'));
    try {
      const result = await request(
        'POST',
        `${f.base}/files/${file.id}/finalize`,
        f.owner,
        {
          expectedRevision: file.revision,
          sha256: checksum(Buffer.from('Private text')),
        },
      );
      expect(result.statusCode).toBe(200);
      expect(result.json<{ data: FileRecord }>().data.status).toBe(
        'QUARANTINED',
      );
    } finally {
      corrupt.mockRestore();
    }
    const retryFile = (
      await request('GET', `${f.base}/files/${file.id}`, f.owner)
    ).json<{ data: FileRecord }>().data;
    const unavailable = jest
      .spyOn(scanner, 'scan')
      .mockRejectedValueOnce(new ScanError());
    try {
      const result = await request(
        'POST',
        `${f.base}/files/${file.id}/finalize`,
        f.owner,
        {
          expectedRevision: retryFile.revision,
          sha256: checksum(Buffer.from('Private text')),
        },
      );
      expect(result.statusCode).toBe(200);
      expect(result.json<{ data: FileRecord }>().data.status).toBe(
        'QUARANTINED',
      );
    } finally {
      unavailable.mockRestore();
    }
  });

  it('serializes quota reservations and rejects stale file or attachment mutations', async () => {
    const f = await fixture();
    const issue = await create(f);
    const bytes = Buffer.alloc(1500000, 65);
    const body = {
      targetType: 'issue',
      targetId: issue.id,
      name: 'quota.txt',
      mimeType: 'text/plain',
      sizeBytes: bytes.length,
      sha256: checksum(bytes),
    };
    const race = await Promise.all([
      request('POST', `${f.base}/files/upload-intents`, f.owner, body),
      request('POST', `${f.base}/files/upload-intents`, f.owner, body),
    ]);
    expect(race.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    const fresh = await fixture();
    const content = await ready(fresh);
    expect(
      (
        await request(
          'DELETE',
          `${fresh.base}/files/${content.file.id}`,
          fresh.owner,
          { expectedRevision: 1 },
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await request(
          'DELETE',
          `${fresh.base}/file-attachments/${content.attachment.id}`,
          fresh.owner,
          { expectedRevision: 999 },
        )
      ).statusCode,
    ).toBe(409);
  });

  it('rolls back intent metadata and quota on event failure', async () => {
    const f = await fixture();
    const issue = await create(f);
    const spy = jest
      .spyOn(events, 'append')
      .mockRejectedValueOnce(new Error('Injected file event failure'));
    try {
      expect(
        (
          await request('POST', `${f.base}/files/upload-intents`, f.owner, {
            targetType: 'issue',
            targetId: issue.id,
            name: 'safe.txt',
            mimeType: 'text/plain',
            sizeBytes: 4,
            sha256: checksum(Buffer.from('text')),
          })
        ).statusCode,
      ).toBe(500);
    } finally {
      spy.mockRestore();
    }
    expect(
      (
        await database.connection.query(
          'SELECT id FROM files WHERE workspace_id=$1',
          [f.workspaceId],
        )
      ).rows,
    ).toEqual([]);
    expect(
      (
        await database.connection.query(
          'SELECT id FROM attachments WHERE workspace_id=$1',
          [f.workspaceId],
        )
      ).rows,
    ).toEqual([]);
  });
  it('keeps a private source anchor when the same file is also attached to a public project', async () => {
    const f = await fixture();
    const member = await join(f);
    const privateTeam = await team(f, 'PRIVATE');
    const privateIssue = await create(f, { teamId: privateTeam.id });
    const content = await ready(f, Buffer.from('Private origin'), {
      targetId: privateIssue.id,
    });
    const project = await request('POST', `${f.base}/projects`, f.owner, {
      name: 'Public project',
      teamIds: [f.team.id],
    });
    expect(project.statusCode).toBe(201);
    const projectId = project.json<{ data: Entity }>().data.id;
    const linked = await request(
      'POST',
      `${f.base}/file-attachments`,
      f.owner,
      {
        fileId: content.file.id,
        targetType: 'project',
        targetId: projectId,
        expectedRevision: content.file.revision,
      },
    );
    expect(linked.statusCode).toBe(201);
    const attachment = linked.json<{ data: { attachment: Attachment } }>().data
      .attachment;
    expect(
      (await request('GET', `${f.base}/projects/${projectId}`, member.user))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await request(
          'GET',
          `${f.base}/files/${content.file.id}?attachmentId=${attachment.id}`,
          member.user,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await request(
          'POST',
          `${f.base}/files/${content.file.id}/download-grants`,
          member.user,
          { attachmentId: attachment.id },
        )
      ).statusCode,
    ).toBe(404);
    const listed = await request(
      'GET',
      `${f.base}/file-attachments?targetType=project&targetId=${projectId}&limit=1`,
      member.user,
    );
    expect(listed.statusCode).toBe(200);
    const result = listed.json<{
      data: unknown[];
      meta: { total: number; nextCursor: string | null };
    }>();
    expect(result.data).toEqual([]);
    expect(result.meta.total).toBe(0);
    expect(result.meta.nextCursor).toBeNull();
  });

  it('retains last-detached placeholders and replays the committed detach without access resurrection', async () => {
    const f = await fixture();
    const content = await ready(f);
    const key = randomUUID();
    const body = { expectedRevision: content.attachment.revision };
    const detached = await request(
      'DELETE',
      `${f.base}/file-attachments/${content.attachment.id}`,
      f.owner,
      body,
      key,
    );
    expect(detached.statusCode).toBe(200);
    const replay = await request(
      'DELETE',
      `${f.base}/file-attachments/${content.attachment.id}`,
      f.owner,
      body,
      key,
    );
    expect(replay.statusCode).toBe(200);
    expect(replay.json<{ data: Attachment }>().data).toEqual(
      detached.json<{ data: Attachment }>().data,
    );
    const metadata = await request(
      'GET',
      `${f.base}/files/${content.file.id}`,
      f.owner,
    );
    expect(metadata.statusCode).toBe(200);
    expect(metadata.json<{ data: FileRecord }>().data.status).toBe('DELETED');
    expect(
      (
        await request(
          'POST',
          `${f.base}/files/${content.file.id}/download-grants`,
          f.owner,
          { attachmentId: content.attachment.id },
        )
      ).statusCode,
    ).toBe(404);
    const jobs = await database.connection.query(
      'SELECT id FROM storage_cleanup_jobs WHERE file_id=$1',
      [content.file.id],
    );
    expect(jobs.rows).toHaveLength(1);
    const placeholder = metadata.json<{ data: FileRecord }>().data;
    const restored = await request(
      'POST',
      `${f.base}/files/${content.file.id}/restore`,
      f.owner,
      { expectedRevision: placeholder.revision },
    );
    expect(restored.statusCode).toBe(200);
    expect(restored.json<{ data: FileRecord }>().data.status).toBe('READY');
    const revived = await database.connection.query<{
      deleted_at: Date | null;
      revision: number;
    }>('SELECT deleted_at,revision FROM attachments WHERE id=$1', [
      content.attachment.id,
    ]);
    expect(revived.rows[0]).toMatchObject({ deleted_at: null, revision: 3 });
    const url = await downloadGrant(
      f,
      restored.json<{ data: FileRecord }>().data,
      content.attachment,
    );
    expect((await fetch(url, f.owner)).statusCode).toBe(200);
  });
  it('accepts bounded binary uploads larger than the ordinary JSON request limit', async () => {
    const f = await fixture();
    const bytes = Buffer.alloc(1100000, 65);
    const content = await ready(f, bytes, { name: 'large.txt' });
    expect(content.file.status).toBe('READY');
    expect(content.file.sizeBytes).toBe(bytes.length);
    const url = await downloadGrant(f, content.file, content.attachment);
    const response = await fetch(url, f.owner);
    expect(response.statusCode).toBe(200);
    expect(checksum(response.rawPayload)).toBe(checksum(bytes));
  });
  async function forceDue(f: Fixture, fileId: string) {
    await database.connection.query(
      "UPDATE files SET purge_after=now()-interval '1 minute' WHERE id=$1",
      [fileId],
    );
    await database.connection.query(
      "UPDATE storage_cleanup_jobs SET run_after=now()-interval '1 minute' WHERE file_id=$1 AND status IN ('PENDING','FAILED')",
      [fileId],
    );
    return (await request('GET', `${f.base}/files/${fileId}`, f.owner)).json<{
      data: FileRecord;
    }>().data;
  }

  it('restores retained bytes, retries failed storage cleanup and preserves purged placeholders', async () => {
    const f = await fixture();
    const content = await ready(f);
    const originalUrl = await downloadGrant(
      f,
      content.file,
      content.attachment,
    );
    const deleted = await request(
      'DELETE',
      `${f.base}/files/${content.file.id}`,
      f.owner,
      { expectedRevision: content.file.revision },
    );
    expect(deleted.statusCode).toBe(200);
    const trash = deleted.json<{ data: FileRecord }>().data;
    expect(trash.status).toBe('DELETED');
    expect((await fetch(originalUrl, f.owner)).statusCode).toBe(403);
    const restored = await request(
      'POST',
      `${f.base}/files/${content.file.id}/restore`,
      f.owner,
      { expectedRevision: trash.revision },
    );
    expect(restored.statusCode).toBe(200);
    const file = restored.json<{ data: FileRecord }>().data;
    expect(file.status).toBe('READY');
    expect((await fetch(originalUrl, f.owner)).statusCode).toBe(200);
    expect(
      (
        await database.connection.query<{ status: string }>(
          'SELECT status FROM storage_cleanup_jobs WHERE file_id=$1',
          [file.id],
        )
      ).rows,
    ).toEqual([{ status: 'CANCELED' }]);
    expect(
      (
        await request('DELETE', `${f.base}/files/${file.id}`, f.owner, {
          expectedRevision: file.revision,
        })
      ).statusCode,
    ).toBe(200);
    await forceDue(f, file.id);
    const failure = jest
      .spyOn(storage, 'remove')
      .mockRejectedValueOnce(
        new StorageError('UNAVAILABLE', 'Injected storage outage'),
      );
    try {
      expect(await cleanup.run()).toBe(0);
    } finally {
      failure.mockRestore();
    }
    const purging = (
      await request('GET', `${f.base}/files/${file.id}`, f.owner)
    ).json<{ data: FileRecord }>().data;
    expect(purging.status).toBe('PURGING');
    expect(
      (
        await request('POST', `${f.base}/files/${file.id}/restore`, f.owner, {
          expectedRevision: purging.revision,
        })
      ).statusCode,
    ).toBe(409);
    const failed = await database.connection.query<{
      status: string;
      attempt_count: number;
      last_error: string;
    }>(
      "SELECT status,attempt_count,last_error FROM storage_cleanup_jobs WHERE file_id=$1 AND status='FAILED'",
      [file.id],
    );
    expect(failed.rows).toEqual([
      { status: 'FAILED', attempt_count: 1, last_error: 'STORAGE_UNAVAILABLE' },
    ]);
    await database.connection.query(
      "UPDATE storage_cleanup_jobs SET run_after=now()-interval '1 minute' WHERE file_id=$1 AND status='FAILED'",
      [file.id],
    );
    expect(await cleanup.run()).toBe(1);
    const purged = (
      await request('GET', `${f.base}/files/${file.id}`, f.owner)
    ).json<{ data: FileRecord }>().data;
    expect(purged.status).toBe('PURGED');
    expect(await cleanup.run()).toBe(0);
    const key = (
      await database.connection.query<{ storage_key: string }>(
        'SELECT storage_key FROM files WHERE id=$1',
        [file.id],
      )
    ).rows[0]!.storage_key;
    expect(await storage.stat(key)).toBeNull();
    expect(
      (
        await request(
          'POST',
          `${f.base}/files/${file.id}/download-grants`,
          f.owner,
          { attachmentId: content.attachment.id },
        )
      ).statusCode,
    ).toBe(409);
  });

  it('recovers cleanup after object deletion succeeds but the final event transaction rolls back', async () => {
    const f = await fixture();
    const content = await ready(f);
    expect(
      (
        await request('DELETE', `${f.base}/files/${content.file.id}`, f.owner, {
          expectedRevision: content.file.revision,
        })
      ).statusCode,
    ).toBe(200);
    await forceDue(f, content.file.id);
    const key = (
      await database.connection.query<{ storage_key: string }>(
        'SELECT storage_key FROM files WHERE id=$1',
        [content.file.id],
      )
    ).rows[0]!.storage_key;
    const failure = jest
      .spyOn(events, 'append')
      .mockRejectedValueOnce(new Error('Injected purge fact failure'));
    try {
      expect(await cleanup.run()).toBe(0);
    } finally {
      failure.mockRestore();
    }
    expect(await storage.stat(key)).toBeNull();
    expect(
      (
        await database.connection.query<{ status: string }>(
          'SELECT status FROM files WHERE id=$1',
          [content.file.id],
        )
      ).rows[0]!.status,
    ).toBe('PURGING');
    await database.connection.query(
      "UPDATE storage_cleanup_jobs SET run_after=now()-interval '1 minute' WHERE file_id=$1 AND status='FAILED'",
      [content.file.id],
    );
    expect(await cleanup.run()).toBe(1);
    expect(
      (
        await database.connection.query<{ status: string }>(
          'SELECT status FROM files WHERE id=$1',
          [content.file.id],
        )
      ).rows[0]!.status,
    ).toBe('PURGED');
    expect(
      (
        await database.connection.query<{ count: string }>(
          'SELECT count(*) FROM events WHERE aggregate_id=$1 AND event_type=$2',
          [content.file.id, 'file.purged'],
        )
      ).rows[0]!.count,
    ).toBe('1');
  });

  it('expires abandoned upload intents and removes their retained objects without losing placeholders', async () => {
    const f = await fixture();
    const content = await intent(f);
    const uploaded = await upload(
      content.uploadUrl,
      f.owner,
      Buffer.from('Private text'),
    );
    expect(uploaded.statusCode).toBe(200);
    const key = (
      await database.connection.query<{ storage_key: string }>(
        'SELECT storage_key FROM files WHERE id=$1',
        [content.file.id],
      )
    ).rows[0]!.storage_key;
    jest.useFakeTimers({
      now: Date.now() + 2 * 86400000,
      doNotFake: [
        'nextTick',
        'setImmediate',
        'clearImmediate',
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'performance',
        'hrtime',
        'queueMicrotask',
      ],
    });
    try {
      await cleanup.run();
    } finally {
      jest.useRealTimers();
    }
    expect(
      (
        await database.connection.query<{ status: string }>(
          'SELECT status FROM files WHERE id=$1',
          [content.file.id],
        )
      ).rows[0]!.status,
    ).toBe('PURGED');
    expect(await storage.stat(key)).toBeNull();
    const jobs = await database.connection.query<{
      reason: string;
      status: string;
    }>('SELECT reason,status FROM storage_cleanup_jobs WHERE file_id=$1', [
      content.file.id,
    ]);
    expect(jobs.rows).toEqual([{ reason: 'ABANDONED', status: 'SUCCEEDED' }]);
  });
  it('reclaims expired cleanup leases even after the retry counter saturates', async () => {
    const f = await fixture();
    const content = await ready(f);
    expect(
      (
        await request('DELETE', `${f.base}/files/${content.file.id}`, f.owner, {
          expectedRevision: content.file.revision,
        })
      ).statusCode,
    ).toBe(200);
    await forceDue(f, content.file.id);
    await database.connection.query(
      "UPDATE files SET status='PURGING' WHERE id=$1",
      [content.file.id],
    );
    await database.connection.query(
      "UPDATE storage_cleanup_jobs SET status='PROCESSING',locked_by='crashed-worker',locked_until=now()-interval '1 minute',attempt_count=10 WHERE file_id=$1",
      [content.file.id],
    );
    expect(await cleanup.run()).toBe(1);
    expect(
      (
        await database.connection.query<{
          status: string;
          attempt_count: number;
          locked_by: string | null;
        }>(
          'SELECT status,attempt_count,locked_by FROM storage_cleanup_jobs WHERE file_id=$1',
          [content.file.id],
        )
      ).rows,
    ).toEqual([{ status: 'SUCCEEDED', attempt_count: 10, locked_by: null }]);
    expect(
      (
        await database.connection.query<{ status: string }>(
          'SELECT status FROM files WHERE id=$1',
          [content.file.id],
        )
      ).rows[0]!.status,
    ).toBe('PURGED');
  });

  it('allows a non-admin uploader to trash a file despite another member attaching it to their comment', async () => {
    const f = await fixture();
    const uploader = await join(f);
    const collaborator = await join(f);
    const issue = await create(f);
    const content = await ready(
      f,
      Buffer.from('Uploader content'),
      { targetId: issue.id },
      uploader.user,
    );
    const comment = await request(
      'POST',
      `${f.base}/comments`,
      collaborator.user,
      {
        targetType: 'issue',
        targetId: issue.id,
        body: 'Collaborator-owned comment',
      },
    );
    expect(comment.statusCode).toBe(201);
    const commentId = comment.json<{ data: Entity }>().data.id;
    const attached = await request(
      'POST',
      `${f.base}/file-attachments`,
      collaborator.user,
      {
        fileId: content.file.id,
        targetType: 'comment',
        targetId: commentId,
        expectedRevision: content.file.revision,
      },
    );
    expect(attached.statusCode).toBe(201);
    const file = attached.json<{ data: { file: FileRecord } }>().data.file;
    expect(
      (
        await request('DELETE', `${f.base}/files/${file.id}`, uploader.user, {
          expectedRevision: file.revision,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await request('GET', `${f.base}/files/${file.id}`, uploader.user)).json<{
        data: FileRecord;
      }>().data.status,
    ).toBe('DELETED');
  });
});
