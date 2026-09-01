import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import { AppErrorCode } from '../../../common/enums/app-error-code.enum';
import { AppException } from '../../../common/exceptions/app.exception';
import { ResourceConflictException } from '../../../common/exceptions/resource-conflict.exception';
import { ResourceNotFoundException } from '../../../common/exceptions/resource-not-found.exception';
import { ValidationException } from '../../../common/exceptions/validation.exception';
import type { CursorPaginatedResult } from '../../../common/interfaces/api-response.interface';
import type {
  DynamicDatabase,
  DynamicRecord,
  FieldDefinition,
  FieldType,
} from '../domain/dynamic-data';
import { canWriteDynamicData } from '../domain/dynamic-data';
import { validateRecordValues } from '../domain/record-value-validator';
import {
  DYNAMIC_DATA_REPOSITORY,
  type DynamicDataRepository,
} from './ports/dynamic-data-repository.port';

export interface DatabaseMetadataInput {
  name?: string;
  icon?: string | null;
  description?: string | null;
}
export interface CreateFieldInput {
  name: string;
  key: string;
  type: FieldType;
  isRequired?: boolean;
  config?: Record<string, unknown>;
}
export interface UpdateFieldInput {
  name?: string;
  isRequired?: boolean;
  config?: Record<string, unknown>;
}
export interface ListRecordsInput {
  limit: number;
  cursor?: string;
  sortField?: string;
  sortDirection?: 'asc' | 'desc';
}
export type QueryOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'startsWith'
  | 'in'
  | 'isNull';
export type QueryFilter =
  | { field: string; operator: QueryOperator; value?: unknown }
  | { and: QueryFilter[] }
  | { or: QueryFilter[] }
  | { not: QueryFilter };
export interface QueryInput {
  filter?: QueryFilter;
  sort?: { field: string; direction: 'asc' | 'desc' }[];
  limit: number;
  cursor?: string;
}

@Injectable()
export class DynamicDataService {
  constructor(
    @Inject(DYNAMIC_DATA_REPOSITORY)
    private readonly repository: DynamicDataRepository,
  ) {}

  listDatabases(workspaceId: string): Promise<DynamicDatabase[]> {
    return this.repository.listDatabases(workspaceId);
  }
  async createDatabase(
    workspaceId: string,
    input: Required<Pick<DatabaseMetadataInput, 'name'>> &
      DatabaseMetadataInput,
  ): Promise<DynamicDatabase> {
    const now = new Date();
    return this.repository.createDatabase({
      id: `db_${ulid()}`,
      workspaceId,
      name: input.name,
      icon: input.icon ?? null,
      description: input.description ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }
  async getDatabase(
    databaseId: string,
    userId: string,
  ): Promise<{ database: DynamicDatabase; fields: FieldDefinition[] }> {
    const access = await this.requireDatabaseAccess(databaseId, userId, false);
    return {
      database: access.resource,
      fields: await this.repository.listFields(databaseId),
    };
  }
  async updateDatabase(
    databaseId: string,
    userId: string,
    input: DatabaseMetadataInput,
  ): Promise<DynamicDatabase> {
    await this.requireDatabaseAccess(databaseId, userId, true);
    const updated = await this.repository.updateDatabase(
      databaseId,
      input,
      new Date(),
    );
    if (updated === null)
      throw new ResourceNotFoundException('Database', databaseId);
    return updated;
  }
  async deleteDatabase(databaseId: string, userId: string): Promise<void> {
    await this.requireDatabaseAccess(databaseId, userId, true);
    if (!(await this.repository.deleteDatabase(databaseId)))
      throw new ResourceNotFoundException('Database', databaseId);
  }
  async duplicateDatabase(
    databaseId: string,
    userId: string,
    name?: string,
  ): Promise<{ database: DynamicDatabase; fields: FieldDefinition[] }> {
    const access = await this.requireDatabaseAccess(databaseId, userId, true);
    const now = new Date();
    return this.repository.duplicateDatabase(access.resource, {
      ...access.resource,
      id: `db_${ulid()}`,
      name: name ?? `${access.resource.name} copy`,
      createdAt: now,
      updatedAt: now,
    });
  }
  async listFields(
    databaseId: string,
    userId: string,
  ): Promise<FieldDefinition[]> {
    await this.requireDatabaseAccess(databaseId, userId, false);
    return this.repository.listFields(databaseId);
  }
  async createField(
    databaseId: string,
    userId: string,
    input: CreateFieldInput,
  ): Promise<FieldDefinition> {
    const databaseAccess = await this.requireDatabaseAccess(
      databaseId,
      userId,
      true,
    );
    this.validateFieldConfig(input.type, input.config ?? {});
    await this.assertRelationTarget(
      input.type,
      input.config ?? {},
      databaseAccess.resource.workspaceId,
      userId,
    );
    const now = new Date();
    try {
      return await this.repository.createField({
        id: `fld_${ulid()}`,
        databaseId,
        name: input.name,
        key: input.key,
        type: input.type,
        isRequired: input.isRequired ?? false,
        config: input.config ?? {},
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ResourceConflictException(
          `Field key '${input.key}' already exists in this database.`,
        );
      throw error;
    }
  }
  async getField(fieldId: string, userId: string): Promise<FieldDefinition> {
    return (await this.requireFieldAccess(fieldId, userId, false)).resource;
  }
  async updateField(
    fieldId: string,
    userId: string,
    input: UpdateFieldInput,
  ): Promise<FieldDefinition> {
    const access = await this.requireFieldAccess(fieldId, userId, true);
    if (input.config !== undefined)
      this.validateFieldConfig(access.resource.type, input.config);
    if (input.config !== undefined)
      await this.assertRelationTarget(
        access.resource.type,
        input.config,
        access.workspaceId,
        userId,
      );
    const updated = await this.repository.updateField(
      fieldId,
      input,
      new Date(),
    );
    if (updated === null)
      throw new ResourceNotFoundException('Database field', fieldId);
    return updated;
  }
  async deleteField(fieldId: string, userId: string): Promise<void> {
    await this.requireFieldAccess(fieldId, userId, true);
    if (!(await this.repository.deleteField(fieldId, new Date())))
      throw new ResourceNotFoundException('Database field', fieldId);
  }
  async listRecords(
    databaseId: string,
    userId: string,
    input: ListRecordsInput,
  ): Promise<CursorPaginatedResult<DynamicRecord>> {
    await this.requireDatabaseAccess(databaseId, userId, false);
    const records = await this.repository.listAllRecords(databaseId);
    return this.paginateAndSort(
      records,
      input.limit,
      input.cursor,
      input.sortField ?? 'createdAt',
      input.sortDirection ?? 'desc',
    );
  }
  async createRecord(
    databaseId: string,
    userId: string,
    values: Record<string, unknown>,
  ): Promise<DynamicRecord> {
    const access = await this.requireDatabaseAccess(databaseId, userId, true);
    const fields = await this.repository.listFields(databaseId);
    const normalized = this.normalizedValues(fields, values, false);
    await this.assertReferenceValues(fields, access.resource.workspaceId, [
      normalized,
    ]);
    const now = new Date();
    const created = await this.repository.createRecords([
      {
        id: `rec_${ulid()}`,
        databaseId,
        workspaceId: access.resource.workspaceId,
        values: normalized,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
    ]);
    const record = created[0];
    if (record === undefined) throw new Error('Record insert returned no row.');
    return record;
  }
  async getRecord(recordId: string, userId: string): Promise<DynamicRecord> {
    return (await this.requireRecordAccess(recordId, userId, false, false))
      .resource;
  }
  async updateRecord(
    recordId: string,
    userId: string,
    values: Record<string, unknown>,
  ): Promise<DynamicRecord> {
    const access = await this.requireRecordAccess(
      recordId,
      userId,
      true,
      false,
    );
    const fields = await this.repository.listFields(access.resource.databaseId);
    this.assertValues(fields, values, true);
    const merged = {
      ...access.resource.values,
      ...values,
    };
    this.assertValues(fields, this.valuesForValidation(fields, merged), false);
    await this.assertReferenceValues(fields, access.resource.workspaceId, [
      merged,
    ]);
    const updated = await this.repository.updateRecord(
      recordId,
      this.withSystemValues(
        fields,
        merged,
        access.resource.createdAt,
        new Date(),
      ),
      new Date(),
    );
    if (updated === null)
      throw new ResourceNotFoundException('Record', recordId);
    return updated;
  }
  async deleteRecord(recordId: string, userId: string): Promise<void> {
    const access = await this.requireRecordAccess(
      recordId,
      userId,
      true,
      false,
    );
    if (
      (await this.repository.softDeleteRecords(
        [recordId],
        access.resource.databaseId,
        new Date(),
      )) !== 1
    )
      throw new ResourceNotFoundException('Record', recordId);
  }
  async restoreRecord(
    recordId: string,
    userId: string,
  ): Promise<DynamicRecord> {
    const access = await this.requireRecordAccess(recordId, userId, true, true);
    if (access.resource.deletedAt === null) return access.resource;
    if (
      Date.now() - access.resource.deletedAt.getTime() >
      30 * 24 * 60 * 60 * 1000
    )
      throw new ResourceConflictException(
        'Records can only be restored within 30 days of deletion.',
      );
    const restored = await this.repository.restoreRecord(recordId, new Date());
    if (restored === null)
      throw new ResourceNotFoundException('Record', recordId);
    return restored;
  }
  async bulkCreate(
    databaseId: string,
    userId: string,
    valuesList: Record<string, unknown>[],
  ): Promise<DynamicRecord[]> {
    this.assertBulkSize(valuesList.length);
    const access = await this.requireDatabaseAccess(databaseId, userId, true);
    const fields = await this.repository.listFields(databaseId);
    const now = new Date();
    const records = valuesList.map((values) => ({
      id: `rec_${ulid()}`,
      databaseId,
      workspaceId: access.resource.workspaceId,
      values: this.normalizedValues(fields, values, false),
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }));
    await this.assertReferenceValues(
      fields,
      access.resource.workspaceId,
      records.map(({ values }) => values),
    );
    return this.repository.createRecords(records);
  }
  async bulkUpdate(
    databaseId: string,
    userId: string,
    changes: { id: string; values: Record<string, unknown> }[],
  ): Promise<DynamicRecord[]> {
    this.assertBulkSize(changes.length);
    await this.requireDatabaseAccess(databaseId, userId, true);
    if (new Set(changes.map(({ id }) => id)).size !== changes.length)
      this.fail('records', 'record ids must be unique');
    const all = await this.repository.listAllRecords(databaseId);
    const byId = new Map(all.map((record) => [record.id, record]));
    const fields = await this.repository.listFields(databaseId);
    const validated = changes.map((change) => {
      const current = byId.get(change.id);
      if (current === undefined)
        throw new ResourceNotFoundException('Record', change.id);
      this.assertValues(fields, change.values, true);
      const merged = {
        ...current.values,
        ...change.values,
      };
      this.assertValues(
        fields,
        this.valuesForValidation(fields, merged),
        false,
      );
      return {
        id: change.id,
        values: this.withSystemValues(
          fields,
          merged,
          current.createdAt,
          new Date(),
        ),
      };
    });
    const workspaceId = all[0]?.workspaceId;
    if (workspaceId !== undefined)
      await this.assertReferenceValues(
        fields,
        workspaceId,
        validated.map(({ values }) => values),
      );
    const updated = await this.repository.updateRecords(validated, new Date());
    if (updated === null)
      throw new ResourceConflictException(
        'Bulk update could not be applied atomically.',
      );
    return updated;
  }
  async bulkDelete(
    databaseId: string,
    userId: string,
    ids: string[],
  ): Promise<void> {
    this.assertBulkSize(ids.length);
    await this.requireDatabaseAccess(databaseId, userId, true);
    if (new Set(ids).size !== ids.length)
      this.fail('recordIds', 'record ids must be unique');
    if (
      (await this.repository.softDeleteRecords(ids, databaseId, new Date())) !==
      ids.length
    )
      throw new ResourceConflictException(
        'Bulk delete could not be applied atomically because one or more records were unavailable.',
      );
  }
  async query(
    databaseId: string,
    userId: string,
    input: QueryInput,
  ): Promise<CursorPaginatedResult<DynamicRecord>> {
    await this.requireDatabaseAccess(databaseId, userId, false);
    const fields = await this.repository.listFields(databaseId);
    const fieldTypes = new Map(fields.map(({ key, type }) => [key, type]));
    if (input.filter !== undefined)
      this.validateFilter(input.filter, fieldTypes);
    for (const sort of input.sort ?? []) {
      if (
        !fieldTypes.has(sort.field) &&
        !['id', 'createdAt', 'updatedAt'].includes(sort.field)
      )
        this.fail('sort', `unknown sort field '${sort.field}'`);
    }
    let records = await this.repository.listAllRecords(databaseId);
    if (input.filter !== undefined)
      records = records.filter((record) =>
        this.matches(record, input.filter as QueryFilter),
      );
    return this.paginateSorted(
      records,
      input.limit,
      input.cursor,
      input.sort?.length
        ? input.sort
        : [{ field: 'createdAt', direction: 'desc' }],
    );
  }

  private async requireDatabaseAccess(
    id: string,
    userId: string,
    write: boolean,
  ) {
    const access = await this.repository.findDatabaseAccess(id, userId);
    if (access === null || (write && !canWriteDynamicData(access.role)))
      throw this.forbidden();
    return access;
  }
  private async requireFieldAccess(id: string, userId: string, write: boolean) {
    const access = await this.repository.findFieldAccess(id, userId);
    if (access === null || (write && !canWriteDynamicData(access.role)))
      throw this.forbidden();
    return access;
  }
  private async requireRecordAccess(
    id: string,
    userId: string,
    write: boolean,
    deleted: boolean,
  ) {
    const access = await this.repository.findRecordAccess(id, userId, deleted);
    if (access === null || (write && !canWriteDynamicData(access.role)))
      throw this.forbidden();
    return access;
  }
  private forbidden() {
    return new AppException(
      AppErrorCode.Forbidden,
      'You do not have access to this dynamic data resource.',
      HttpStatus.FORBIDDEN,
    );
  }
  private fail(field: string, constraint: string): never {
    throw new ValidationException([{ field, constraints: [constraint] }]);
  }
  private assertBulkSize(size: number): void {
    if (size < 1 || size > 250)
      this.fail('records', 'must contain between 1 and 250 operations');
  }
  private assertValues(
    fields: FieldDefinition[],
    values: Record<string, unknown>,
    partial: boolean,
  ): void {
    const errors = validateRecordValues(fields, values, partial);
    if (errors.length > 0) throw new ValidationException(errors);
  }
  private normalizedValues(
    fields: FieldDefinition[],
    values: Record<string, unknown>,
    partial: boolean,
  ): Record<string, unknown> {
    this.assertValues(fields, values, partial);
    const now = new Date();
    return this.withSystemValues(fields, values, now, now);
  }
  private withSystemValues(
    fields: FieldDefinition[],
    values: Record<string, unknown>,
    createdAt: Date,
    updatedAt: Date,
  ): Record<string, unknown> {
    const result = { ...values };
    for (const field of fields) {
      if (field.type === 'CREATED_AT')
        result[field.key] = createdAt.toISOString();
      if (field.type === 'UPDATED_AT')
        result[field.key] = updatedAt.toISOString();
    }
    return result;
  }
  private valuesForValidation(
    fields: FieldDefinition[],
    values: Record<string, unknown>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const field of fields) {
      if (
        field.type !== 'CREATED_AT' &&
        field.type !== 'UPDATED_AT' &&
        field.key in values
      )
        result[field.key] = values[field.key];
    }
    return result;
  }
  private validateFieldConfig(
    type: FieldType,
    config: Record<string, unknown>,
  ): void {
    if (['SELECT', 'MULTI_SELECT', 'STATUS'].includes(type)) {
      const options = config.options;
      if (
        Object.keys(config).some((key) => key !== 'options') ||
        !Array.isArray(options) ||
        options.length < 1 ||
        options.length > 100 ||
        !options.every((v) => typeof v === 'string' && v.trim().length > 0) ||
        new Set(options).size !== options.length
      )
        this.fail('config', 'must contain 1 to 100 unique string options');
      return;
    }
    if (type === 'RELATION') {
      if (
        Object.keys(config).length !== 1 ||
        typeof config.databaseId !== 'string' ||
        !/^db_[0-9A-HJKMNP-TV-Z]{26}$/.test(config.databaseId)
      )
        this.fail('config', 'must contain a valid databaseId');
      return;
    }
    if (type === 'CURRENCY') {
      if (
        Object.keys(config).some((key) => key !== 'currency') ||
        (config.currency !== undefined &&
          (typeof config.currency !== 'string' ||
            !/^[A-Z]{3}$/.test(config.currency)))
      )
        this.fail('config', 'currency must be a three-letter uppercase code');
      return;
    }
    if (Object.keys(config).length > 0)
      this.fail('config', `is not supported for ${type} fields`);
  }
  private async assertRelationTarget(
    type: FieldType,
    config: Record<string, unknown>,
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    if (type !== 'RELATION' || typeof config.databaseId !== 'string') return;
    const target = await this.repository.findDatabaseAccess(
      config.databaseId,
      userId,
    );
    if (target === null || target.resource.workspaceId !== workspaceId)
      this.fail(
        'config.databaseId',
        'must reference a database in the same workspace',
      );
  }
  private async assertReferenceValues(
    fields: FieldDefinition[],
    workspaceId: string,
    records: Record<string, unknown>[],
  ): Promise<void> {
    const users: string[] = [];
    const relations = new Map<string, string[]>();
    for (const field of fields) {
      const values = records
        .map((record) => record[field.key])
        .filter((value): value is string => typeof value === 'string');
      if (field.type === 'USER') users.push(...values);
      if (
        field.type === 'RELATION' &&
        typeof field.config.databaseId === 'string'
      )
        relations.set(field.config.databaseId, [
          ...(relations.get(field.config.databaseId) ?? []),
          ...values,
        ]);
    }
    if (!(await this.repository.workspaceUsersExist(workspaceId, users)))
      this.fail('values', 'contains a user outside the workspace');
    for (const [databaseId, ids] of relations) {
      if (!(await this.repository.activeRecordsExist(databaseId, ids)))
        this.fail('values', 'contains an unavailable related record');
    }
  }
  private paginateAndSort(
    records: DynamicRecord[],
    limit: number,
    cursor: string | undefined,
    field: string,
    direction: 'asc' | 'desc',
  ): CursorPaginatedResult<DynamicRecord> {
    return this.paginateSorted(records, limit, cursor, [{ field, direction }]);
  }
  private paginateSorted(
    records: DynamicRecord[],
    limit: number,
    cursor: string | undefined,
    sorts: { field: string; direction: 'asc' | 'desc' }[],
  ): CursorPaginatedResult<DynamicRecord> {
    records.sort((a, b) => {
      for (const sort of sorts) {
        const av =
          sort.field in a
            ? a[sort.field as keyof DynamicRecord]
            : a.values[sort.field];
        const bv =
          sort.field in b
            ? b[sort.field as keyof DynamicRecord]
            : b.values[sort.field];
        const cmp = compareValues(av, bv);
        if (cmp !== 0) return sort.direction === 'asc' ? cmp : -cmp;
      }
      return a.id.localeCompare(b.id);
    });
    const start =
      cursor === undefined
        ? 0
        : records.findIndex(({ id }) => id === cursor) + 1;
    if (cursor !== undefined && start === 0)
      this.fail('cursor', 'must identify a record in the result set');
    const items = records.slice(start, start + limit);
    return {
      paginationType: 'cursor',
      items,
      cursor: cursor ?? null,
      nextCursor:
        start + limit < records.length ? (items.at(-1)?.id ?? null) : null,
      hasNext: start + limit < records.length,
      limit,
      total: records.length,
    };
  }
  private validateFilter(
    filter: QueryFilter,
    fields: Map<string, FieldType>,
    depth = 0,
    counter = { value: 0 },
  ): void {
    counter.value += 1;
    if (depth > 5 || counter.value > 50)
      this.fail('filter', 'exceeds the maximum depth or node count');
    if (typeof filter !== 'object' || filter === null || Array.isArray(filter))
      this.fail('filter', 'must be an object');
    const object = filter as unknown as Record<string, unknown>;
    const keys = Object.keys(object);
    if ('and' in object || 'or' in object) {
      const key = 'and' in object ? 'and' : 'or';
      if (
        keys.length !== 1 ||
        !Array.isArray(object[key]) ||
        object[key].length < 1 ||
        object[key].length > 20
      )
        this.fail('filter', 'contains an invalid logical group');
      for (const child of object[key] as QueryFilter[])
        this.validateFilter(child, fields, depth + 1, counter);
      return;
    }
    if ('not' in object) {
      if (
        keys.length !== 1 ||
        typeof object.not !== 'object' ||
        object.not === null
      )
        this.fail('filter', 'contains an invalid not expression');
      this.validateFilter(
        object.not as QueryFilter,
        fields,
        depth + 1,
        counter,
      );
      return;
    }
    if (
      keys.some((key) => !['field', 'operator', 'value'].includes(key)) ||
      typeof object.field !== 'string' ||
      (!fields.has(object.field) &&
        !['id', 'createdAt', 'updatedAt'].includes(object.field)) ||
      ![
        'eq',
        'neq',
        'gt',
        'gte',
        'lt',
        'lte',
        'contains',
        'startsWith',
        'in',
        'isNull',
      ].includes(String(object.operator))
    )
      this.fail('filter', 'contains an invalid field or operator');
    if (object.operator !== 'isNull' && !('value' in object))
      this.fail('filter', 'operator requires a value');
    const operator = object.operator as QueryOperator;
    const fieldType = fields.get(object.field);
    const comparable =
      fieldType === undefined ||
      [
        'NUMBER',
        'CURRENCY',
        'DATE',
        'DATETIME',
        'CREATED_AT',
        'UPDATED_AT',
      ].includes(fieldType);
    const textual =
      fieldType === undefined ||
      ['TEXT', 'LONG_TEXT', 'EMAIL', 'PHONE', 'URL'].includes(fieldType);
    if (['gt', 'gte', 'lt', 'lte'].includes(operator) && !comparable)
      this.fail(
        'filter',
        `operator '${operator}' is not supported for this field`,
      );
    if (operator === 'startsWith' && !textual)
      this.fail('filter', "operator 'startsWith' requires a text field");
    if (
      operator === 'in' &&
      (!Array.isArray(object.value) || object.value.length > 100)
    )
      this.fail(
        'filter',
        "operator 'in' requires an array of at most 100 values",
      );
  }
  private matches(record: DynamicRecord, filter: QueryFilter): boolean {
    const object = filter as unknown as Record<string, unknown>;
    if (Array.isArray(object.and))
      return (object.and as QueryFilter[]).every((child) =>
        this.matches(record, child),
      );
    if (Array.isArray(object.or))
      return (object.or as QueryFilter[]).some((child) =>
        this.matches(record, child),
      );
    if (object.not !== undefined)
      return !this.matches(record, object.not as QueryFilter);
    const actual =
      String(object.field) in record
        ? record[String(object.field) as keyof DynamicRecord]
        : record.values[String(object.field)];
    return applyOperator(
      actual,
      object.operator as QueryOperator,
      object.value,
    );
  }
}

const compareValues = (a: unknown, b: unknown): number => {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  const left = a instanceof Date ? a.getTime() : a;
  const right = b instanceof Date ? b.getTime() : b;
  return typeof left === 'number' && typeof right === 'number'
    ? left - right
    : comparableText(left).localeCompare(comparableText(right));
};
const comparableText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean' || typeof value === 'bigint')
    return String(value);
  return JSON.stringify(value) ?? '';
};
const applyOperator = (
  actual: unknown,
  operator: QueryOperator,
  expected: unknown,
): boolean => {
  const cmp = compareValues(actual, expected);
  switch (operator) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'gt':
      return cmp > 0;
    case 'gte':
      return cmp >= 0;
    case 'lt':
      return cmp < 0;
    case 'lte':
      return cmp <= 0;
    case 'contains':
      return typeof actual === 'string'
        ? actual.includes(String(expected))
        : Array.isArray(actual) && actual.includes(expected);
    case 'startsWith':
      return typeof actual === 'string' && actual.startsWith(String(expected));
    case 'in':
      return Array.isArray(expected) && expected.includes(actual);
    case 'isNull':
      return actual === null || actual === undefined;
  }
};
const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === '23505';
