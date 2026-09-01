import { Injectable } from '@nestjs/common';
import type { CursorPaginatedResult } from '../../../common/interfaces/api-response.interface';
import type { DynamicRecord, FieldDefinition } from '../domain/dynamic-data';
import { DynamicDataService, type QueryInput } from './dynamic-data.service';

/**
 * Stable, transport-independent surface for agent skills that operate on
 * dynamic records. Authorization always uses the supplied actor user id.
 */
@Injectable()
export class DynamicRecordsApplicationService {
  constructor(private readonly dynamicData: DynamicDataService) {}

  getSchema(
    databaseId: string,
    actorUserId: string,
  ): Promise<FieldDefinition[]> {
    return this.dynamicData.listFields(databaseId, actorUserId);
  }

  create(
    databaseId: string,
    actorUserId: string,
    values: Record<string, unknown>,
  ): Promise<DynamicRecord> {
    return this.dynamicData.createRecord(databaseId, actorUserId, values);
  }

  update(
    recordId: string,
    actorUserId: string,
    values: Record<string, unknown>,
  ): Promise<DynamicRecord> {
    return this.dynamicData.updateRecord(recordId, actorUserId, values);
  }

  query(
    databaseId: string,
    actorUserId: string,
    input: QueryInput,
  ): Promise<CursorPaginatedResult<DynamicRecord>> {
    return this.dynamicData.query(databaseId, actorUserId, input);
  }
}
