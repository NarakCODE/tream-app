import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  ValidateIf,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
export const CATEGORIES = [
  'BACKLOG',
  'UNSTARTED',
  'STARTED',
  'COMPLETED',
  'CANCELED',
  'DUPLICATE',
] as const;
export type Category = (typeof CATEGORIES)[number];
export class CreateTeamDto {
  @ApiProperty() @IsString() @Matches(/\S/) @MaxLength(100) name!: string;
  @ApiProperty({ example: 'ENG' })
  @Matches(/^[A-Z][A-Z0-9]{1,9}$/)
  key!: string;
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(2000)
  description?: string;
  @ApiPropertyOptional({ enum: ['WORKSPACE', 'PRIVATE'] })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum({ WORKSPACE: 'WORKSPACE', PRIVATE: 'PRIVATE' })
  visibility?: 'WORKSPACE' | 'PRIVATE';
}
export class UpdateTeamDto {
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  name?: string;
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(2000)
  description?: string;
  @ApiPropertyOptional({ enum: ['WORKSPACE', 'PRIVATE'] })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum({ WORKSPACE: 'WORKSPACE', PRIVATE: 'PRIVATE' })
  visibility?: 'WORKSPACE' | 'PRIVATE';
}
export class TeamSettingsDto {
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  timezone?: string;
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(8)
  cycleDurationWeeks?: number;
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(6)
  cycleStartDay?: number;
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(14)
  cycleCooldownDays?: number;
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(10)
  upcomingCyclesCount?: number;
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  cyclesEnabled?: boolean;
}
export class TeamMemberRoleDto {
  @ApiProperty({ enum: ['MEMBER', 'ADMIN'] })
  @IsEnum({ MEMBER: 'MEMBER', ADMIN: 'ADMIN' })
  role!: 'MEMBER' | 'ADMIN';
}
export class AddTeamMemberDto {
  @ApiPropertyOptional({ enum: ['MEMBER', 'ADMIN'], default: 'MEMBER' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum({ MEMBER: 'MEMBER', ADMIN: 'ADMIN' })
  role: 'MEMBER' | 'ADMIN' = 'MEMBER';
  @ApiProperty() @IsUUID() membershipId!: string;
}
export class CreateStatusDto {
  @ApiProperty() @IsString() @Matches(/\S/) @MaxLength(100) name!: string;
  @ApiProperty({ enum: CATEGORIES })
  @IsEnum(Object.fromEntries(CATEGORIES.map((x) => [x, x])))
  category!: Category;
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(1000)
  position?: number;
}
export class UpdateStatusDto {
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  name?: string;
  @ApiPropertyOptional({ enum: CATEGORIES })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(Object.fromEntries(CATEGORIES.map((x) => [x, x])))
  category?: Category;
}
export class RetireStatusDto {
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID()
  replacementStatusId?: string;
}
export class ReorderStatusesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  statusIds!: string[];
}
