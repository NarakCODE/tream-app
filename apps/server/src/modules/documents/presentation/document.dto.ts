import {
  IsInt,
  Min,
  IsString,
  Matches,
  MaxLength,
  IsIn,
  ValidateIf,
  ValidateBy,
} from 'class-validator';
import { PartialType, OmitType } from '@nestjs/swagger';
import { CursorPaginationQueryDto } from '../../../common/dto/cursor-pagination-query.dto';
export class DocumentRevisionDto {
  @IsInt() @Min(1) expectedRevision!: number;
}
export class CreateDocumentDto {
  @IsIn(['project', 'team', 'initiative']) ownerType!:
    'project' | 'team' | 'initiative';
  @IsString() @Matches(/\S/) @MaxLength(100) ownerId!: string;
  @IsString() @Matches(/\S/) @MaxLength(200) title!: string;
  @IsString()
  @ValidateBy({
    name: 'plainDocumentBody',
    validator: {
      validate: (v: unknown) =>
        typeof v === 'string' && !v.includes(String.fromCharCode(0)),
    },
  })
  @MaxLength(100000)
  body!: string;
}
export class UpdateDocumentDto extends PartialType(
  OmitType(CreateDocumentDto, ['ownerType', 'ownerId'] as const),
  { skipNullProperties: false },
) {
  @IsInt() @Min(1) expectedRevision!: number;
}
export class DocumentListDto extends CursorPaginationQueryDto {
  @ValidateIf((_: unknown, v: unknown) => v !== undefined)
  @IsIn(['project', 'team', 'initiative'])
  ownerType?: CreateDocumentDto['ownerType'];
  @ValidateIf((_: unknown, v: unknown) => v !== undefined)
  @IsString()
  @MaxLength(100)
  ownerId?: string;
  @ValidateIf((_: unknown, v: unknown) => v !== undefined)
  @IsIn(['active', 'archived', 'deleted'])
  lifecycle: 'active' | 'archived' | 'deleted' = 'active';
}
