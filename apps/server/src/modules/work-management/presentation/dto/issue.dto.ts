import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { CursorPaginationQueryDto } from '../../../../common/dto/cursor-pagination-query.dto';
import type { IssueWithDetails } from '../../application/ports/issues-repository.port';
import {
  ISSUE_STATUS_CATEGORIES,
  type IssueStatusCategory,
} from '../../domain/issue';
import { WORK_PRIORITIES, type WorkPriority } from '../../domain/project';
import { IssueStatusResponseDto } from './team.dto';

const trimText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class ListIssuesQueryDto extends CursorPaginationQueryDto {
  @IsOptional()
  @Matches(/^tem_[0-9A-HJKMNP-TV-Z]{26}$/)
  @ApiPropertyOptional({ example: 'tem_01J8A4ZS9VBD8XAADETY7SKHMA' })
  teamId?: string;

  @IsOptional()
  @Matches(/^prj_[0-9A-HJKMNP-TV-Z]{26}$/)
  @ApiPropertyOptional({ example: 'prj_01J8A4ZS9VBD8XAADETY7SKHMA' })
  projectId?: string;

  @IsOptional()
  @Matches(/^cyc_[0-9A-HJKMNP-TV-Z]{26}$/)
  @ApiPropertyOptional({ example: 'cyc_01J8A4ZS9VBD8XAADETY7SKHMA' })
  cycleId?: string;

  @IsOptional()
  @Matches(/^mbr_[0-9A-HJKMNP-TV-Z]{26}$/)
  @ApiPropertyOptional({ example: 'mbr_01J8A4ZS9VBD8XAADETY7SKHMA' })
  assigneeId?: string;

  @IsOptional()
  @IsIn(WORK_PRIORITIES)
  @ApiPropertyOptional({ enum: WORK_PRIORITIES })
  priority?: WorkPriority;

  @IsOptional()
  @IsIn(ISSUE_STATUS_CATEGORIES)
  @ApiPropertyOptional({ enum: ISSUE_STATUS_CATEGORIES })
  statusCategory?: IssueStatusCategory;

  @IsOptional()
  @Matches(/^ist_[0-9A-HJKMNP-TV-Z]{26}$/)
  @ApiPropertyOptional({ example: 'ist_01J8A4ZS9VBD8XAADETY7SKHMA' })
  statusId?: string;
}

export class CreateIssueDto {
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @ApiProperty({ example: 'Implement auth session refresh' })
  title!: string;

  @IsOptional()
  @Transform(trimText)
  @IsString()
  @MaxLength(10000)
  @ApiPropertyOptional({ example: 'Detailed description of the issue...' })
  description?: string | null;

  @IsOptional()
  @Matches(/^ist_[0-9A-HJKMNP-TV-Z]{26}$/)
  @ApiPropertyOptional({ example: 'ist_01J8A4ZS9VBD8XAADETY7SKHMA' })
  statusId?: string;

  @IsOptional()
  @IsIn(WORK_PRIORITIES)
  @ApiPropertyOptional({ enum: WORK_PRIORITIES, example: 'MEDIUM' })
  priority?: WorkPriority;

  @IsOptional()
  @Matches(/^mbr_[0-9A-HJKMNP-TV-Z]{26}$/)
  @ApiPropertyOptional({ example: 'mbr_01J8A4ZS9VBD8XAADETY7SKHMA' })
  assigneeId?: string | null;

  @IsOptional()
  @Matches(/^prj_[0-9A-HJKMNP-TV-Z]{26}$/)
  @ApiPropertyOptional({ example: 'prj_01J8A4ZS9VBD8XAADETY7SKHMA' })
  projectId?: string | null;

  @IsOptional()
  @Matches(/^cyc_[0-9A-HJKMNP-TV-Z]{26}$/)
  @ApiPropertyOptional({ example: 'cyc_01J8A4ZS9VBD8XAADETY7SKHMA' })
  cycleId?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @ApiPropertyOptional({ example: '2026-09-15T00:00:00.000Z' })
  dueDate?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @ApiPropertyOptional({ example: 3 })
  estimate?: number | null;
}

export class UpdateIssueDto {
  @IsOptional()
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @ApiPropertyOptional({ example: 'Updated issue title' })
  title?: string;

  @IsOptional()
  @Transform(trimText)
  @IsString()
  @MaxLength(10000)
  @ApiPropertyOptional({ example: 'Updated description' })
  description?: string | null;

  @IsOptional()
  @Matches(/^ist_[0-9A-HJKMNP-TV-Z]{26}$/)
  @ApiPropertyOptional({ example: 'ist_01J8A4ZS9VBD8XAADETY7SKHMA' })
  statusId?: string;

  @IsOptional()
  @IsIn(WORK_PRIORITIES)
  @ApiPropertyOptional({ enum: WORK_PRIORITIES })
  priority?: WorkPriority;

  @IsOptional()
  @Matches(/^mbr_[0-9A-HJKMNP-TV-Z]{26}$/)
  @ApiPropertyOptional({ example: 'mbr_01J8A4ZS9VBD8XAADETY7SKHMA' })
  assigneeId?: string | null;

  @IsOptional()
  @Matches(/^prj_[0-9A-HJKMNP-TV-Z]{26}$/)
  @ApiPropertyOptional({ example: 'prj_01J8A4ZS9VBD8XAADETY7SKHMA' })
  projectId?: string | null;

  @IsOptional()
  @Matches(/^cyc_[0-9A-HJKMNP-TV-Z]{26}$/)
  @ApiPropertyOptional({ example: 'cyc_01J8A4ZS9VBD8XAADETY7SKHMA' })
  cycleId?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @ApiPropertyOptional({ example: '2026-09-15T00:00:00.000Z' })
  dueDate?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @ApiPropertyOptional({ example: 5 })
  estimate?: number | null;
}

export class IssueResponseDto {
  @ApiProperty({ example: 'iss_01J8A4ZS9VBD8XAADETY7SKHMA' })
  id!: string;

  @ApiProperty({ example: 'ws_01J8A4MS9VBD8XAADETY7SKHMA' })
  workspaceId!: string;

  @ApiProperty({ example: 'tem_01J8A4ZS9VBD8XAADETY7SKHMA' })
  teamId!: string;

  @ApiProperty({ example: 42 })
  number!: number;

  @ApiProperty({ example: 'ENG-42' })
  identifier!: string;

  @ApiProperty({ example: 'Implement auth session refresh' })
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty({ example: 'ist_01J8A4ZS9VBD8XAADETY7SKHMA' })
  statusId!: string;

  @ApiProperty({ type: () => IssueStatusResponseDto })
  status!: IssueStatusResponseDto;

  @ApiProperty({ enum: WORK_PRIORITIES })
  priority!: WorkPriority;

  @ApiPropertyOptional({ nullable: true })
  assigneeId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  projectId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  cycleId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  dueDate!: string | null;

  @ApiPropertyOptional({ nullable: true })
  estimate!: number | null;

  @ApiProperty({ example: 0 })
  sortOrder!: number;

  @ApiProperty({ example: '2026-08-30T10:30:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-08-30T10:30:00.000Z' })
  updatedAt!: string;

  @ApiPropertyOptional({ nullable: true })
  deletedAt!: string | null;

  static fromEntity(issue: IssueWithDetails): IssueResponseDto {
    return {
      id: issue.id,
      workspaceId: issue.workspaceId,
      teamId: issue.teamId,
      number: issue.number,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
      statusId: issue.statusId,
      status: IssueStatusResponseDto.fromEntity(issue.status),
      priority: issue.priority,
      assigneeId: issue.assigneeId,
      projectId: issue.projectId,
      cycleId: issue.cycleId,
      dueDate: issue.dueDate?.toISOString() ?? null,
      estimate: issue.estimate,
      sortOrder: issue.sortOrder,
      createdAt: issue.createdAt.toISOString(),
      updatedAt: issue.updatedAt.toISOString(),
      deletedAt: issue.deletedAt?.toISOString() ?? null,
    };
  }
}
