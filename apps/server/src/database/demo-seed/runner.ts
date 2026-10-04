import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, sql } from 'drizzle-orm';
import * as schema from '../schema';
import { createDemoContext } from './context';
import { seedIdentity, DEMO_MARKER, DEMO_SLUG } from './identity';
import { seedTeams } from './teams';
import { seedProjects } from './projects';
import { seedCycles } from './cycles';
import { seedIssues } from './issues';
import { seedInitiatives } from './initiatives';
import { seedDocuments } from './documents';
import { seedCollaboration } from './collaboration';
import { seedHistory } from './history';
import { seedNotifications } from './notifications';
import { seedViews } from './views';
import { seedFiles } from './files';
import { seedCompanies } from './companies';
import { seedContacts } from './contacts';
import { seedDeals } from './deals';
import { seedTasks } from './tasks';
import { seedDynamicData } from './dynamic-data';
import { countDemoRecords, resetDemoDomain } from './reset';

export interface DemoSeedOptions {
  databaseUrl?: string;
  now?: Date;
  reset?: boolean;
}
export interface DemoSeedResult {
  workspaceId: string;
  namespace: string;
  counts: Record<string, number>;
  teamId: string;
  projectId: string;
  issueId: string;
  cycleId: string;
  initiativeId: string;
  documentId: string;
  viewId: string;
  notificationId: string;
  fileId: string;
  attachmentId: string;
}
export function assertDemoSeedAllowed(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV === 'production' && env.ALLOW_DEMO_SEED !== 'true')
    throw new Error(
      'Demo seed refused in production. Set ALLOW_DEMO_SEED=true explicitly to allow it.',
    );
}
export async function seedDemo(
  options: DemoSeedOptions = {},
): Promise<DemoSeedResult> {
  assertDemoSeedAllowed();
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl)
    throw new Error(
      'DATABASE_URL is required. Apply migrations before running seed:demo.',
    );
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
    statement_timeout: 60000,
  });
  const db = drizzle({ client: pool, schema });
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${DEMO_MARKER}))`,
      );
      const [existing] = await tx
        .select()
        .from(schema.workspaces)
        .where(eq(schema.workspaces.slug, DEMO_SLUG))
        .for('update');
      const marker = existing?.settings.demoSeed as
        { marker?: string; namespace?: string } | undefined;
      if (existing && (marker?.marker !== DEMO_MARKER || !marker.namespace))
        throw new Error(
          'The reserved demo workspace slug belongs to non-demo data. Nothing was changed.',
        );
      if (existing?.purgedAt)
        throw new Error(
          'The demo workspace was permanently purged. Refusing to undo retention state.',
        );
      const namespace = marker?.namespace ?? randomUUID();
      const workspaceId = existing?.id ?? randomUUID();
      const now = options.now ?? new Date();
      if (!Number.isFinite(now.getTime()))
        throw new Error('Invalid demo reference date.');
      const ctx = createDemoContext(tx, namespace, workspaceId, now);
      // A reserved demo account must never be silently adopted or modified.
      for (let i = 0; i < 6; i++) {
        const memberships = await tx
          .select()
          .from(schema.memberships)
          .where(eq(schema.memberships.userId, ctx.user(i)));
        if (
          memberships.some(
            (membership) => membership.workspaceId !== workspaceId,
          )
        )
          throw new Error(
            'A demo account belongs to another workspace. Refusing to modify non-demo identity data.',
          );
      }
      if (existing) {
        await tx
          .update(schema.workspaces)
          .set({ archivedAt: null, deletedAt: null, updatedAt: now })
          .where(eq(schema.workspaces.id, workspaceId));
        await resetDemoDomain(ctx);
      }
      await seedIdentity(ctx);
      console.log('Seeding teams, projects, cycles and issues…');
      await seedTeams(ctx);
      await seedProjects(ctx);
      await seedCycles(ctx);
      await seedIssues(ctx);
      console.log('Seeding planning, collaboration and saved views…');
      await seedInitiatives(ctx);
      await seedDocuments(ctx);
      await seedCollaboration(ctx);
      await seedViews(ctx);
      console.log('Seeding history, notifications, files and supporting data…');
      await seedHistory(ctx);
      await seedNotifications(ctx);
      await seedFiles(ctx);
      await seedCompanies(ctx);
      await seedContacts(ctx);
      await seedDeals(ctx);
      await seedTasks(ctx);
      await seedDynamicData(ctx);
      const counts = await countDemoRecords(ctx);
      return {
        workspaceId,
        namespace,
        counts,
        teamId: ctx.team(0),
        projectId: ctx.project(0),
        issueId: ctx.issue(0),
        cycleId: ctx.cycle(0, 1),
        initiativeId: ctx.id('initiative:0'),
        documentId: ctx.id('document:0'),
        viewId: ctx.id('view:0'),
        notificationId: ctx.id('notification:0'),
        fileId: ctx.id('file:0'),
        attachmentId: ctx.id('attachment:0'),
      };
    });
  } finally {
    await pool.end();
  }
}
