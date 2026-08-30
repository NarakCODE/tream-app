import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength } from 'class-validator';

export class RequestMagicLinkDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class VerifyMagicLinkDto {
  @IsString()
  @Matches(/^mag_[A-Za-z0-9_-]{40,}$/)
  token!: string;
}
