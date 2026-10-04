import { PartialType, OmitType } from '@nestjs/swagger';
import {
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
  IsIn,
  IsInt,
  Min,
  Max,
  IsArray,
  ArrayUnique,
  ArrayMaxSize,
  ValidateBy,
} from 'class-validator';
import { CursorPaginationQueryDto } from '../../../common/dto/cursor-pagination-query.dto';
import { isCalendarDate } from '../../projects/domain/project-policy';
const optional = (_: unknown, v: unknown) => v !== undefined;
const nullable = (_: unknown, v: unknown) => v !== undefined && v !== null;
export class InitiativeRevisionDto {
  @IsInt() @Min(1) expectedRevision!: number;
}
export class CreateInitiativeDto {
  @IsString() @Matches(/\S/) @MaxLength(200) name!: string;
  @ValidateIf(nullable) @IsString() @MaxLength(100000) description?:
    string | null;
  @ValidateIf(optional)
  @IsIn(['PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELED'])
  status?: 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'CANCELED';
  @ValidateIf(nullable) @IsString() @MaxLength(100) ownerId?: string | null;
  @ValidateIf(nullable)
  @ValidateBy({
    name: 'calendarDate',
    validator: {
      validate: (v: unknown) => typeof v === 'string' && isCalendarDate(v),
    },
  })
  targetDate?: string | null;
  @ValidateIf(optional) @IsInt() @Min(0) @Max(1000000) position?: number;
  @ValidateIf(optional)
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  projectIds?: string[];
}
export class UpdateInitiativeDto extends PartialType(
  OmitType(CreateInitiativeDto, ['projectIds'] as const),
  { skipNullProperties: false },
) {
  @IsInt() @Min(1) expectedRevision!: number;
}
export class InitiativeListDto extends CursorPaginationQueryDto {
  @ValidateIf(optional) @IsIn(['active', 'archived', 'deleted']) lifecycle:
    'active' | 'archived' | 'deleted' = 'active';
  @ValidateIf(optional)
  @IsIn(['PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELED'])
  status?: CreateInitiativeDto['status'];
}
export class LinkInitiativeProjectDto extends InitiativeRevisionDto {
  @IsString() @MaxLength(100) projectId!: string;
}
export class ReorderInitiativeProjectsDto extends InitiativeRevisionDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  projectIds!: string[];
}
export class InitiativeUpdateDto {
  @IsString() @Matches(/\S/) @MaxLength(50000) body!: string;
  @IsIn(['ON_TRACK', 'AT_RISK', 'OFF_TRACK']) health!:
    'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK';
}
export class EditInitiativeUpdateDto extends InitiativeUpdateDto {
  @IsInt() @Min(1) expectedRevision!: number;
}
