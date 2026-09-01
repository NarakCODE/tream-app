import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiCursorPaginatedResponse } from '../../../common/decorators/api-cursor-paginated-response.decorator';
import { SkipIdempotency } from '../../../common/decorators/skip-idempotency.decorator';
import {
  ApiStandardArrayResponse,
  ApiStandardResponse,
} from '../../../common/decorators/api-standard-response.decorator';
import type { CursorPaginatedResult } from '../../../common/interfaces/api-response.interface';
import type { AuthenticatedUser } from '../../iam/domain/auth-user';
import { CurrentUser } from '../../iam/presentation/decorators/current-user.decorator';
import {
  DynamicDataService,
  type QueryFilter,
} from '../application/dynamic-data.service';
import {
  BulkCreateRecordsDto,
  BulkDeleteRecordsDto,
  BulkUpdateRecordsDto,
  CreateFieldDto,
  DatabaseDetailsResponseDto,
  DatabaseIdParamDto,
  DatabaseResponseDto,
  DuplicateDatabaseDto,
  FieldResponseDto,
  ListRecordsQueryDto,
  QueryDatabaseDto,
  RecordResponseDto,
  RecordValuesDto,
  UpdateDatabaseDto,
} from './dto/dynamic-data.dto';

@ApiTags('Dynamic Data')
@ApiBearerAuth()
@Controller({ path: 'databases', version: '1' })
export class DatabasesController {
  constructor(private readonly service: DynamicDataService) {}
  @Get(':databaseId')
  @ApiOperation({ summary: 'Get database schema details' })
  @ApiStandardResponse(DatabaseDetailsResponseDto)
  async get(
    @Param() p: DatabaseIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DatabaseDetailsResponseDto> {
    const result = await this.service.getDatabase(p.databaseId, user.id);
    return {
      ...DatabaseResponseDto.fromEntity(result.database),
      fields: result.fields.map(FieldResponseDto.fromEntity),
    };
  }
  @Patch(':databaseId')
  @ApiOperation({ summary: 'Update database metadata' })
  @ApiStandardResponse(DatabaseResponseDto)
  async update(
    @Param() p: DatabaseIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: UpdateDatabaseDto,
  ): Promise<DatabaseResponseDto> {
    return DatabaseResponseDto.fromEntity(
      await this.service.updateDatabase(p.databaseId, user.id, input),
    );
  }
  @Delete(':databaseId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete database and its records' })
  @ApiNoContentResponse()
  async delete(
    @Param() p: DatabaseIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.service.deleteDatabase(p.databaseId, user.id);
  }
  @Post(':databaseId/duplicate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Duplicate database schema structure' })
  @ApiStandardResponse(DatabaseDetailsResponseDto)
  async duplicate(
    @Param() p: DatabaseIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: DuplicateDatabaseDto,
  ): Promise<DatabaseDetailsResponseDto> {
    const result = await this.service.duplicateDatabase(
      p.databaseId,
      user.id,
      input.name,
    );
    return {
      ...DatabaseResponseDto.fromEntity(result.database),
      fields: result.fields.map(FieldResponseDto.fromEntity),
    };
  }
  @Get(':databaseId/fields')
  @ApiOperation({ summary: 'List database fields' })
  @ApiStandardArrayResponse(FieldResponseDto)
  async fields(
    @Param() p: DatabaseIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FieldResponseDto[]> {
    return (await this.service.listFields(p.databaseId, user.id)).map(
      FieldResponseDto.fromEntity,
    );
  }
  @Post(':databaseId/fields')
  @ApiOperation({ summary: 'Add a field definition' })
  @ApiStandardResponse(FieldResponseDto, HttpStatus.CREATED)
  async createField(
    @Param() p: DatabaseIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateFieldDto,
  ): Promise<FieldResponseDto> {
    return FieldResponseDto.fromEntity(
      await this.service.createField(p.databaseId, user.id, input),
    );
  }
  @Get(':databaseId/records')
  @ApiOperation({ summary: 'List active database records' })
  @ApiCursorPaginatedResponse(RecordResponseDto)
  async records(
    @Param() p: DatabaseIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListRecordsQueryDto,
  ): Promise<CursorPaginatedResult<RecordResponseDto>> {
    const page = await this.service.listRecords(p.databaseId, user.id, query);
    return { ...page, items: page.items.map(RecordResponseDto.fromEntity) };
  }
  @Post(':databaseId/records')
  @ApiOperation({ summary: 'Create a database record' })
  @ApiStandardResponse(RecordResponseDto, HttpStatus.CREATED)
  async createRecord(
    @Param() p: DatabaseIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: RecordValuesDto,
  ): Promise<RecordResponseDto> {
    return RecordResponseDto.fromEntity(
      await this.service.createRecord(p.databaseId, user.id, input.values),
    );
  }
  @Post(':databaseId/records/bulk')
  @ApiOperation({ summary: 'Atomically create up to 250 records' })
  @ApiStandardArrayResponse(RecordResponseDto, HttpStatus.CREATED)
  async bulkCreate(
    @Param() p: DatabaseIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: BulkCreateRecordsDto,
  ): Promise<RecordResponseDto[]> {
    return (
      await this.service.bulkCreate(
        p.databaseId,
        user.id,
        input.records.map(({ values }) => values),
      )
    ).map(RecordResponseDto.fromEntity);
  }
  @Patch(':databaseId/records/bulk')
  @ApiOperation({ summary: 'Atomically update up to 250 records' })
  @ApiStandardArrayResponse(RecordResponseDto)
  async bulkUpdate(
    @Param() p: DatabaseIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: BulkUpdateRecordsDto,
  ): Promise<RecordResponseDto[]> {
    return (
      await this.service.bulkUpdate(p.databaseId, user.id, input.records)
    ).map(RecordResponseDto.fromEntity);
  }
  @Post(':databaseId/records/bulk-delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Atomically soft-delete up to 250 records' })
  @ApiNoContentResponse()
  async bulkDelete(
    @Param() p: DatabaseIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: BulkDeleteRecordsDto,
  ): Promise<void> {
    await this.service.bulkDelete(p.databaseId, user.id, input.recordIds);
  }
  @Post(':databaseId/query')
  @HttpCode(HttpStatus.OK)
  @SkipIdempotency()
  @ApiOperation({ summary: 'Query records with a finite filter AST' })
  @ApiCursorPaginatedResponse(RecordResponseDto)
  async query(
    @Param() p: DatabaseIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: QueryDatabaseDto,
  ): Promise<CursorPaginatedResult<RecordResponseDto>> {
    const page = await this.service.query(p.databaseId, user.id, {
      limit: input.limit,
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      ...(input.sort === undefined ? {} : { sort: input.sort }),
      ...(input.filter === undefined
        ? {}
        : { filter: input.filter as QueryFilter }),
    });
    return { ...page, items: page.items.map(RecordResponseDto.fromEntity) };
  }
}
