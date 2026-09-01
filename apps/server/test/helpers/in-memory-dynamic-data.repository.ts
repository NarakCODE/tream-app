import type {
  DynamicDataRepository,
  RecordListInput,
  RecordPage,
  ResourceAccess,
} from '../../src/modules/dynamic-data/application/ports/dynamic-data-repository.port';
import type {
  DynamicDatabase,
  DynamicDataRole,
  DynamicRecord,
  FieldDefinition,
} from '../../src/modules/dynamic-data/domain/dynamic-data';
import type { InMemoryEventingRepository } from './in-memory-eventing.repository';
import type { InMemoryWorkspaceRepository } from './in-memory-workspace.repository';

const recordEventPayload = (
  record: DynamicRecord,
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
});

export class InMemoryDynamicDataRepository implements DynamicDataRepository {
  private readonly databases = new Map<string, DynamicDatabase>();
  private readonly fields = new Map<string, FieldDefinition>();
  private readonly records = new Map<string, DynamicRecord>();

  constructor(
    private readonly workspaces: InMemoryWorkspaceRepository,
    private readonly eventing: InMemoryEventingRepository,
  ) {}

  reset(): void {
    this.databases.clear();
    this.fields.clear();
    this.records.clear();
  }

  listDatabases(workspaceId: string): Promise<DynamicDatabase[]> {
    return Promise.resolve(
      [...this.databases.values()]
        .filter((database) => database.workspaceId === workspaceId)
        .sort(
          (left, right) =>
            right.createdAt.getTime() - left.createdAt.getTime() ||
            right.id.localeCompare(left.id),
        ),
    );
  }

  async findDatabaseAccess(
    id: string,
    userId: string,
  ): Promise<ResourceAccess<DynamicDatabase> | null> {
    const database = this.databases.get(id);
    if (database === undefined) {
      return null;
    }
    const membership = await this.roleFor(database.workspaceId, userId);
    return membership === null
      ? null
      : { resource: database, role: membership };
  }

  createDatabase(database: DynamicDatabase): Promise<DynamicDatabase> {
    this.databases.set(database.id, database);
    return Promise.resolve(database);
  }

  updateDatabase(
    id: string,
    changes: Partial<Pick<DynamicDatabase, 'name' | 'icon' | 'description'>>,
    updatedAt: Date,
  ): Promise<DynamicDatabase | null> {
    const current = this.databases.get(id);
    if (current === undefined) {
      return Promise.resolve(null);
    }
    const updated = { ...current, ...changes, updatedAt };
    this.databases.set(id, updated);
    return Promise.resolve(updated);
  }

  deleteDatabase(id: string): Promise<boolean> {
    const deleted = this.databases.delete(id);
    for (const field of this.fields.values()) {
      if (field.databaseId === id) {
        this.fields.delete(field.id);
      }
    }
    for (const record of this.records.values()) {
      if (record.databaseId === id) {
        this.records.delete(record.id);
      }
    }
    return Promise.resolve(deleted);
  }

  duplicateDatabase(
    source: DynamicDatabase,
    duplicate: DynamicDatabase,
  ): Promise<{ database: DynamicDatabase; fields: FieldDefinition[] }> {
    this.databases.set(duplicate.id, duplicate);
    const fields = [...this.fields.values()]
      .filter(
        (field) => field.databaseId === source.id && field.deletedAt === null,
      )
      .map((field, index) => ({
        ...field,
        id: `${field.id}_${index}`,
        databaseId: duplicate.id,
        createdAt: duplicate.createdAt,
        updatedAt: duplicate.updatedAt,
      }));
    for (const field of fields) {
      this.fields.set(field.id, field);
    }
    return Promise.resolve({ database: duplicate, fields });
  }

  listFields(databaseId: string): Promise<FieldDefinition[]> {
    return Promise.resolve(
      [...this.fields.values()]
        .filter(
          (field) =>
            field.databaseId === databaseId && field.deletedAt === null,
        )
        .sort(
          (left, right) =>
            left.createdAt.getTime() - right.createdAt.getTime() ||
            left.id.localeCompare(right.id),
        ),
    );
  }

  async findFieldAccess(
    id: string,
    userId: string,
  ): Promise<
    (ResourceAccess<FieldDefinition> & { workspaceId: string }) | null
  > {
    const field = this.fields.get(id);
    if (field === undefined || field.deletedAt !== null) {
      return null;
    }
    const database = this.databases.get(field.databaseId);
    if (database === undefined) {
      return null;
    }
    const role = await this.roleFor(database.workspaceId, userId);
    return role === null
      ? null
      : { resource: field, role, workspaceId: database.workspaceId };
  }

  createField(field: FieldDefinition): Promise<FieldDefinition> {
    const duplicate = [...this.fields.values()].some(
      (candidate) =>
        candidate.databaseId === field.databaseId &&
        candidate.key === field.key &&
        candidate.deletedAt === null,
    );
    if (duplicate) {
      return Promise.reject(
        Object.assign(new Error('duplicate field key'), { code: '23505' }),
      );
    }
    this.fields.set(field.id, field);
    return Promise.resolve(field);
  }

  updateField(
    id: string,
    changes: Partial<Pick<FieldDefinition, 'name' | 'isRequired' | 'config'>>,
    updatedAt: Date,
  ): Promise<FieldDefinition | null> {
    const current = this.fields.get(id);
    if (current === undefined || current.deletedAt !== null) {
      return Promise.resolve(null);
    }
    const updated = { ...current, ...changes, updatedAt };
    this.fields.set(id, updated);
    return Promise.resolve(updated);
  }

  deleteField(id: string, deletedAt: Date): Promise<boolean> {
    const current = this.fields.get(id);
    if (current === undefined || current.deletedAt !== null) {
      return Promise.resolve(false);
    }
    this.fields.set(id, { ...current, deletedAt, updatedAt: deletedAt });
    return Promise.resolve(true);
  }

  listRecords(input: RecordListInput): Promise<RecordPage> {
    const rows = [...this.records.values()]
      .filter((record) => record.databaseId === input.databaseId)
      .filter((record) =>
        input.includeDeleted
          ? record.deletedAt !== null
          : record.deletedAt === null,
      )
      .sort(
        (left, right) =>
          right.createdAt.getTime() - left.createdAt.getTime() ||
          right.id.localeCompare(left.id),
      )
      .filter((record) =>
        input.cursor === null
          ? true
          : record.createdAt < input.cursor.createdAt ||
            (record.createdAt.getTime() === input.cursor.createdAt.getTime() &&
              record.id < input.cursor.id),
      );
    return Promise.resolve({
      items: rows.slice(0, input.limit),
      hasNext: rows.length > input.limit,
      total: rows.length,
    });
  }

  listAllRecords(databaseId: string): Promise<DynamicRecord[]> {
    return Promise.resolve(
      [...this.records.values()].filter(
        (record) =>
          record.databaseId === databaseId && record.deletedAt === null,
      ),
    );
  }

  activeRecordsExist(databaseId: string, ids: string[]): Promise<boolean> {
    const unique = [...new Set(ids)];
    return Promise.resolve(
      unique.every((id) => {
        const record = this.records.get(id);
        return record?.databaseId === databaseId && record.deletedAt === null;
      }),
    );
  }

  async workspaceUsersExist(
    workspaceId: string,
    userIds: string[],
  ): Promise<boolean> {
    const unique = [...new Set(userIds)];
    for (const userId of unique) {
      if ((await this.roleFor(workspaceId, userId)) === null) {
        return false;
      }
    }
    return true;
  }

  async findRecordAccess(
    id: string,
    userId: string,
    includeDeleted = false,
  ): Promise<ResourceAccess<DynamicRecord> | null> {
    const record = this.records.get(id);
    if (
      record === undefined ||
      (!includeDeleted && record.deletedAt !== null)
    ) {
      return null;
    }
    const role = await this.roleFor(record.workspaceId, userId);
    return role === null ? null : { resource: record, role };
  }

  async createRecords(records: DynamicRecord[]): Promise<DynamicRecord[]> {
    for (const record of records) {
      this.records.set(record.id, record);
      await this.eventing.appendDurableEvent({
        workspaceId: record.workspaceId,
        eventType: 'database.record.created',
        payload: recordEventPayload(record),
      });
    }
    return records;
  }

  async updateRecord(
    id: string,
    values: Record<string, unknown>,
    updatedAt: Date,
  ): Promise<DynamicRecord | null> {
    const current = this.records.get(id);
    if (current === undefined || current.deletedAt !== null) {
      return null;
    }
    const updated = { ...current, values, updatedAt };
    this.records.set(id, updated);
    await this.eventing.appendDurableEvent({
      workspaceId: updated.workspaceId,
      eventType: 'database.record.updated',
      payload: recordEventPayload(updated),
    });
    return updated;
  }

  async updateRecords(
    changes: { id: string; values: Record<string, unknown> }[],
    updatedAt: Date,
  ): Promise<DynamicRecord[] | null> {
    const existing = changes.map(({ id }) => this.records.get(id));
    if (
      existing.some(
        (record): record is undefined =>
          record === undefined || record.deletedAt !== null,
      )
    ) {
      return null;
    }
    const updated: DynamicRecord[] = [];
    for (const change of changes) {
      const current = this.records.get(change.id);
      if (current === undefined) {
        return null;
      }
      const next = {
        ...current,
        values: { ...current.values, ...change.values },
        updatedAt,
      };
      this.records.set(next.id, next);
      await this.eventing.appendDurableEvent({
        workspaceId: next.workspaceId,
        eventType: 'database.record.updated',
        payload: recordEventPayload(next),
      });
      updated.push(next);
    }
    return updated;
  }

  async softDeleteRecords(
    ids: string[],
    databaseId: string,
    deletedAt: Date,
  ): Promise<number> {
    const existing = ids.map((id) => this.records.get(id));
    if (
      existing.some(
        (record): record is undefined =>
          record === undefined ||
          record.databaseId !== databaseId ||
          record.deletedAt !== null,
      )
    ) {
      return 0;
    }
    for (const id of ids) {
      const current = this.records.get(id);
      if (current === undefined) {
        return 0;
      }
      const deleted = { ...current, deletedAt, updatedAt: deletedAt };
      this.records.set(id, deleted);
      await this.eventing.appendDurableEvent({
        workspaceId: deleted.workspaceId,
        eventType: 'database.record.deleted',
        payload: recordEventPayload(deleted),
      });
    }
    return ids.length;
  }

  async restoreRecord(
    id: string,
    restoredAt: Date,
  ): Promise<DynamicRecord | null> {
    const current = this.records.get(id);
    if (current === undefined || current.deletedAt === null) {
      return null;
    }
    const restored = { ...current, deletedAt: null, updatedAt: restoredAt };
    this.records.set(id, restored);
    await this.eventing.appendDurableEvent({
      workspaceId: restored.workspaceId,
      eventType: 'database.record.updated',
      payload: { ...recordEventPayload(restored), restored: true },
    });
    return restored;
  }

  private async roleFor(
    workspaceId: string,
    userId: string,
  ): Promise<DynamicDataRole | null> {
    const access = await this.workspaces.findActiveWorkspaceMembership(
      workspaceId,
      userId,
    );
    return access?.membership.role ?? null;
  }
}
