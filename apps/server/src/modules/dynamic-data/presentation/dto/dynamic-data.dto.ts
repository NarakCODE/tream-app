import { Type, Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  FIELD_TYPES,
  type DynamicDatabase,
  type DynamicRecord,
  type FieldDefinition,
  type FieldType,
} from '../../domain/dynamic-data';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const dbId = /^db_[0-9A-HJKMNP-TV-Z]{26}$/;
const fieldId = /^fld_[0-9A-HJKMNP-TV-Z]{26}$/;
const recordId = /^rec_[0-9A-HJKMNP-TV-Z]{26}$/;

export class DatabaseIdParamDto {
  @Matches(dbId) databaseId!: string;
}
export class FieldIdParamDto {
  @Matches(fieldId) fieldId!: string;
}
export class RecordIdParamDto {
  @Matches(recordId) recordId!: string;
}
export class CreateDatabaseDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(120) name!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) icon?:
    string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2_000) description?:
    string | null;
}
export class UpdateDatabaseDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) icon?:
    string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2_000) description?:
    string | null;
}
export class DuplicateDatabaseDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;
}
export class CreateFieldDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(120) name!: string;
  @Transform(trim) @IsString() @Matches(/^[a-z][a-z0-9_]{0,63}$/) key!: string;
  @IsIn(FIELD_TYPES) type!: FieldType;
  @IsOptional() @IsBoolean() isRequired?: boolean;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
}
export class UpdateFieldDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;
  @IsOptional() @IsBoolean() isRequired?: boolean;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
}
export class RecordValuesDto {
  @IsObject() values!: Record<string, unknown>;
}
export class BulkCreateRecordsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(250)
  @ValidateNested({ each: true })
  @Type(() => RecordValuesDto)
  records!: RecordValuesDto[];
}
export class BulkRecordUpdateDto extends RecordValuesDto {
  @Matches(recordId) id!: string;
}
export class BulkUpdateRecordsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(250)
  @ValidateNested({ each: true })
  @Type(() => BulkRecordUpdateDto)
  records!: BulkRecordUpdateDto[];
}
export class BulkDeleteRecordsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(250)
  @Matches(recordId, { each: true })
  recordIds!: string[];
}
export class ListRecordsQueryDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
  @IsOptional() @IsString() @MaxLength(64) cursor?: string;
  @IsOptional()
  @IsString()
  @Matches(/^(createdAt|updatedAt|[a-z][a-z0-9_]{0,63})$/)
  sortField?: string;
  @IsOptional() @IsIn(['asc', 'desc']) sortDirection?: 'asc' | 'desc';
}
export class QuerySortDto {
  @IsString()
  @Matches(/^(createdAt|updatedAt|id|[a-z][a-z0-9_]{0,63})$/)
  field!: string;
  @IsIn(['asc', 'desc']) direction!: 'asc' | 'desc';
}
export class QueryDatabaseDto {
  @IsOptional() @IsObject() filter?: Record<string, unknown>;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => QuerySortDto)
  sort?: QuerySortDto[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
  @IsOptional() @IsString() @MaxLength(64) cursor?: string;
}
export class DatabaseResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() workspaceId!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) icon!: string | null;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  static fromEntity(this: void, value: DynamicDatabase): DatabaseResponseDto {
    return {
      ...value,
      createdAt: value.createdAt.toISOString(),
      updatedAt: value.updatedAt.toISOString(),
    };
  }
}
export class FieldResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() databaseId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() key!: string;
  @ApiProperty({ enum: FIELD_TYPES }) type!: FieldType;
  @ApiProperty() isRequired!: boolean;
  @ApiProperty({ type: 'object', additionalProperties: true }) config!: Record<
    string,
    unknown
  >;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  static fromEntity(this: void, value: FieldDefinition): FieldResponseDto {
    return {
      id: value.id,
      databaseId: value.databaseId,
      name: value.name,
      key: value.key,
      type: value.type,
      isRequired: value.isRequired,
      config: value.config,
      createdAt: value.createdAt.toISOString(),
      updatedAt: value.updatedAt.toISOString(),
    };
  }
}
export class DatabaseDetailsResponseDto extends DatabaseResponseDto {
  @ApiProperty({ type: () => [FieldResponseDto] }) fields!: FieldResponseDto[];
}
export class RecordResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() databaseId!: string;
  @ApiProperty() workspaceId!: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) values!: Record<
    string,
    unknown
  >;
  @ApiProperty() createdBy!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiPropertyOptional({ nullable: true, format: 'date-time' }) deletedAt!:
    string | null;
  static fromEntity(this: void, value: DynamicRecord): RecordResponseDto {
    return {
      ...value,
      createdAt: value.createdAt.toISOString(),
      updatedAt: value.updatedAt.toISOString(),
      deletedAt: value.deletedAt?.toISOString() ?? null,
    };
  }
}
