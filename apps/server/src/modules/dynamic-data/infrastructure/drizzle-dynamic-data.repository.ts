import { Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
} from 'drizzle-orm';
import { ulid } from 'ulid';
import { DatabaseService } from '../../../database/database.service';
import {
  dynamicDatabases,
  dynamicFields,
  dynamicRecords,
} from '../../../database/schema/dynamic-data.schema';
import {
  memberships,
  workspaces,
} from '../../../database/schema/workspace.schema';
import {
  appendEventInTransaction,
  type EventStoreTransaction,
} from '../../eventing/infrastructure/transactional-event-appender';
import type {
  DynamicDataRepository,
  RecordListInput,
  RecordPage,
  ResourceAccess,
} from '../application/ports/dynamic-data-repository.port';
import type {
  DynamicDatabase,
  DynamicRecord,
  FieldDefinition,
} from '../domain/dynamic-data';

const first = <T>(items: T[]): T | null => items[0] ?? null;

const recordEventPayload = (
  record: DynamicRecord,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  databaseId: record.databaseId,
  recordId: record.id,
  values: record.values,
  createdBy: record.createdBy,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
  ...(record.deletedAt === null
    ? {}
    : { deletedAt: record.deletedAt.toISOString() }),
  ...extra,
});

const appendRecordEvent = async (
  tx: EventStoreTransaction,
  eventType:
    | 'database.record.created'
    | 'database.record.updated'
    | 'database.record.deleted',
  record: DynamicRecord,
  extra?: Record<string, unknown>,
): Promise<void> => {
  await appendEventInTransaction(tx, {
    workspaceId: record.workspaceId,
    eventType,
    payload: recordEventPayload(record, extra),
  });
};

@Injectable()
export class DrizzleDynamicDataRepository implements DynamicDataRepository {
  constructor(private readonly database: DatabaseService) {}

  listDatabases(workspaceId: string): Promise<DynamicDatabase[]> {
    return this.database.db
      .select()
      .from(dynamicDatabases)
      .where(eq(dynamicDatabases.workspaceId, workspaceId))
      .orderBy(desc(dynamicDatabases.createdAt), desc(dynamicDatabases.id));
  }
  async findDatabaseAccess(
    id: string,
    userId: string,
  ): Promise<ResourceAccess<DynamicDatabase> | null> {
    return first(
      await this.database.db
        .select({ resource: dynamicDatabases, role: memberships.role })
        .from(dynamicDatabases)
        .innerJoin(workspaces, eq(workspaces.id, dynamicDatabases.workspaceId))
        .innerJoin(
          memberships,
          and(
            eq(memberships.workspaceId, dynamicDatabases.workspaceId),
            eq(memberships.userId, userId),
          ),
        )
        .where(and(eq(dynamicDatabases.id, id), isNull(workspaces.deletedAt)))
        .limit(1),
    );
  }
  async createDatabase(database: DynamicDatabase): Promise<DynamicDatabase> {
    const created = first(
      await this.database.db
        .insert(dynamicDatabases)
        .values(database)
        .returning(),
    );
    if (created === null) throw new Error('Database insert returned no row.');
    return created;
  }
  async updateDatabase(
    id: string,
    changes: Partial<Pick<DynamicDatabase, 'name' | 'icon' | 'description'>>,
    updatedAt: Date,
  ): Promise<DynamicDatabase | null> {
    return first(
      await this.database.db
        .update(dynamicDatabases)
        .set({ ...changes, updatedAt })
        .where(eq(dynamicDatabases.id, id))
        .returning(),
    );
  }
  async deleteDatabase(id: string): Promise<boolean> {
    return (
      (
        await this.database.db
          .delete(dynamicDatabases)
          .where(eq(dynamicDatabases.id, id))
          .returning({ id: dynamicDatabases.id })
      ).length > 0
    );
  }
  duplicateDatabase(
    source: DynamicDatabase,
    duplicate: DynamicDatabase,
  ): Promise<{ database: DynamicDatabase; fields: FieldDefinition[] }> {
    return this.database.db.transaction(async (tx) => {
      const database = first(
        await tx.insert(dynamicDatabases).values(duplicate).returning(),
      );
      if (database === null)
        throw new Error('Database duplicate insert returned no row.');
      const sourceFields = await tx
        .select()
        .from(dynamicFields)
        .where(
          and(
            eq(dynamicFields.databaseId, source.id),
            isNull(dynamicFields.deletedAt),
          ),
        )
        .orderBy(asc(dynamicFields.createdAt));
      const values = sourceFields.map((field) => ({
        ...field,
        id: `fld_${ulid()}`,
        databaseId: database.id,
        createdAt: duplicate.createdAt,
        updatedAt: duplicate.updatedAt,
      }));
      const fields =
        values.length === 0
          ? []
          : await tx.insert(dynamicFields).values(values).returning();
      return { database, fields };
    });
  }
  listFields(databaseId: string): Promise<FieldDefinition[]> {
    return this.database.db
      .select()
      .from(dynamicFields)
      .where(
        and(
          eq(dynamicFields.databaseId, databaseId),
          isNull(dynamicFields.deletedAt),
        ),
      )
      .orderBy(asc(dynamicFields.createdAt), asc(dynamicFields.id));
  }
  async findFieldAccess(
    id: string,
    userId: string,
  ): Promise<
    (ResourceAccess<FieldDefinition> & { workspaceId: string }) | null
  > {
    return first(
      await this.database.db
        .select({
          resource: dynamicFields,
          role: memberships.role,
          workspaceId: dynamicDatabases.workspaceId,
        })
        .from(dynamicFields)
        .innerJoin(
          dynamicDatabases,
          eq(dynamicDatabases.id, dynamicFields.databaseId),
        )
        .innerJoin(workspaces, eq(workspaces.id, dynamicDatabases.workspaceId))
        .innerJoin(
          memberships,
          and(
            eq(memberships.workspaceId, dynamicDatabases.workspaceId),
            eq(memberships.userId, userId),
          ),
        )
        .where(
          and(
            eq(dynamicFields.id, id),
            isNull(dynamicFields.deletedAt),
            isNull(workspaces.deletedAt),
          ),
        )
        .limit(1),
    );
  }
  async createField(field: FieldDefinition): Promise<FieldDefinition> {
    const created = first(
      await this.database.db.insert(dynamicFields).values(field).returning(),
    );
    if (created === null) throw new Error('Field insert returned no row.');
    return created;
  }
  async updateField(
    id: string,
    changes: Partial<Pick<FieldDefinition, 'name' | 'isRequired' | 'config'>>,
    updatedAt: Date,
  ): Promise<FieldDefinition | null> {
    return first(
      await this.database.db
        .update(dynamicFields)
        .set({ ...changes, updatedAt })
        .where(and(eq(dynamicFields.id, id), isNull(dynamicFields.deletedAt)))
        .returning(),
    );
  }
  async deleteField(id: string, deletedAt: Date): Promise<boolean> {
    return (
      (
        await this.database.db
          .update(dynamicFields)
          .set({ deletedAt, updatedAt: deletedAt })
          .where(and(eq(dynamicFields.id, id), isNull(dynamicFields.deletedAt)))
          .returning({ id: dynamicFields.id })
      ).length > 0
    );
  }
  async listRecords(input: RecordListInput): Promise<RecordPage> {
    const active = input.includeDeleted
      ? isNotNull(dynamicRecords.deletedAt)
      : isNull(dynamicRecords.deletedAt);
    const cursor =
      input.cursor === null
        ? undefined
        : or(
            lt(dynamicRecords.createdAt, input.cursor.createdAt),
            and(
              eq(dynamicRecords.createdAt, input.cursor.createdAt),
              lt(dynamicRecords.id, input.cursor.id),
            ),
          );
    const filter = and(eq(dynamicRecords.databaseId, input.databaseId), active);
    const [rows, totals] = await Promise.all([
      this.database.db
        .select()
        .from(dynamicRecords)
        .where(and(filter, cursor))
        .orderBy(desc(dynamicRecords.createdAt), desc(dynamicRecords.id))
        .limit(input.limit + 1),
      this.database.db
        .select({ value: count() })
        .from(dynamicRecords)
        .where(filter),
    ]);
    return {
      items: rows.slice(0, input.limit),
      hasNext: rows.length > input.limit,
      total: totals[0]?.value ?? 0,
    };
  }
  listAllRecords(databaseId: string): Promise<DynamicRecord[]> {
    return this.database.db
      .select()
      .from(dynamicRecords)
      .where(
        and(
          eq(dynamicRecords.databaseId, databaseId),
          isNull(dynamicRecords.deletedAt),
        ),
      )
      .orderBy(desc(dynamicRecords.createdAt), desc(dynamicRecords.id));
  }
  async activeRecordsExist(
    databaseId: string,
    ids: string[],
  ): Promise<boolean> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return true;
    const rows = await this.database.db
      .select({ id: dynamicRecords.id })
      .from(dynamicRecords)
      .where(
        and(
          eq(dynamicRecords.databaseId, databaseId),
          inArray(dynamicRecords.id, uniqueIds),
          isNull(dynamicRecords.deletedAt),
        ),
      );
    return rows.length === uniqueIds.length;
  }
  async workspaceUsersExist(
    workspaceId: string,
    userIds: string[],
  ): Promise<boolean> {
    const uniqueIds = [...new Set(userIds)];
    if (uniqueIds.length === 0) return true;
    const rows = await this.database.db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(
        and(
          eq(memberships.workspaceId, workspaceId),
          inArray(memberships.userId, uniqueIds),
        ),
      );
    return rows.length === uniqueIds.length;
  }
  async findRecordAccess(
    id: string,
    userId: string,
    includeDeleted = false,
  ): Promise<ResourceAccess<DynamicRecord> | null> {
    return first(
      await this.database.db
        .select({ resource: dynamicRecords, role: memberships.role })
        .from(dynamicRecords)
        .innerJoin(
          dynamicDatabases,
          and(
            eq(dynamicDatabases.id, dynamicRecords.databaseId),
            eq(dynamicDatabases.workspaceId, dynamicRecords.workspaceId),
          ),
        )
        .innerJoin(workspaces, eq(workspaces.id, dynamicRecords.workspaceId))
        .innerJoin(
          memberships,
          and(
            eq(memberships.workspaceId, dynamicRecords.workspaceId),
            eq(memberships.userId, userId),
          ),
        )
        .where(
          and(
            eq(dynamicRecords.id, id),
            includeDeleted ? undefined : isNull(dynamicRecords.deletedAt),
            isNull(workspaces.deletedAt),
          ),
        )
        .limit(1),
    );
  }
  createRecords(records: DynamicRecord[]): Promise<DynamicRecord[]> {
    return this.database.db.transaction(async (tx) => {
      if (records.length === 0) {
        return [];
      }
      const created = await tx
        .insert(dynamicRecords)
        .values(records)
        .returning();
      for (const record of created) {
        await appendRecordEvent(tx, 'database.record.created', record);
      }
      return created;
    });
  }
  async updateRecord(
    id: string,
    values: Record<string, unknown>,
    updatedAt: Date,
  ): Promise<DynamicRecord | null> {
    return this.database.db.transaction(async (tx) => {
      const updated = first(
        await tx
          .update(dynamicRecords)
          .set({ values, updatedAt })
          .where(
            and(eq(dynamicRecords.id, id), isNull(dynamicRecords.deletedAt)),
          )
          .returning(),
      );
      if (updated === null) {
        return null;
      }
      await appendRecordEvent(tx, 'database.record.updated', updated);
      return updated;
    });
  }
  updateRecords(
    changes: { id: string; values: Record<string, unknown> }[],
    updatedAt: Date,
  ): Promise<DynamicRecord[] | null> {
    return this.database.db.transaction(async (tx) => {
      const ids = changes.map(({ id }) => id);
      const existing = await tx
        .select()
        .from(dynamicRecords)
        .where(
          and(
            inArray(dynamicRecords.id, ids),
            isNull(dynamicRecords.deletedAt),
          ),
        )
        .for('update');
      if (existing.length !== ids.length) return null;
      const byId = new Map(existing.map((record) => [record.id, record]));
      const results: DynamicRecord[] = [];
      for (const change of changes) {
        const current = byId.get(change.id);
        if (current === undefined) return null;
        const updated = first(
          await tx
            .update(dynamicRecords)
            .set({ values: { ...current.values, ...change.values }, updatedAt })
            .where(eq(dynamicRecords.id, change.id))
            .returning(),
        );
        if (updated === null) return null;
        await appendRecordEvent(tx, 'database.record.updated', updated);
        results.push(updated);
      }
      return results;
    });
  }
  async softDeleteRecords(
    ids: string[],
    databaseId: string,
    deletedAt: Date,
  ): Promise<number> {
    if (ids.length === 0) return 0;
    return this.database.db.transaction(async (tx) => {
      const available = await tx
        .select({ id: dynamicRecords.id })
        .from(dynamicRecords)
        .where(
          and(
            inArray(dynamicRecords.id, ids),
            eq(dynamicRecords.databaseId, databaseId),
            isNull(dynamicRecords.deletedAt),
          ),
        )
        .for('update');
      if (available.length !== ids.length) return 0;
      const deleted = await tx
        .update(dynamicRecords)
        .set({ deletedAt, updatedAt: deletedAt })
        .where(
          and(
            inArray(dynamicRecords.id, ids),
            eq(dynamicRecords.databaseId, databaseId),
            isNull(dynamicRecords.deletedAt),
          ),
        )
        .returning();
      for (const record of deleted) {
        await appendRecordEvent(tx, 'database.record.deleted', record);
      }
      return deleted.length;
    });
  }
  async restoreRecord(
    id: string,
    restoredAt: Date,
  ): Promise<DynamicRecord | null> {
    return this.database.db.transaction(async (tx) => {
      const restored = first(
        await tx
          .update(dynamicRecords)
          .set({ deletedAt: null, updatedAt: restoredAt })
          .where(
            and(eq(dynamicRecords.id, id), isNotNull(dynamicRecords.deletedAt)),
          )
          .returning(),
      );
      if (restored === null) {
        return null;
      }
      await appendRecordEvent(tx, 'database.record.updated', restored, {
        restored: true,
      });
      return restored;
    });
  }
}
