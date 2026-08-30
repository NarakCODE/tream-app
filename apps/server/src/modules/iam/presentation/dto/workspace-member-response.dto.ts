import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { WorkspaceMember } from '../../domain/workspace-membership';

export class WorkspaceMemberResponseDto {
  @ApiProperty({ example: 'mbr_01J8A4KS9VBD8XAADETY7SKHMA' })
  id!: string;

  @ApiProperty({ example: 'usr_01J8A4KS9VBD8XAADETY7SKHMA' })
  userId!: string;

  @ApiProperty({ enum: ['OWNER', 'ADMIN', 'MEMBER', 'GUEST'] })
  role!: WorkspaceMember['role'];

  @ApiProperty({ example: 'ada@example.com' })
  email!: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  fullName!: string;

  @ApiPropertyOptional({ nullable: true })
  avatarUrl!: string | null;

  @ApiProperty({ example: '2026-08-30T10:30:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-08-30T10:30:00.000Z' })
  updatedAt!: string;

  static fromEntity(member: WorkspaceMember): WorkspaceMemberResponseDto {
    return {
      id: member.id,
      userId: member.userId,
      role: member.role,
      email: member.user.email,
      fullName: member.user.fullName,
      avatarUrl: member.user.avatarUrl,
      createdAt: member.createdAt.toISOString(),
      updatedAt: member.updatedAt.toISOString(),
    };
  }
}
