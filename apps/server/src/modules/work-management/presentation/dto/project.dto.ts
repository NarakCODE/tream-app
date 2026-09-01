import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { CursorPaginationQueryDto } from '../../../../common/dto/cursor-pagination-query.dto';
import type { ProjectWithDetails } from '../../application/ports/projects-repository.port';
import {
  PROJECT_STATUSES,
  WORK_PRIORITIES,
  type ProjectProgress,
  type ProjectStatus,
  type ProjectTeam,
  type WorkPriority,
} from '../../domain/project';
import { TeamResponseDto } from './team.dto';

const trimText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class ListProjectsQueryDto extends CursorPaginationQueryDto {
  @IsOptional()
  @IsIn(PROJECT_STATUSES)
  @ApiPropertyOptional({ enum: PROJECT_STATUSES })
  status?: ProjectStatus;

  @IsOptional()
  @Matches(/^tem_[0-9A-HJKMNP-TV-Z]{26}$/)
  @ApiPropertyOptional({ example: 'tem_01J8A4ZS9VBD8XAADETY7SKHMA' })
  teamId?: string;

  @IsOptional()
  @Matches(/^mbr_[0-9A-HJKMNP-TV-Z]{26}$/)
  @ApiPropertyOptional({ example: 'mbr_01J8A4ZS9VBD8XAADETY7SKHMA' })
  leadId?: string;
}

export class CreateProjectDto {
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  @ApiProperty({ example: 'Q3 Mobile App' })
  name!: string;

  @IsOptional()
  @Transform(trimText)
  @IsString()
  @MaxLength(300)
  @ApiPropertyOptional({ example: 'Release React Native mobile client' })
  summary?: string | null;

  @IsOptional()
  @Transform(trimText)
  @IsString()
  @MaxLength(5000)
  @ApiPropertyOptional({ example: 'Detailed roadmap and specifications...' })
  description?: string | null;

  @IsOptional()
  @IsIn(PROJECT_STATUSES)
  @ApiPropertyOptional({ enum: PROJECT_STATUSES, example: 'PLANNED' })
  status?: ProjectStatus;

  @IsOptional()
  @IsIn(WORK_PRIORITIES)
  @ApiPropertyOptional({ enum: WORK_PRIORITIES, example: 'MEDIUM' })
  priority?: WorkPriority;

  @IsOptional()
  @Matches(/^mbr_[0-9A-HJKMNP-TV-Z]{26}$/)
  @ApiPropertyOptional({ example: 'mbr_01J8A4ZS9VBD8XAADETY7SKHMA' })
  leadId?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @ApiPropertyOptional({ example: '2026-09-01T00:00:00.000Z' })
  startDate?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @ApiPropertyOptional({ example: '2026-10-31T00:00:00.000Z' })
  targetDate?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @Matches(/^tem_[0-9A-HJKMNP-TV-Z]{26}$/, { each: true })
  @ApiPropertyOptional({
    type: [String],
    example: ['tem_01J8A4ZS9VBD8XAADETY7SKHMA'],
  })
  teamIds?: string[];
}

export class UpdateProjectDto {
  @IsOptional()
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  @ApiPropertyOptional({ example: 'Q3 Mobile App' })
  name?: string;

  @IsOptional()
  @Transform(trimText)
  @IsString()
  @MaxLength(300)
  @ApiPropertyOptional({ example: 'Updated summary' })
  summary?: string | null;

  @IsOptional()
  @Transform(trimText)
  @IsString()
  @MaxLength(5000)
  @ApiPropertyOptional({ example: 'Updated description' })
  description?: string | null;

  @IsOptional()
  @IsIn(PROJECT_STATUSES)
  @ApiPropertyOptional({ enum: PROJECT_STATUSES })
  status?: ProjectStatus;

  @IsOptional()
  @IsIn(WORK_PRIORITIES)
  @ApiPropertyOptional({ enum: WORK_PRIORITIES })
  priority?: WorkPriority;

  @IsOptional()
  @Matches(/^mbr_[0-9A-HJKMNP-TV-Z]{26}$/)
  @ApiPropertyOptional({ example: 'mbr_01J8A4ZS9VBD8XAADETY7SKHMA' })
  leadId?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @ApiPropertyOptional({ example: '2026-09-01T00:00:00.000Z' })
  startDate?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @ApiPropertyOptional({ example: '2026-10-31T00:00:00.000Z' })
  targetDate?: string | null;
}

export class AddProjectTeamDto {
  @Matches(/^tem_[0-9A-HJKMNP-TV-Z]{26}$/)
  @ApiProperty({ example: 'tem_01J8A4ZS9VBD8XAADETY7SKHMA' })
  teamId!: string;
}

export class ProjectProgressDto {
  @ApiProperty({ example: 10 })
  totalIssues!: number;

  @ApiProperty({ example: 4 })
  completedIssues!: number;

  @ApiProperty({ example: 40 })
  percent!: number;
}

export class ProjectResponseDto {
  @ApiProperty({ example: 'prj_01J8A4ZS9VBD8XAADETY7SKHMA' })
  id!: string;

  @ApiProperty({ example: 'ws_01J8A4MS9VBD8XAADETY7SKHMA' })
  workspaceId!: string;

  @ApiProperty({ example: 'Q3 Mobile App' })
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  summary!: string | null;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty({ enum: PROJECT_STATUSES })
  status!: ProjectStatus;

  @ApiProperty({ enum: WORK_PRIORITIES })
  priority!: WorkPriority;

  @ApiPropertyOptional({ nullable: true })
  leadId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  startDate!: string | null;

  @ApiPropertyOptional({ nullable: true })
  targetDate!: string | null;

  @ApiProperty({ type: () => [TeamResponseDto] })
  teams!: TeamResponseDto[];

  @ApiProperty({ type: () => ProjectProgressDto })
  progress!: ProjectProgress;

  @ApiProperty({ example: '2026-08-30T10:30:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-08-30T10:30:00.000Z' })
  updatedAt!: string;

  @ApiPropertyOptional({ nullable: true })
  deletedAt!: string | null;

  static fromEntity(project: ProjectWithDetails): ProjectResponseDto {
    return {
      id: project.id,
      workspaceId: project.workspaceId,
      name: project.name,
      summary: project.summary,
      description: project.description,
      status: project.status,
      priority: project.priority,
      leadId: project.leadId,
      startDate: project.startDate?.toISOString() ?? null,
      targetDate: project.targetDate?.toISOString() ?? null,
      teams: project.teams.map((t) => TeamResponseDto.fromEntity(t)),
      progress: project.progress,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      deletedAt: project.deletedAt?.toISOString() ?? null,
    };
  }
}

export class ProjectTeamResponseDto {
  @ApiProperty({ example: 'pjt_01J8A4ZS9VBD8XAADETY7SKHMA' })
  id!: string;

  @ApiProperty({ example: 'prj_01J8A4ZS9VBD8XAADETY7SKHMA' })
  projectId!: string;

  @ApiProperty({ example: 'tem_01J8A4ZS9VBD8XAADETY7SKHMA' })
  teamId!: string;

  @ApiProperty({ example: '2026-08-30T10:30:00.000Z' })
  createdAt!: string;

  static fromEntity(association: ProjectTeam): ProjectTeamResponseDto {
    return {
      id: association.id,
      projectId: association.projectId,
      teamId: association.teamId,
      createdAt: association.createdAt.toISOString(),
    };
  }
}
