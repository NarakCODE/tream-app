import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CursorPaginationQueryDto } from '../../../common/dto/cursor-pagination-query.dto';
export class AuditQueryDto extends CursorPaginationQueryDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) targetType?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(128) targetId?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(128) actorId?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(128) action?: string;
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  correlationId?: string;
}
