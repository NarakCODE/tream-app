import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  Min,
  ValidateIf,
} from 'class-validator';
import { CursorPaginationQueryDto } from '../../../common/dto/cursor-pagination-query.dto';
export class NotificationListDto extends CursorPaginationQueryDto {
  @IsOptional() @IsIn(['inbox', 'archived', 'snoozed', 'all']) status:
    'inbox' | 'archived' | 'snoozed' | 'all' = 'inbox';
  @IsOptional() @IsIn(['true', 'false']) unread?: 'true' | 'false';
}
export class NotificationRevisionDto {
  @IsInt() @Min(1) expectedRevision!: number;
}
export class NotificationReadDto extends NotificationRevisionDto {
  @IsBoolean() read!: boolean;
}
export class NotificationArchiveDto extends NotificationRevisionDto {
  @IsBoolean() archived!: boolean;
}
export class NotificationSnoozeDto extends NotificationRevisionDto {
  @ValidateIf((_o: unknown, value: unknown) => value !== null)
  @IsISO8601({ strict: true })
  snoozedUntil!: string | null;
}
export class NotificationPreferencesDto {
  @IsInt() @Min(0) expectedRevision!: number;
  @IsOptional() @IsBoolean() inAppEnabled?: boolean;
  @IsOptional() @IsBoolean() emailEnabled?: boolean;
}
export class RetryDeliveryDto {
  @IsBoolean() acknowledgePossibleDuplicate!: boolean;
}
