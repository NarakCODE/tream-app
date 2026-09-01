import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, Matches } from 'class-validator';
import { CursorPaginationQueryDto } from '../../../../common/dto/cursor-pagination-query.dto';
import type { EventDispatchAttempt } from '../../domain/event-dispatch';
import {
  EVENT_DISPATCH_STATUSES,
  type EventDispatchStatus,
} from '../../domain/event-dispatch';
import {
  EVENT_TYPES,
  type EventType,
  type StoredEvent,
} from '../../domain/event';

export class ListEventsQueryDto extends CursorPaginationQueryDto {
  @IsOptional()
  @IsIn(EVENT_TYPES)
  eventType?: EventType;

  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  to?: string;
}

export class EventIdParamDto {
  @Matches(/^evt_[0-9A-HJKMNP-TV-Z]{26}$/)
  eventId!: string;
}

export class EventResponseDto {
  @ApiProperty({ example: 'evt_01J8A4ZS9VBD8XAADETY7SKHMA' })
  id!: string;

  @ApiProperty({ example: 'ws_01J8A4MS9VBD8XAADETY7SKHMA' })
  workspaceId!: string;

  @ApiProperty({ enum: EVENT_TYPES, example: 'contact.created' })
  eventType!: EventType;

  @ApiProperty({ type: 'object', additionalProperties: true })
  payload!: Record<string, unknown>;

  @ApiPropertyOptional({ nullable: true })
  idempotencyKey!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  static fromEntity(event: StoredEvent): EventResponseDto {
    return {
      ...event,
      createdAt: event.createdAt.toISOString(),
    };
  }
}

export class EventDispatchResponseDto {
  @ApiProperty({ example: 'edp_01J8A4ZS9VBD8XAADETY7SKHMA' })
  id!: string;

  @ApiProperty({ example: 'evt_01J8A4ZS9VBD8XAADETY7SKHMA' })
  eventId!: string;

  @ApiProperty({ enum: EVENT_DISPATCH_STATUSES })
  status!: EventDispatchStatus;

  @ApiProperty({ example: 0 })
  attemptCount!: number;

  @ApiProperty({ format: 'date-time' })
  availableAt!: string;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  lockedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  lockedBy!: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  completedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  lastError!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  static fromEntity(attempt: EventDispatchAttempt): EventDispatchResponseDto {
    return {
      ...attempt,
      availableAt: attempt.availableAt.toISOString(),
      lockedAt: attempt.lockedAt?.toISOString() ?? null,
      completedAt: attempt.completedAt?.toISOString() ?? null,
      createdAt: attempt.createdAt.toISOString(),
      updatedAt: attempt.updatedAt.toISOString(),
    };
  }
}
