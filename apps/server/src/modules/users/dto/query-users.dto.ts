import { IsIn, IsOptional, IsString } from 'class-validator';
import { SortOrder } from '../../../common/enums/sort-order.enum';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export type UserSortField = 'createdAt' | 'email' | 'name';

export class QueryUsersDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['createdAt', 'email', 'name'])
  declare sortBy?: UserSortField;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn([SortOrder.Asc, SortOrder.Desc])
  sortOrder: SortOrder = SortOrder.Desc;
}
