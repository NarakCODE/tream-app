import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CursorPaginationQueryDto } from '../../../../common/dto/cursor-pagination-query.dto';
import type { IssueStatus, IssueStatusCategory } from '../../domain/issue';
import type {
  Team,
  TeamMemberDetails,
  TeamMembership,
} from '../../domain/team';

const trimText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
};

export class ListTeamsQueryDto extends CursorPaginationQueryDto {
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeRetired?: boolean;
}

export class CreateTeamDto {
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @ApiProperty({ example: 'Engineering' })
  name!: string;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  @Matches(/^[A-Za-z0-9]+$/)
  @ApiProperty({ example: 'ENG' })
  key!: string;

  @IsOptional()
  @Transform(trimText)
  @IsString()
  @MaxLength(1000)
  @ApiPropertyOptional({ example: 'Core product engineering team' })
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @ApiPropertyOptional({ example: 'UTC' })
  timezone?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(52)
  @ApiPropertyOptional({ example: 2 })
  cycleDurationWeeks?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(7)
  @ApiPropertyOptional({ example: 1 })
  cycleStartDay?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  @ApiPropertyOptional({ example: 0 })
  cycleCooldownDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  @ApiPropertyOptional({ example: 3 })
  upcomingCyclesCount?: number;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ example: false })
  cyclesEnabled?: boolean;
}

export class UpdateTeamDto {
  @IsOptional()
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @ApiPropertyOptional({ example: 'Engineering' })
  name?: string;

  @IsOptional()
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  @Matches(/^[A-Za-z0-9]+$/)
  @ApiPropertyOptional({ example: 'ENG' })
  key?: string;

  @IsOptional()
  @Transform(trimText)
  @IsString()
  @MaxLength(1000)
  @ApiPropertyOptional({ example: 'Updated description' })
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @ApiPropertyOptional({ example: 'UTC' })
  timezone?: string;
}

export class AddTeamMemberDto {
  @Matches(/^mbr_[0-9A-HJKMNP-TV-Z]{26}$/)
  @ApiProperty({ example: 'mbr_01J8A4ZS9VBD8XAADETY7SKHMA' })
  memberId!: string;
}

export class UpdateCycleSettingsDto {
  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ example: true })
  cyclesEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(52)
  @ApiPropertyOptional({ example: 2 })
  cycleDurationWeeks?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(7)
  @ApiPropertyOptional({ example: 1 })
  cycleStartDay?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  @ApiPropertyOptional({ example: 0 })
  cycleCooldownDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  @ApiPropertyOptional({ example: 3 })
  upcomingCyclesCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @ApiPropertyOptional({ example: 'UTC' })
  timezone?: string;
}

export class TeamResponseDto {
  @ApiProperty({ example: 'tem_01J8A4ZS9VBD8XAADETY7SKHMA' })
  id!: string;

  @ApiProperty({ example: 'ws_01J8A4MS9VBD8XAADETY7SKHMA' })
  workspaceId!: string;

  @ApiProperty({ example: 'Engineering' })
  name!: string;

  @ApiProperty({ example: 'ENG' })
  key!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty({ example: 'UTC' })
  timezone!: string;

  @ApiProperty({ example: 2 })
  cycleDurationWeeks!: number;

  @ApiProperty({ example: 1 })
  cycleStartDay!: number;

  @ApiProperty({ example: 0 })
  cycleCooldownDays!: number;

  @ApiProperty({ example: 3 })
  upcomingCyclesCount!: number;

  @ApiProperty({ example: false })
  cyclesEnabled!: boolean;

  @ApiProperty({ example: 1 })
  nextIssueNumber!: number;

  @ApiProperty({ example: '2026-08-30T10:30:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-08-30T10:30:00.000Z' })
  updatedAt!: string;

  @ApiPropertyOptional({ nullable: true })
  retiredAt!: string | null;

  static fromEntity(team: Team): TeamResponseDto {
    return {
      id: team.id,
      workspaceId: team.workspaceId,
      name: team.name,
      key: team.key,
      description: team.description,
      timezone: team.timezone,
      cycleDurationWeeks: team.cycleDurationWeeks,
      cycleStartDay: team.cycleStartDay,
      cycleCooldownDays: team.cycleCooldownDays,
      upcomingCyclesCount: team.upcomingCyclesCount,
      cyclesEnabled: team.cyclesEnabled,
      nextIssueNumber: team.nextIssueNumber,
      createdAt: team.createdAt.toISOString(),
      updatedAt: team.updatedAt.toISOString(),
      retiredAt: team.retiredAt?.toISOString() ?? null,
    };
  }
}

export class TeamMemberDetailsDto {
  @ApiProperty({ example: 'tmb_01J8A4ZS9VBD8XAADETY7SKHMA' })
  id!: string;

  @ApiProperty({ example: 'tem_01J8A4ZS9VBD8XAADETY7SKHMA' })
  teamId!: string;

  @ApiProperty({ example: 'mbr_01J8A4ZS9VBD8XAADETY7SKHMA' })
  membershipId!: string;

  @ApiProperty({ example: 'usr_01J8A4ZS9VBD8XAADETY7SKHMA' })
  userId!: string;

  @ApiProperty({ example: 'Sarah Connor' })
  fullName!: string;

  @ApiProperty({ example: 'sarah@cyberdyne.com' })
  email!: string;

  @ApiProperty({ example: 'MEMBER' })
  role!: string;

  @ApiProperty({ example: '2026-08-30T10:30:00.000Z' })
  createdAt!: string;

  static fromEntity(details: TeamMemberDetails): TeamMemberDetailsDto {
    return {
      id: details.id,
      teamId: details.teamId,
      membershipId: details.membershipId,
      userId: details.userId,
      fullName: details.fullName,
      email: details.email,
      role: details.role,
      createdAt: details.createdAt.toISOString(),
    };
  }
}

export class TeamMembershipResponseDto {
  @ApiProperty({ example: 'tmb_01J8A4ZS9VBD8XAADETY7SKHMA' })
  id!: string;

  @ApiProperty({ example: 'tem_01J8A4ZS9VBD8XAADETY7SKHMA' })
  teamId!: string;

  @ApiProperty({ example: 'mbr_01J8A4ZS9VBD8XAADETY7SKHMA' })
  membershipId!: string;

  @ApiProperty({ example: '2026-08-30T10:30:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-08-30T10:30:00.000Z' })
  updatedAt!: string;

  static fromEntity(membership: TeamMembership): TeamMembershipResponseDto {
    return {
      id: membership.id,
      teamId: membership.teamId,
      membershipId: membership.membershipId,
      createdAt: membership.createdAt.toISOString(),
      updatedAt: membership.updatedAt.toISOString(),
    };
  }
}

export class IssueStatusResponseDto {
  @ApiProperty({ example: 'ist_01J8A4ZS9VBD8XAADETY7SKHMA' })
  id!: string;

  @ApiProperty({ example: 'tem_01J8A4ZS9VBD8XAADETY7SKHMA' })
  teamId!: string;

  @ApiProperty({ example: 'Backlog' })
  name!: string;

  @ApiProperty({ example: 'BACKLOG' })
  category!: IssueStatusCategory;

  @ApiProperty({ example: 0 })
  position!: number;

  @ApiProperty({ example: true })
  isDefault!: boolean;

  @ApiProperty({ example: '2026-08-30T10:30:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-08-30T10:30:00.000Z' })
  updatedAt!: string;

  static fromEntity(status: IssueStatus): IssueStatusResponseDto {
    return {
      id: status.id,
      teamId: status.teamId,
      name: status.name,
      category: status.category,
      position: status.position,
      isDefault: status.isDefault,
      createdAt: status.createdAt.toISOString(),
      updatedAt: status.updatedAt.toISOString(),
    };
  }
}
