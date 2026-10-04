import { IsIn, IsOptional } from 'class-validator';
import { CursorPaginationQueryDto } from '../../../common/dto/cursor-pagination-query.dto';
export class TrashQueryDto extends CursorPaginationQueryDto {
  @IsOptional()
  @IsIn([
    'issue',
    'project',
    'document',
    'initiative',
    'view',
    'comment',
    'file',
  ])
  resourceType?: string;
}
