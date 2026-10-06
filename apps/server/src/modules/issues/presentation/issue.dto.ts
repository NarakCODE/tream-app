import { PartialType, OmitType } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { CursorPaginationQueryDto } from '../../../common/dto/cursor-pagination-query.dto';
const optional = (_: unknown, v: unknown) => v !== undefined;
const nullable = (_: unknown, v: unknown) => v !== undefined && v !== null;
export class RevisionDto {
  @IsInt() @Min(1) expectedRevision!: number;
}
export class CreateIssueDto {
  @IsString() @MaxLength(100) teamId!: string;
  @IsString() @Matches(/\S/) @MaxLength(500) title!: string;
  @ValidateIf(nullable) @IsString() @MaxLength(100000) description?:
    string | null;
  @ValidateIf(optional) @IsString() @MaxLength(100) statusId?: string;
  @ValidateIf(optional)
  @IsIn(['NO_PRIORITY', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  priority?: 'NO_PRIORITY' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  @ValidateIf(nullable) @IsString() @MaxLength(100) assigneeId?: string | null;
  @ValidateIf(nullable) @IsString() @MaxLength(100) projectId?: string | null;
  @ValidateIf(nullable) @IsString() @MaxLength(100) milestoneId?: string | null;
  @ValidateIf(nullable) @IsString() @MaxLength(100) cycleId?: string | null;
  @ValidateIf(nullable) @IsString() @MaxLength(100) parentId?: string | null;
  @ValidateIf(nullable) @IsISO8601({ strict: true }) dueDate?: string | null;
  @ValidateIf(nullable) @IsInt() @Min(0) @Max(1000) estimate?: number | null;
  @ValidateIf(optional)
  @IsInt()
  @Min(-2147483648)
  @Max(2147483647)
  sortOrder?: number;
}
export class UpdateIssueDto extends PartialType(
  OmitType(CreateIssueDto, ['teamId'] as const),
  { skipNullProperties: false },
) {
  @IsInt() @Min(1) expectedRevision!: number;
}
export class TransferIssueDto extends RevisionDto {
  @IsString() @MaxLength(100) teamId!: string;
  @ValidateIf(optional) @IsString() @MaxLength(100) statusId?: string;
  @ValidateIf(nullable) @IsString() @MaxLength(100) projectId?: string | null;
  @ValidateIf(nullable) @IsString() @MaxLength(100) milestoneId?: string | null;
  @ValidateIf(nullable) @IsString() @MaxLength(100) cycleId?: string | null;
}
export class RelationDto extends RevisionDto {
  @IsString() @MaxLength(100) targetIssueId!: string;
  @IsIn(['BLOCKS', 'RELATED', 'DUPLICATES']) type!:
    'BLOCKS' | 'RELATED' | 'DUPLICATES';
}
export class IssueListDto extends CursorPaginationQueryDto {
  @ValidateIf(optional) @IsString() @MaxLength(100) teamId?: string;
  @ValidateIf(optional) @IsString() @MaxLength(100) statusId?: string;
  @ValidateIf(optional) @IsString() @MaxLength(100) projectId?: string;
  @ValidateIf(optional) @IsString() @MaxLength(100) cycleId?: string;
  @ValidateIf(optional) @IsString() @MaxLength(100) assigneeId?: string;
  @ValidateIf(optional) @IsString() @MaxLength(100) createdById?: string;
  @ValidateIf(optional) @IsString() @MaxLength(100) parentId?: string;
  @ValidateIf(optional)
  @IsIn(['NO_PRIORITY', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  priority?: CreateIssueDto['priority'];
  @ValidateIf(optional) @IsIn(['active', 'archived', 'deleted']) lifecycle:
    'active' | 'archived' | 'deleted' = 'active';
}

export class CreateTeamIssueDto extends OmitType(CreateIssueDto, [
  'teamId',
] as const) {}
