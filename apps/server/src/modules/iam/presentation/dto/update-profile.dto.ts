import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  fullName?: string;

  @IsOptional()
  @ValidateIf((_object: UpdateProfileDto, value: unknown) => value !== null)
  @IsString()
  @MaxLength(2_048)
  @IsUrl({ require_protocol: true })
  avatarUrl?: string | null;
}
