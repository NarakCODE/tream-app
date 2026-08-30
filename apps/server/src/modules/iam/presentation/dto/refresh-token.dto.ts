import { IsString, Matches } from 'class-validator';

export class RefreshTokenDto {
  @IsString()
  @Matches(/^rfr_[A-Za-z0-9_-]{40,}$/)
  refreshToken!: string;
}
