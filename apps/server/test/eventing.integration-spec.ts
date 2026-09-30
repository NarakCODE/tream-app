import { randomUUID } from 'node:crypto';
import { and, eq, or, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/database/schema';
import { auditLogs } from '../src/database/schema/audit.schema';
import {
  events,
  eventAggregateHeads,
  eventDispatchAttempts,
  eventConsumerReceipts,
} from '../src/database/schema/event.schema';
import { users } from '../src/database/schema/auth.schema';
import {
  workspaces,
  memberships,
} from '../src/database/schema/workspace.schema';
import type { DatabaseService } from '../src/database/database.service';
import type { EventConsumer } from '../src/modules/eventing/application/event-consumer-registry';
import { EventConsumerRegistry } from '../src/modules/eventing/application/event-consumer-registry';
import { EventWriter } from '../src/modules/eventing/application/event-writer.service';
import { OutboxWorker } from '../src/modules/eventing/application/outbox-worker.service';
import { OutboxMonitor } from '../src/modules/eventing/application/outbox-monitor.service';
import { OutboxHost } from '../src/modules/eventing/application/outbox-host.service';
import { EventContractRegistry } from '../src/modules/eventing/infrastructure/event-contract-registry';
import { prepareIntegrationDatabase } from './helpers/integration-environment';

let integration: Awaited<ReturnType<typeof prepareIntegrationDatabase>>;
let db: DatabaseService['db'];
let database: DatabaseService;
const contracts = new EventContractRegistry();
let registry: EventConsumerRegistry;
let consumerKey: string;
const effect: EventConsumer = async (tx, event) => {
  await tx.insert(auditLogs).values({
    id: event.id,
    workspaceId: event.workspaceId,
    action: 'test.effect',
    targetType: 'event',
    targetId: event.id,
  });
};
let writer: EventWriter;
let worker: OutboxWorker;
let workspaceId: string;
let membershipId: string;
let userId: string;
async function publish() {
  return db.transaction((tx) =>
    writer.append(tx, {
      workspaceId,
      eventType: 'workspace.created',
      actorId: membershipId,
      aggregateType: 'workspace',
      aggregateId: workspaceId,
      payload: { workspace_id: workspaceId, owner_membership_id: membershipId },
    }),
  );
}
async function state(eventId: string) {
  const [row] = await db
    .select()
    .from(eventDispatchAttempts)
    .where(
      and(
        eq(eventDispatchAttempts.eventId, eventId),
        eq(eventDispatchAttempts.consumerKey, consumerKey),
      ),
    );
  return row;
}
async function counts(eventId: string) {
  const receipts = await db
    .select()
    .from(eventConsumerReceipts)
    .where(eq(eventConsumerReceipts.eventId, eventId));
  const effects = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.id, eventId));
  return { receipts: receipts.length, effects: effects.length };
}

describe('PostgreSQL transactional outbox', () => {
  beforeAll(async () => {
    integration = await prepareIntegrationDatabase();
    db = drizzle({ client: integration.connection, schema });
    database = { db } as unknown as DatabaseService;
    worker = new OutboxWorker(database, contracts);
  });
  beforeEach(async () => {
    registry = new EventConsumerRegistry();
    consumerKey = `integration-${randomUUID()}`;
    registry.register(consumerKey, effect);
    writer = new EventWriter(contracts, registry);
    workspaceId = randomUUID();
    membershipId = randomUUID();
    userId = randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `${userId}@event-test.example`,
      fullName: 'Event test',
      emailVerifiedAt: new Date(),
    });
    await db.transaction(async (tx) => {
      await tx.insert(workspaces).values({
        id: workspaceId,
        name: 'Event test',
        slug: `event-${workspaceId}`,
      });
      await tx
        .insert(memberships)
        .values({ id: membershipId, workspaceId, userId, role: 'OWNER' });
    });
  });
  afterAll(async () => {
    await integration?.cleanup();
  });
  it('rolls back facts, revision and jobs together on command failure', async () => {
    await expect(
      db.transaction(async (tx) => {
        await writer.append(tx, {
          workspaceId,
          eventType: 'workspace.created',
          actorId: membershipId,
          aggregateType: 'workspace',
          aggregateId: workspaceId,
          payload: {
            workspace_id: workspaceId,
            owner_membership_id: membershipId,
          },
        });
        throw new Error('injected before commit');
      }),
    ).rejects.toThrow('injected before commit');
    expect(
      await db.select().from(events).where(eq(events.workspaceId, workspaceId)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(eventAggregateHeads)
        .where(eq(eventAggregateHeads.workspaceId, workspaceId)),
    ).toHaveLength(0);
  });
  it('commits several facts under one revision with durable jobs', async () => {
    await db.transaction(async (tx) => {
      await writer.append(tx, {
        workspaceId,
        eventType: 'workspace.created',
        actorId: membershipId,
        aggregateType: 'workspace',
        aggregateId: workspaceId,
        payload: {
          workspace_id: workspaceId,
          owner_membership_id: membershipId,
        },
      });
      await writer.append(tx, {
        workspaceId,
        eventType: 'workspace.updated',
        actorId: membershipId,
        aggregateType: 'workspace',
        aggregateId: workspaceId,
        payload: { workspace_id: workspaceId },
      });
    });
    const facts = await db
      .select()
      .from(events)
      .where(eq(events.workspaceId, workspaceId));
    const heads = await db
      .select()
      .from(eventAggregateHeads)
      .where(eq(eventAggregateHeads.workspaceId, workspaceId));
    expect(facts).toHaveLength(2);
    expect(facts.map((e) => e.aggregateVersion)).toEqual([1, 1]);
    expect(heads[0]?.revision).toBe(1);
    for (const fact of facts)
      expect(await state(fact.id)).toEqual(
        expect.objectContaining({ status: 'PENDING', consumerKey }),
      );
  });
  it('two workers deliver one database effect and receipt', async () => {
    const event = await publish();
    const [a, b] = await Promise.all([
      worker.claim('a', consumerKey),
      worker.claim('b', consumerKey),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    await Promise.all(
      [a, b]
        .filter(
          (lease): lease is NonNullable<typeof lease> => lease !== undefined,
        )
        .map((lease) => worker.process(lease, effect)),
    );
    expect(await counts(event.id)).toEqual({ receipts: 1, effects: 1 });
    expect((await state(event.id))?.status).toBe('SUCCEEDED');
  });
  it('rolls back consumer effects and receipts, then retries successfully', async () => {
    const event = await publish();
    const lease = await worker.claim('failure', consumerKey);
    expect(lease?.eventId).toBe(event.id);
    if (!lease) throw new Error('Missing lease');
    await worker.process(lease, async (tx, fact) => {
      await effect(tx, fact);
      throw new Error('injected after effect');
    });
    expect(await counts(event.id)).toEqual({ receipts: 0, effects: 0 });
    expect((await state(event.id))?.status).toBe('FAILED');
    await db
      .update(eventDispatchAttempts)
      .set({ availableAt: new Date(0) })
      .where(eq(eventDispatchAttempts.id, lease.id));
    const retry = await worker.claim('retry', consumerKey);
    if (!retry) throw new Error('Missing retry');
    await worker.process(retry, effect);
    expect(await counts(event.id)).toEqual({ receipts: 1, effects: 1 });
  });
  it('reclaims expired leases and rejects effects from the stale owner', async () => {
    const event = await publish();
    const stale = await worker.claim('stale', consumerKey);
    if (!stale) throw new Error('Missing lease');
    await db
      .update(eventDispatchAttempts)
      .set({ lockedAt: new Date(0) })
      .where(eq(eventDispatchAttempts.id, stale.id));
    const current = await worker.claim('replacement', consumerKey);
    if (!current) throw new Error('Missing replacement');
    await worker.process(stale, effect);
    expect(await counts(event.id)).toEqual({ receipts: 0, effects: 0 });
    await worker.process(current, effect);
    expect(await counts(event.id)).toEqual({ receipts: 1, effects: 1 });
    expect(current.attemptCount).toBe(2);
  });
  it('quarantines unsupported contracts without running the consumer', async () => {
    const eventId = randomUUID();
    await db.insert(events).values({
      id: eventId,
      workspaceId,
      eventType: 'workspace.created',
      schemaVersion: 999,
      aggregateType: 'workspace',
      aggregateId: workspaceId,
      aggregateVersion: 1,
      occurredAt: new Date(),
      payload: {},
    });
    await db
      .insert(eventDispatchAttempts)
      .values({ id: randomUUID(), eventId, consumerKey });
    const lease = await worker.claim('invalid', consumerKey);
    if (!lease) throw new Error('Missing lease');
    const consume = jest.fn(effect);
    await worker.process(lease, consume);
    expect(consume).not.toHaveBeenCalled();
    expect((await state(eventId))?.status).toBe('QUARANTINED');
    expect(await counts(eventId)).toEqual({ receipts: 0, effects: 0 });
  });
  it('quarantines after bounded failures without committing effects', async () => {
    const event = await publish();
    for (let attempt = 1; attempt <= 5; attempt++) {
      const lease = await worker.claim(`failure-${attempt}`, consumerKey);
      if (!lease) throw new Error('Missing retry lease');
      await worker.process(lease, () => Promise.reject(new Error('injected')));
      if (attempt < 5)
        await db
          .update(eventDispatchAttempts)
          .set({ availableAt: new Date(0) })
          .where(eq(eventDispatchAttempts.id, lease.id));
    }
    const job = await state(event.id);
    expect(job?.status).toBe('QUARANTINED');
    expect(job?.attemptCount).toBe(5);
    expect(await worker.claim('sixth', consumerKey)).toBeUndefined();
    expect(await counts(event.id)).toEqual({ receipts: 0, effects: 0 });
  });
  it('paginates sub-millisecond timestamps without repeating or skipping jobs', async () => {
    const first = await publish();
    const second = await publish();
    await db
      .update(eventDispatchAttempts)
      .set({
        status: 'QUARANTINED',
        createdAt: sql`'2026-09-30T00:00:00.123456Z'::timestamptz`,
      })
      .where(
        or(
          eq(eventDispatchAttempts.eventId, first.id),
          eq(eventDispatchAttempts.eventId, second.id),
        ),
      );
    const monitor = new OutboxMonitor(database);
    const page1 = await monitor.list(userId, workspaceId, { limit: 1 });
    expect(page1.items).toHaveLength(1);
    expect(page1.total).toBe(2);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await monitor.list(userId, workspaceId, {
      limit: 1,
      cursor: page1.nextCursor!,
    });
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0]?.id).not.toBe(page1.items[0]?.id);
    expect(page2.nextCursor).toBeNull();
  });
  it('explicit host dispatch runs registered effects while automatic workers are disabled', async () => {
    const event = await publish();
    const host = new OutboxHost(
      { getOrThrow: () => false } as never,
      worker,
      registry,
    );
    host.onApplicationBootstrap();
    await host.dispatchReady();
    await host.onModuleDestroy();
    expect(await counts(event.id)).toEqual({ receipts: 1, effects: 1 });
  });
});
