import { ApiProperty } from '@nestjs/swagger';
import type { User } from '../entities/user.entity';

export class UserResponseDto {
  @ApiProperty({ example: 'usr_01J8A4KS9VBD8XAADETY7SKHMA' })
  id!: string;

  @ApiProperty({ example: 'ada@example.com', format: 'email' })
  email!: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  name!: string;

  @ApiProperty({ example: '2026-08-30T10:30:00.000Z', format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ example: '2026-08-30T10:30:00.000Z', format: 'date-time' })
  updatedAt!: string;

  static fromEntity(user: User): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }
}
