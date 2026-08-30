import { IsEnum, IsOptional, IsString } from 'class-validator';
import { SortOrder } from '../enums/sort-order.enum';

export class BaseSortQueryDto<T extends object> {
  @IsOptional()
  @IsString()
  sortBy?: Extract<keyof T, string>;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder: SortOrder = SortOrder.Desc;
}
