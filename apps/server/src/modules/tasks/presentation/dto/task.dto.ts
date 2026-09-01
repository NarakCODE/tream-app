import { Transform } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CursorPaginationQueryDto } from '../../../../common/dto/cursor-pagination-query.dto';
import type { Task } from '../../domain/task';
import { TASK_STATUSES, type TaskStatus } from '../../domain/task';
import {
  TASK_PATCH_STATUSES,
  type TaskPatchStatus,
} from '../../domain/task-status-policy';

const trimText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class ListTasksQueryDto extends CursorPaginationQueryDto {
  @IsOptional()
  @IsIn(TASK_STATUSES)
  status?: TaskStatus;

  @IsOptional()
  @Matches(/^mbr_[0-9A-HJKMNP-TV-Z]{26}$/)
  assigneeId?: string;
}

export class CreateTaskDto {
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title!: string;

  @IsOptional()
  @Matches(/^con_[0-9A-HJKMNP-TV-Z]{26}$/)
  contactId?: string | null;

  @IsOptional()
  @Matches(/^del_[0-9A-HJKMNP-TV-Z]{26}$/)
  dealId?: string | null;

  @IsOptional()
  @Matches(/^mbr_[0-9A-HJKMNP-TV-Z]{26}$/)
  assigneeId?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  dueDate?: string | null;
}

export class UpdateTaskDto {
  @IsOptional()
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @Matches(/^con_[0-9A-HJKMNP-TV-Z]{26}$/)
  contactId?: string | null;

  @IsOptional()
  @Matches(/^del_[0-9A-HJKMNP-TV-Z]{26}$/)
  dealId?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  dueDate?: string | null;

  @IsOptional()
  @IsIn(TASK_PATCH_STATUSES)
  status?: TaskPatchStatus;
}

export class AssignTaskDto {
  @Matches(/^mbr_[0-9A-HJKMNP-TV-Z]{26}$/)
  memberId!: string;
}

export class TaskIdParamDto {
  @Matches(/^tsk_[0-9A-HJKMNP-TV-Z]{26}$/)
  taskId!: string;
}

export class TaskResponseDto {
  @ApiProperty({ example: 'tsk_01J8A4ZS9VBD8XAADETY7SKHMA' })
  id!: string;

  @ApiProperty({ example: 'ws_01J8A4MS9VBD8XAADETY7SKHMA' })
  workspaceId!: string;

  @ApiPropertyOptional({ nullable: true })
  contactId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  dealId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  assigneeId!: string | null;

  @ApiProperty({ example: 'Follow up with Ada' })
  title!: string;

  @ApiProperty({ enum: TASK_STATUSES })
  status!: TaskStatus;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  dueDate!: string | null;

  @ApiProperty({ example: '2026-08-30T10:30:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-08-30T10:30:00.000Z' })
  updatedAt!: string;

  @ApiPropertyOptional({ nullable: true })
  deletedAt!: string | null;

  static fromEntity(task: Task): TaskResponseDto {
    return {
      id: task.id,
      workspaceId: task.workspaceId,
      contactId: task.contactId,
      dealId: task.dealId,
      assigneeId: task.assigneeId,
      title: task.title,
      status: task.status,
      dueDate: task.dueDate?.toISOString() ?? null,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      deletedAt: task.deletedAt?.toISOString() ?? null,
    };
  }
}
