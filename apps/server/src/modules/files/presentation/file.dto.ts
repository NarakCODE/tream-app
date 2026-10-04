import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CursorPaginationQueryDto } from '../../../common/dto/cursor-pagination-query.dto';
export class FileTargetDto {
  @IsIn(['issue', 'project', 'comment', 'document']) targetType!:
    'issue' | 'project' | 'comment' | 'document';
  @IsString() @MinLength(1) @MaxLength(100) targetId!: string;
}
export class UploadIntentDto extends FileTargetDto {
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsString() @MinLength(1) @MaxLength(100) mimeType!: string;
  @IsInt() @Min(1) @Max(26214400) sizeBytes!: number;
  @IsString() @Matches(/^[a-f0-9]{64}$/) sha256!: string;
}
export class FileRevisionDto {
  @IsInt() @Min(1) expectedRevision!: number;
}
export class FinalizeFileDto extends FileRevisionDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) sha256!: string;
}
export class DownloadGrantDto {
  @IsString() @MinLength(1) @MaxLength(100) attachmentId!: string;
}
export class AttachmentDto extends FileTargetDto {
  @IsString() @MinLength(1) @MaxLength(100) fileId!: string;
  @IsInt() @Min(1) expectedRevision!: number;
}
export class AttachmentListDto extends CursorPaginationQueryDto {
  @IsIn(['issue', 'project', 'comment', 'document'])
  targetType!: FileTargetDto['targetType'];
  @IsString() @MinLength(1) @MaxLength(100) targetId!: string;
}
export class FileReadDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) attachmentId?: string;
}
export class FileGrantQueryDto {
  @IsString() @MinLength(1) @MaxLength(4000) grant!: string;
}
