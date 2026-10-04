import { OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsString,
  Matches,
  MaxLength,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
export class ViewPaginationDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(4096)
  cursor?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}
export class CreateViewDto {
  @IsString() @Matches(/\S/) @MaxLength(200) name!: string;
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsString()
  @MaxLength(2000)
  description?: string | null;
  @IsIn(['ISSUES', 'PROJECTS']) resource!: 'ISSUES' | 'PROJECTS';
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['PRIVATE', 'WORKSPACE'])
  visibility?: 'PRIVATE' | 'WORKSPACE';
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsString()
  @MaxLength(128)
  teamId?: string | null;
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsString()
  @MaxLength(128)
  projectId?: string | null;
  @IsObject() filters!: Record<string, unknown>;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsObject()
  display?: Record<string, unknown>;
}
export class UpdateViewDto extends PartialType(
  OmitType(CreateViewDto, ['resource'] as const),
  { skipNullProperties: false },
) {
  @IsInt() @Min(1) expectedRevision!: number;
}
export class ViewRevisionDto {
  @IsInt() @Min(1) expectedRevision!: number;
}
export class ViewListDto extends ViewPaginationDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['ISSUES', 'PROJECTS'])
  resource?: 'ISSUES' | 'PROJECTS';
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['active', 'archived', 'deleted'])
  lifecycle: 'active' | 'archived' | 'deleted' = 'active';
}
export class QueryViewDto extends ViewPaginationDto {
  @IsIn(['ISSUES', 'PROJECTS']) resource!: 'ISSUES' | 'PROJECTS';
  @IsObject() filters!: Record<string, unknown>;
}
export class SearchDto extends ViewPaginationDto {
  @IsString() @Matches(/\S/) @MaxLength(100) q!: string;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['ALL', 'ISSUES', 'PROJECTS', 'DOCUMENTS'])
  resource: 'ALL' | 'ISSUES' | 'PROJECTS' | 'DOCUMENTS' = 'ALL';
}
export class CreateFavoriteDto {
  @IsIn(['issue', 'project', 'team', 'initiative', 'view']) targetType!:
    'issue' | 'project' | 'team' | 'initiative' | 'view';
  @IsString() @Matches(/^[A-Za-z0-9_-]+$/) @MaxLength(128) targetId!: string;
}
export class FavoriteOrderItem {
  @IsString() @MaxLength(128) id!: string;
  @IsInt() @Min(1) expectedRevision!: number;
}
export class ReorderFavoritesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => FavoriteOrderItem)
  items!: FavoriteOrderItem[];
}
