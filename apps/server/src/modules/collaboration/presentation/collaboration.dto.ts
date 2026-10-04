import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsHexColor,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
export class RevisionDto {
  @IsInt() @Min(1) expectedRevision!: number;
}
export class TargetDto {
  @IsIn([
    'issue',
    'project',
    'project_update',
    'initiative',
    'initiative_update',
  ])
  targetType!:
    'issue' | 'project' | 'project_update' | 'initiative' | 'initiative_update';
  @IsString() @MinLength(1) @MaxLength(100) targetId!: string;
}
export class CreateCommentDto extends TargetDto {
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(100, { each: true })
  mentionedMembershipIds?: string[];

  @IsString() @MinLength(1) @MaxLength(50000) body!: string;
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  parentCommentId?: string;
}
export class UpdateCommentDto extends RevisionDto {
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(100, { each: true })
  mentionedMembershipIds?: string[];

  @IsString() @MinLength(1) @MaxLength(50000) body!: string;
}
export class ReactionDto {
  @IsString() @MinLength(1) @MaxLength(32) emoji!: string;
}
export class CreateLabelDto {
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsHexColor() color!: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) teamId?:
    string | null;
  @IsOptional() @IsString() @MaxLength(5000) description?: string | null;
  @IsOptional() @IsString() @MaxLength(100) groupName?: string | null;
}
export class UpdateLabelDto extends RevisionDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) name?: string;
  @IsOptional() @IsHexColor() color?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) teamId?:
    string | null;
  @IsOptional() @IsString() @MaxLength(5000) description?: string | null;
  @IsOptional() @IsString() @MaxLength(100) groupName?: string | null;
}
export class LabelLinkDto {
  @IsString() @MinLength(1) @MaxLength(100) labelId!: string;
  @IsOptional() @IsInt() @Min(1) expectedRevision?: number;
}
export class LabelUnlinkDto {
  @IsOptional() @IsInt() @Min(1) expectedRevision?: number;
}
export class TemplateDefaultsDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) teamId?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) statusId?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) projectId?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) milestoneId?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) cycleId?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) assigneeId?: string;
  @IsOptional()
  @IsIn(['NO_PRIORITY', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  priority?: 'NO_PRIORITY' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  @IsOptional() @IsInt() @Min(0) @Max(1000) estimate?: number;
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(100, { each: true })
  labelIds?: string[];
}
export class CreateTemplateDto {
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) teamId?:
    string | null;
  @IsOptional() @IsString() @MaxLength(5000) description?: string | null;
  @IsOptional() @IsString() @MaxLength(500) titleTemplate?: string | null;
  @IsOptional() @IsString() @MaxLength(50000) bodyTemplate?: string | null;
  @IsOptional()
  @ValidateNested()
  @Type(() => TemplateDefaultsDto)
  defaults?: TemplateDefaultsDto;
}
export class UpdateTemplateDto extends RevisionDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) teamId?:
    string | null;
  @IsOptional() @IsString() @MaxLength(5000) description?: string | null;
  @IsOptional() @IsString() @MaxLength(500) titleTemplate?: string | null;
  @IsOptional() @IsString() @MaxLength(50000) bodyTemplate?: string | null;
  @IsOptional()
  @ValidateNested()
  @Type(() => TemplateDefaultsDto)
  defaults?: TemplateDefaultsDto;
}

export class InstantiateTemplateDto {
  @IsString() @MinLength(1) @MaxLength(100) teamId!: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(500) title?: string;
}
