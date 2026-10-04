import {
  ApiProperty,
  ApiPropertyOptional,
  PartialType,
  OmitType,
} from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateBy,
  ValidateIf,
} from 'class-validator';
import {
  PROJECT_CATEGORIES,
  PROJECT_HEALTH,
  isCalendarDate,
  type ProjectCategory,
} from '../domain/project-policy';
const optional = (_: unknown, value: unknown) => value !== undefined;
const nullable = (_: unknown, value: unknown) =>
  value !== undefined && value !== null;
function CalendarDate() {
  return ValidateBy({
    name: 'calendarDate',
    validator: {
      validate: (value: unknown) =>
        typeof value === 'string' && isCalendarDate(value),
      defaultMessage: () =>
        'Date must be a valid calendar date in YYYY-MM-DD format.',
    },
  });
}
export class ProjectFieldsDto {
  @ApiPropertyOptional()
  @ValidateIf(optional)
  @IsString()
  @Matches(/\S/)
  @MaxLength(200)
  name?: string;
  @ApiPropertyOptional({ nullable: true })
  @ValidateIf(nullable)
  @IsString()
  @MaxLength(2000)
  summary?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @ValidateIf(nullable)
  @IsString()
  @MaxLength(100000)
  description?: string | null;
  @ApiPropertyOptional() @ValidateIf(optional) @IsUUID() statusId?: string;
  @ApiPropertyOptional()
  @ValidateIf(optional)
  @IsEnum({
    NO_PRIORITY: 'NO_PRIORITY',
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    URGENT: 'URGENT',
  })
  priority?: 'NO_PRIORITY' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  @ApiPropertyOptional({ nullable: true })
  @ValidateIf(nullable)
  @IsUUID()
  leadId?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @ValidateIf(nullable)
  @CalendarDate()
  startDate?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @ValidateIf(nullable)
  @CalendarDate()
  targetDate?: string | null;
}
export class CreateProjectDto extends OmitType(ProjectFieldsDto, [
  'name',
] as const) {
  @ApiProperty()
  @IsString()
  @Matches(/\S/)
  @MaxLength(200)
  declare name: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  teamIds!: string[];
}
export class UpdateProjectDto extends ProjectFieldsDto {}
export class AddProjectTeamDto {
  @ApiProperty() @IsUUID() teamId!: string;
}
export class AddProjectMemberDto {
  @ApiProperty() @IsUUID() membershipId!: string;
}
export class CreateProjectStatusDto {
  @ApiProperty() @IsString() @Matches(/\S/) @MaxLength(100) name!: string;
  @ApiProperty({ enum: PROJECT_CATEGORIES })
  @IsEnum(Object.fromEntries(PROJECT_CATEGORIES.map((x) => [x, x])))
  category!: ProjectCategory;
  @ApiPropertyOptional({ nullable: true })
  @ValidateIf(nullable)
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string | null;
}
export class UpdateProjectStatusDto extends PartialType(
  CreateProjectStatusDto,
  { skipNullProperties: false },
) {}
export class ReorderProjectStatusesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  statusIds!: string[];
}
export class RetireProjectStatusDto {
  @ApiPropertyOptional()
  @ValidateIf(optional)
  @IsUUID()
  replacementStatusId?: string;
}
export class CreateMilestoneDto {
  @ApiProperty() @IsString() @Matches(/\S/) @MaxLength(200) name!: string;
  @ApiPropertyOptional({ nullable: true })
  @ValidateIf(nullable)
  @IsString()
  @MaxLength(10000)
  description?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @ValidateIf(nullable)
  @CalendarDate()
  targetDate?: string | null;
}
export class UpdateMilestoneDto extends PartialType(CreateMilestoneDto, {
  skipNullProperties: false,
}) {}
export class ReorderMilestonesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  milestoneIds!: string[];
}
export class CreateProjectUpdateDto {
  @ApiProperty() @IsString() @Matches(/\S/) @MaxLength(100000) body!: string;
  @ApiProperty({ enum: PROJECT_HEALTH })
  @IsEnum(Object.fromEntries(PROJECT_HEALTH.map((x) => [x, x])))
  health!: (typeof PROJECT_HEALTH)[number];
}
