import type { CursorTuple } from '../../../../common/pagination/cursor';
import type {
  DynamicDatabase,
  DynamicDataRole,
  DynamicRecord,
  FieldDefinition,
} from '../../domain/dynamic-data';

export const DYNAMIC_DATA_REPOSITORY = Symbol('DYNAMIC_DATA_REPOSITORY');
export interface ResourceAccess<T> {
  resource: T;
  role: DynamicDataRole;
}
export interface RecordPage {
  items: DynamicRecord[];
  hasNext: boolean;
  total: number;
}
export interface RecordListInput {
  databaseId: string;
  cursor: CursorTuple | null;
  limit: number;
  includeDeleted?: boolean;
}

export interface DynamicDataRepository {
  listDatabases(workspaceId: string): Promise<DynamicDatabase[]>;
  findDatabaseAccess(
    id: string,
    userId: string,
  ): Promise<ResourceAccess<DynamicDatabase> | null>;
  createDatabase(database: DynamicDatabase): Promise<DynamicDatabase>;
  updateDatabase(
    id: string,
    changes: Partial<Pick<DynamicDatabase, 'name' | 'icon' | 'description'>>,
    updatedAt: Date,
  ): Promise<DynamicDatabase | null>;
  deleteDatabase(id: string): Promise<boolean>;
  duplicateDatabase(
    source: DynamicDatabase,
    duplicate: DynamicDatabase,
  ): Promise<{ database: DynamicDatabase; fields: FieldDefinition[] }>;
  listFields(databaseId: string): Promise<FieldDefinition[]>;
  findFieldAccess(
    id: string,
    userId: string,
  ): Promise<
    (ResourceAccess<FieldDefinition> & { workspaceId: string }) | null
  >;
  createField(field: FieldDefinition): Promise<FieldDefinition>;
  updateField(
    id: string,
    changes: Partial<Pick<FieldDefinition, 'name' | 'isRequired' | 'config'>>,
    updatedAt: Date,
  ): Promise<FieldDefinition | null>;
  deleteField(id: string, deletedAt: Date): Promise<boolean>;
  listRecords(input: RecordListInput): Promise<RecordPage>;
  listAllRecords(databaseId: string): Promise<DynamicRecord[]>;
  activeRecordsExist(databaseId: string, ids: string[]): Promise<boolean>;
  workspaceUsersExist(workspaceId: string, userIds: string[]): Promise<boolean>;
  findRecordAccess(
    id: string,
    userId: string,
    includeDeleted?: boolean,
  ): Promise<ResourceAccess<DynamicRecord> | null>;
  createRecords(records: DynamicRecord[]): Promise<DynamicRecord[]>;
  updateRecord(
    id: string,
    values: Record<string, unknown>,
    updatedAt: Date,
  ): Promise<DynamicRecord | null>;
  updateRecords(
    changes: { id: string; values: Record<string, unknown> }[],
    updatedAt: Date,
  ): Promise<DynamicRecord[] | null>;
  softDeleteRecords(
    ids: string[],
    databaseId: string,
    deletedAt: Date,
  ): Promise<number>;
  restoreRecord(id: string, restoredAt: Date): Promise<DynamicRecord | null>;
}
