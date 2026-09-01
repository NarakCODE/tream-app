import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import type { CycleWithDetails } from '../../application/ports/cycles-repository.port';
import type { CycleProgress } from '../../domain/cycle';

const trimText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateCycleDto {
  @IsOptional()
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @ApiPropertyOptional({ example: 'Cycle 1 (Sprint A)' })
  name?: string;
}

export class CycleProgressDto {
  @ApiProperty({ example: 8 })
  totalIssues!: number;

  @ApiProperty({ example: 6 })
  completedIssues!: number;

  @ApiProperty({ example: 75 })
  percent!: number;
}

export class CycleResponseDto {
  @ApiProperty({ example: 'cyc_01J8A4ZS9VBD8XAADETY7SKHMA' })
  id!: string;

  @ApiProperty({ example: 'tem_01J8A4ZS9VBD8XAADETY7SKHMA' })
  teamId!: string;

  @ApiProperty({ example: 1 })
  number!: number;

  @ApiProperty({ example: 'Cycle 1' })
  name!: string;

  @ApiProperty({ example: '2026-08-31T00:00:00.000Z' })
  startsAt!: string;

  @ApiProperty({ example: '2026-09-14T00:00:00.000Z' })
  endsAt!: string;

  @ApiPropertyOptional({ nullable: true, example: '2026-09-14T00:00:00.000Z' })
  completedAt!: string | null;

  @ApiProperty({ type: () => CycleProgressDto })
  progress!: CycleProgress;

  @ApiProperty({ example: '2026-08-30T10:30:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-08-30T10:30:00.000Z' })
  updatedAt!: string;

  static fromEntity(cycle: CycleWithDetails): CycleResponseDto {
    return {
      id: cycle.id,
      teamId: cycle.teamId,
      number: cycle.number,
      name: cycle.name,
      startsAt: cycle.startsAt.toISOString(),
      endsAt: cycle.endsAt.toISOString(),
      completedAt: cycle.completedAt?.toISOString() ?? null,
      progress: cycle.progress,
      createdAt: cycle.createdAt.toISOString(),
      updatedAt: cycle.updatedAt.toISOString(),
    };
  }
}
