import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  canonicalizeDomainValue,
  IsCanonicalDomain,
} from '../../../../common/normalization/domain';
import type { Company } from '../../domain/company';

const trimText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateCompanyDto {
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @Transform(canonicalizeDomainValue)
  @IsCanonicalDomain()
  domain?: string | null;

  @IsOptional()
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  industry?: string | null;
}

export class UpdateCompanyDto {
  @IsOptional()
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @Transform(canonicalizeDomainValue)
  @IsCanonicalDomain()
  domain?: string | null;

  @IsOptional()
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  industry?: string | null;
}

export class CompanyIdParamDto {
  @Matches(/^cmp_[0-9A-HJKMNP-TV-Z]{26}$/)
  companyId!: string;
}

export class CompanyDomainParamDto {
  @IsString()
  workspaceId!: string;

  @Transform(canonicalizeDomainValue)
  @IsCanonicalDomain()
  domain!: string;
}

export class CompanyResponseDto {
  @ApiProperty({ example: 'cmp_01J8A4XS9VBD8XAADETY7SKHMA' })
  id!: string;

  @ApiProperty({ example: 'ws_01J8A4MS9VBD8XAADETY7SKHMA' })
  workspaceId!: string;

  @ApiProperty({ example: 'Acme Inc.' })
  name!: string;

  @ApiPropertyOptional({ nullable: true, example: 'acme.example' })
  domain!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Software' })
  industry!: string | null;

  @ApiProperty({ example: '2026-08-30T10:30:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-08-30T10:30:00.000Z' })
  updatedAt!: string;

  @ApiPropertyOptional({ nullable: true })
  deletedAt!: string | null;

  static fromEntity(company: Company): CompanyResponseDto {
    return {
      id: company.id,
      workspaceId: company.workspaceId,
      name: company.name,
      domain: company.domain,
      industry: company.industry,
      createdAt: company.createdAt.toISOString(),
      updatedAt: company.updatedAt.toISOString(),
      deletedAt: company.deletedAt?.toISOString() ?? null,
    };
  }
}
