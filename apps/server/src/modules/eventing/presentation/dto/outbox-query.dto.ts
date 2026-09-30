import { IsIn, IsOptional } from 'class-validator';
import { CursorPaginationQueryDto } from '../../../../common/dto/cursor-pagination-query.dto';
export class OutboxQueryDto extends CursorPaginationQueryDto {
  @IsOptional() @IsIn(['FAILED', 'QUARANTINED']) status?:
    'FAILED' | 'QUARANTINED';
}
