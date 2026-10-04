import { Test } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { AppModule } from '../src/app.module';
import {
  configureApplication,
  createFastifyAdapter,
} from '../src/application.factory';
import { AUTH_MAIL_SENDER } from '../src/modules/iam/authentication/application/auth-mail';
import { seedDemo } from '../src/database/demo-seed/runner';
import { verifyDemo } from '../src/database/demo-seed/verify';
import { prepareIntegrationDatabase } from './helpers/integration-environment';

/** Real migrations, real PostgreSQL, and every implemented HTTP list as the owner. */
describe('Complete Northstar demo seed', () => {
  let database: Awaited<ReturnType<typeof prepareIntegrationDatabase>>;
  let app: NestFastifyApplication | undefined;
  beforeAll(async () => {
    database = await prepareIntegrationDatabase();
  }, 60_000);
  afterAll(async () => {
    await app?.close();
    await database?.cleanup();
  }, 30_000);

  it('seeds a fresh database, reruns and resets without duplicates or touching non-demo records', async () => {
    const outsider = randomUUID();
    const workspace = randomUUID();
    const member = randomUUID();
    const fixtureConnection = await database.connection.connect();
    await fixtureConnection.query('BEGIN');
    try {
      await fixtureConnection.query(
        'INSERT INTO users(id,email,full_name,email_verified_at) VALUES($1,$2,$3,now())',
        [outsider, `untouched-${outsider}@example.test`, 'Unaffected customer'],
      );
      await fixtureConnection.query(
        'INSERT INTO workspaces(id,name,slug) VALUES($1,$2,$3)',
        [workspace, 'Unaffected company', `untouched-${workspace}`],
      );
      await fixtureConnection.query(
        "INSERT INTO memberships(id,workspace_id,user_id,role) VALUES($1,$2,$3,'OWNER')",
        [member, workspace, outsider],
      );
      await fixtureConnection.query('COMMIT');
    } catch (error) {
      await fixtureConnection.query('ROLLBACK');
      throw error;
    } finally {
      fixtureConnection.release();
    }
    const before = (
      await database.connection.query<{ value: unknown }>(
        'SELECT row_to_json(w) value FROM workspaces w WHERE id=$1',
        [workspace],
      )
    ).rows[0];
    const now = new Date('2026-10-04T12:00:00.000Z');
    const first = await seedDemo({ databaseUrl: database.url, now });
    const second = await seedDemo({ databaseUrl: database.url, now });
    const reset = await seedDemo({
      databaseUrl: database.url,
      now,
      reset: true,
    });
    expect(second.counts).toEqual(first.counts);
    expect(reset.counts).toEqual(first.counts);
    expect(second.workspaceId).toBe(first.workspaceId);
    expect(
      (
        await database.connection.query(
          'SELECT row_to_json(w) value FROM workspaces w WHERE id=$1',
          [workspace],
        )
      ).rows[0],
    ).toEqual(before);
    expect(
      (
        await database.connection.query('SELECT id FROM users WHERE id=$1', [
          outsider,
        ])
      ).rows,
    ).toEqual([{ id: outsider }]);
    expect(
      (
        await database.connection.query(
          'SELECT id FROM memberships WHERE id=$1',
          [member],
        )
      ).rows,
    ).toEqual([{ id: member }]);

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUTH_MAIL_SENDER)
      .useValue({ send: () => Promise.resolve() })
      .compile();
    (await module.resolve(PinoLogger)).logger.level = 'silent';
    app = await configureApplication(
      module.createNestApplication<NestFastifyApplication>(
        createFastifyAdapter(),
        { bufferLogs: true },
      ),
    );
    app.useLogger(false);
    PinoLogger.root.level = 'silent';
    const checks = await verifyDemo(app, reset);
    expect(checks.length).toBeGreaterThan(100);
    expect(checks.every((check) => check.status === 200)).toBe(true);
  }, 120_000);
});
