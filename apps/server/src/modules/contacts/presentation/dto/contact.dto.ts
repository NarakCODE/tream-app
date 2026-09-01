import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Contact } from '../../domain/contact';
import { CONTACT_STATUSES, type ContactStatus } from '../../domain/contact';

const normalizeEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

const trimText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateContactDto {
  @IsOptional()
  @Matches(/^cmp_[0-9A-HJKMNP-TV-Z]{26}$/)
  companyId?: string | null;

  @IsOptional()
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName?: string | null;

  @IsOptional()
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName?: string | null;

  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsOptional()
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  phone?: string | null;

  @IsOptional()
  @IsIn(CONTACT_STATUSES)
  status?: ContactStatus;

  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>;
}

export class UpdateContactDto {
  @IsOptional()
  @Matches(/^cmp_[0-9A-HJKMNP-TV-Z]{26}$/)
  companyId?: string | null;

  @IsOptional()
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName?: string | null;

  @IsOptional()
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName?: string | null;

  @IsOptional()
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  phone?: string | null;

  @IsOptional()
  @IsIn(CONTACT_STATUSES)
  status?: ContactStatus;

  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>;
}

export class ContactIdParamDto {
  @Matches(/^con_[0-9A-HJKMNP-TV-Z]{26}$/)
  contactId!: string;
}

export class ContactEmailParamDto {
  @IsString()
  workspaceId!: string;

  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class ContactResponseDto {
  @ApiProperty({ example: 'con_01J8A4WS9VBD8XAADETY7SKHMA' })
  id!: string;

  @ApiProperty({ example: 'ws_01J8A4MS9VBD8XAADETY7SKHMA' })
  workspaceId!: string;

  @ApiPropertyOptional({ nullable: true })
  companyId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  firstName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  lastName!: string | null;

  @ApiProperty({ format: 'email', example: 'ada@example.com' })
  email!: string;

  @ApiPropertyOptional({ nullable: true })
  phone!: string | null;

  @ApiProperty({ enum: CONTACT_STATUSES })
  status!: ContactStatus;

  @ApiProperty({ example: {} })
  attributes!: Record<string, unknown>;

  @ApiProperty({ example: '2026-08-30T10:30:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-08-30T10:30:00.000Z' })
  updatedAt!: string;

  @ApiPropertyOptional({ nullable: true })
  deletedAt!: string | null;

  static fromEntity(contact: Contact): ContactResponseDto {
    return {
      id: contact.id,
      workspaceId: contact.workspaceId,
      companyId: contact.companyId,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      phone: contact.phone,
      status: contact.status,
      attributes: contact.attributes,
      createdAt: contact.createdAt.toISOString(),
      updatedAt: contact.updatedAt.toISOString(),
      deletedAt: contact.deletedAt?.toISOString() ?? null,
    };
  }
}
