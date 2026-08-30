import { Transform } from 'class-transformer';
import {
  IsIn,
  IsEmail,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { Workspace } from '../../domain/workspace';
import {
  WORKSPACE_ROLES,
  type WorkspaceRole,
} from '../../domain/workspace-membership';

const normalizeSlug = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

const trimValue = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateWorkspaceDto {
  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  name!: string;

  @Transform(normalizeSlug)
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @Length(2, 64)
  slug!: string;
}

export class UpdateWorkspaceDto {
  @Transform(trimValue)
  @ValidateIf((value: UpdateWorkspaceDto) => value.name !== undefined)
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  name?: string;

  @Transform(normalizeSlug)
  @ValidateIf((value: UpdateWorkspaceDto) => value.slug !== undefined)
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @Length(2, 64)
  slug?: string;

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}

export class WorkspaceResponseDto {
  @ApiProperty({ example: 'ws_01J8A4KS9VBD8XAADETY7SKHMA' })
  id!: string;

  @ApiProperty({ example: 'Engineering' })
  name!: string;

  @ApiProperty({ example: 'engineering' })
  slug!: string;

  @ApiProperty({ example: {} })
  settings!: Record<string, unknown>;

  @ApiProperty({ example: '2026-08-30T10:30:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-08-30T10:30:00.000Z' })
  updatedAt!: string;

  static fromEntity(workspace: Workspace): WorkspaceResponseDto {
    return {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      settings: workspace.settings,
      createdAt: workspace.createdAt.toISOString(),
      updatedAt: workspace.updatedAt.toISOString(),
    };
  }
}

export class AddWorkspaceMemberDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsIn(['ADMIN', 'MEMBER', 'GUEST'])
  role!: Exclude<WorkspaceRole, 'OWNER'>;
}

export class UpdateWorkspaceMemberDto {
  @IsIn(WORKSPACE_ROLES)
  role!: WorkspaceRole;
}
