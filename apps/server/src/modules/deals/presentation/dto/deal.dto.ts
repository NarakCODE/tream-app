import { Transform } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CursorPaginationQueryDto } from '../../../../common/dto/cursor-pagination-query.dto';
import { DEAL_STAGES, type Deal, type DealStage } from '../../domain/deal';
import { normalizeCurrency, normalizeMoney } from '../../domain/money';

const trimText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const normalizeMoneyValue = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') {
    return value;
  }
  return normalizeMoney(value) ?? value.trim();
};

const normalizeCurrencyValue = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string'
    ? (normalizeCurrency(value) ?? value.trim().toUpperCase())
    : value;

export class CreateDealDto {
  @IsOptional()
  @Matches(/^cmp_[0-9A-HJKMNP-TV-Z]{26}$/)
  companyId?: string | null;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @Transform(normalizeMoneyValue)
  @Matches(/^(?:0|[1-9]\d{0,9})\.\d{2}$/)
  amount?: string;

  @IsOptional()
  @Transform(normalizeCurrencyValue)
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @IsOptional()
  @IsIn(DEAL_STAGES)
  stage?: DealStage;

  @IsOptional()
  @IsISO8601({ strict: true })
  closeDate?: string | null;
}

export class UpdateDealDto {
  @IsOptional()
  @Matches(/^cmp_[0-9A-HJKMNP-TV-Z]{26}$/)
  companyId?: string | null;

  @IsOptional()
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @Transform(normalizeMoneyValue)
  @Matches(/^(?:0|[1-9]\d{0,9})\.\d{2}$/)
  amount?: string;

  @IsOptional()
  @Transform(normalizeCurrencyValue)
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @IsOptional()
  @IsIn(DEAL_STAGES)
  stage?: DealStage;

  @IsOptional()
  @IsISO8601({ strict: true })
  closeDate?: string | null;
}

export class ListDealsQueryDto extends CursorPaginationQueryDto {
  @IsOptional()
  @IsIn(DEAL_STAGES)
  stage?: DealStage;

  @IsOptional()
  @Matches(/^cmp_[0-9A-HJKMNP-TV-Z]{26}$/)
  companyId?: string;
}

export class DealIdParamDto {
  @Matches(/^del_[0-9A-HJKMNP-TV-Z]{26}$/)
  dealId!: string;
}

export class DealContactParamDto extends DealIdParamDto {
  @Matches(/^con_[0-9A-HJKMNP-TV-Z]{26}$/)
  contactId!: string;
}

export class AddDealContactDto {
  @Matches(/^con_[0-9A-HJKMNP-TV-Z]{26}$/)
  contactId!: string;
}

export class DealResponseDto {
  @ApiProperty({ example: 'del_01J8A4ZS9VBD8XAADETY7SKHMA' })
  id!: string;

  @ApiProperty({ example: 'ws_01J8A4MS9VBD8XAADETY7SKHMA' })
  workspaceId!: string;

  @ApiPropertyOptional({ nullable: true })
  companyId!: string | null;

  @ApiProperty({ example: 'Enterprise renewal' })
  title!: string;

  @ApiProperty({ example: '12500.00' })
  amount!: string;

  @ApiProperty({ example: 'USD' })
  currency!: string;

  @ApiProperty({ enum: DEAL_STAGES })
  stage!: DealStage;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  closeDate!: string | null;

  @ApiProperty({ example: '2026-08-30T10:30:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-08-30T10:30:00.000Z' })
  updatedAt!: string;

  @ApiPropertyOptional({ nullable: true })
  deletedAt!: string | null;

  static fromEntity(deal: Deal): DealResponseDto {
    return {
      id: deal.id,
      workspaceId: deal.workspaceId,
      companyId: deal.companyId,
      title: deal.title,
      amount: normalizeMoney(deal.amount) ?? deal.amount,
      currency: deal.currency,
      stage: deal.stage,
      closeDate: deal.closeDate?.toISOString() ?? null,
      createdAt: deal.createdAt.toISOString(),
      updatedAt: deal.updatedAt.toISOString(),
      deletedAt: deal.deletedAt?.toISOString() ?? null,
    };
  }
}
