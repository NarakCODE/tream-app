import {
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
  IsOptional,
} from 'class-validator';
export class EmailDto {
  @IsEmail() @MaxLength(254) email!: string;
}
export class LoginDto extends EmailDto {
  @IsString() @MinLength(1) @MaxLength(256) password!: string;
}
export class SignupDto extends EmailDto {
  @IsString() @MinLength(12) @MaxLength(256) password!: string;
  @IsString() @MinLength(1) @MaxLength(120) fullName!: string;
}
export class TokenDto {
  @IsString() @MinLength(32) @MaxLength(256) token!: string;
}
export class RefreshDto {
  @IsOptional()
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  refreshToken?: string;
}
export class ResetDto extends TokenDto {
  @IsString() @MinLength(12) @MaxLength(256) password!: string;
}
export class ProfileDto {
  @IsString() @MinLength(1) @MaxLength(120) fullName!: string;
}
