import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { AuthSession } from '../../application/auth.service';
import type { AuthUser, AuthenticatedUser } from '../../domain/auth-user';

type SafeUser = AuthUser | AuthenticatedUser;

export class AuthUserResponseDto {
  @ApiProperty({ example: 'usr_01J8A4KS9VBD8XAADETY7SKHMA' })
  id!: string;

  @ApiProperty({ example: 'ada@example.com', format: 'email' })
  email!: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  fullName!: string;

  @ApiPropertyOptional({
    example: 'https://example.com/avatar.png',
    nullable: true,
  })
  avatarUrl!: string | null;

  @ApiProperty({ example: '2026-08-30T10:30:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-08-30T10:30:00.000Z' })
  updatedAt!: string;

  static fromEntity(user: SafeUser): AuthUserResponseDto {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }
}

export class AuthSessionResponseDto {
  @ApiProperty({ type: AuthUserResponseDto })
  user!: AuthUserResponseDto;

  @ApiProperty({ description: 'Short-lived bearer JWT.' })
  accessToken!: string;

  @ApiProperty({ description: 'Opaque rotating refresh token.' })
  refreshToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: 'Bearer';

  @ApiProperty({
    example: 900,
    description: 'Access-token lifetime in seconds.',
  })
  expiresIn!: number;

  static fromSession(session: AuthSession): AuthSessionResponseDto {
    return {
      user: AuthUserResponseDto.fromEntity(session.user),
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      tokenType: 'Bearer',
      expiresIn: session.expiresIn,
    };
  }
}

export class MagicLinkAcceptedResponseDto {
  @ApiProperty({ example: true })
  accepted!: true;
}
