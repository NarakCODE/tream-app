import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { ROLES, STATES } from '../../domain/permissions';
import type { WorkspaceRole, MembershipState } from '../../domain/permissions';
export class CreateWorkspaceDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  name!: string;
  @IsString()
  @Length(3, 60)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;
}
export class UpdateWorkspaceDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;
  @IsOptional() @IsIn(['archive', 'restore']) lifecycle?: 'archive' | 'restore';
}
export class UpdateMembershipDto {
  @IsOptional() @IsIn(ROLES) role?: WorkspaceRole;
  @IsOptional() @IsIn(STATES) state?: MembershipState;
}
export class CreateInvitationDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsIn(ROLES) role!: WorkspaceRole;
}
export class AcceptInvitationDto {
  @IsString() @Length(43, 43) @Matches(/^[A-Za-z0-9_-]+$/) token!: string;
}
export class UpdatePreferencesDto {
  @IsIn(['system', 'light', 'dark']) theme!: 'system' | 'light' | 'dark';
  @IsString() @Length(1, 100) timezone!: string;
}
