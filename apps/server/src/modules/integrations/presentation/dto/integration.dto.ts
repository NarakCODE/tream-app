import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { PublicIntegration } from '../../domain/integration';
import {
  INTEGRATION_PROVIDERS,
  INTEGRATION_STATUSES,
} from '../../domain/integration';
import type {
  EmailAddress,
  NormalizedDraft,
  NormalizedEmail,
  NormalizedEmailAttachment,
  NormalizedEmailThread,
} from '../../domain/normalized-email';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const normalizeEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class IntegrationIdParamDto {
  @Matches(/^int_[0-9A-HJKMNP-TV-Z]{26}$/)
  integrationId!: string;
}

export class GmailResourceParamDto extends IntegrationIdParamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  messageId!: string;
}

export class GmailThreadParamDto extends IntegrationIdParamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  threadId!: string;
}

export class GmailDraftParamDto extends IntegrationIdParamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  draftId!: string;
}

export class GmailCallbackQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  state!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  code!: string;
}

export class SearchEmailsQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  query?: string;

  @IsOptional()
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  from?: string;

  @IsOptional()
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  to?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  after?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  before?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}

export class EmailContentsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((item: unknown) =>
          typeof item === 'string' ? item.trim().toLowerCase() : item,
        )
      : value,
  )
  @IsEmail({}, { each: true })
  to!: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsEmail({}, { each: true })
  cc?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsEmail({}, { each: true })
  bcc?: string[];

  @Transform(trim)
  @IsString()
  @MaxLength(998)
  subject!: string;

  @IsString()
  @MaxLength(1_000_000)
  body!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  threadId?: string;
}

export class UpdateEmailDraftDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsEmail({}, { each: true })
  to?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsEmail({}, { each: true })
  cc?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsEmail({}, { each: true })
  bcc?: string[];

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(998)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1_000_000)
  body?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  threadId?: string;
}

export class IntegrationProviderListDto {
  @ApiProperty({ enum: INTEGRATION_PROVIDERS, isArray: true })
  providers!: string[];
}

export class OAuthAuthorizationResponseDto {
  @ApiProperty({ format: 'uri' })
  authorizationUrl!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;
}

export class IntegrationResponseDto {
  @ApiProperty({ example: 'int_01J8A4WS9VBD8XAADETY7SKHMA' })
  id!: string;

  @ApiProperty({ example: 'ws_01J8A4MS9VBD8XAADETY7SKHMA' })
  workspaceId!: string;

  @ApiProperty({ enum: INTEGRATION_PROVIDERS })
  provider!: string;

  @ApiProperty({ format: 'email' })
  accountEmail!: string;

  @ApiProperty({ type: [String] })
  grantedScopes!: string[];

  @ApiProperty({ enum: INTEGRATION_STATUSES })
  status!: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  lastTestedAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  static fromEntity(
    this: void,
    integration: PublicIntegration,
  ): IntegrationResponseDto {
    return {
      id: integration.id,
      workspaceId: integration.workspaceId,
      provider: integration.provider,
      accountEmail: integration.accountEmail,
      grantedScopes: integration.grantedScopes,
      status: integration.status,
      lastTestedAt: integration.lastTestedAt?.toISOString() ?? null,
      createdAt: integration.createdAt.toISOString(),
      updatedAt: integration.updatedAt.toISOString(),
    };
  }
}

export class EmailAddressResponseDto implements EmailAddress {
  @ApiPropertyOptional({ nullable: true })
  name!: string | null;

  @ApiProperty({ format: 'email' })
  address!: string;
}

export class EmailAttachmentResponseDto implements NormalizedEmailAttachment {
  @ApiProperty()
  filename!: string;

  @ApiProperty()
  mimeType!: string;

  @ApiProperty()
  size!: number;

  @ApiPropertyOptional({ nullable: true })
  attachmentId!: string | null;
}

export class NormalizedEmailResponseDto implements NormalizedEmail {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  threadId!: string;
  @ApiPropertyOptional({ type: EmailAddressResponseDto, nullable: true })
  from!: EmailAddress | null;
  @ApiProperty({ type: [EmailAddressResponseDto] })
  to!: EmailAddress[];
  @ApiProperty({ type: [EmailAddressResponseDto] })
  cc!: EmailAddress[];
  @ApiProperty({ type: [EmailAddressResponseDto] })
  bcc!: EmailAddress[];
  @ApiProperty()
  subject!: string;
  @ApiPropertyOptional({ nullable: true })
  textBody!: string | null;
  @ApiPropertyOptional({ nullable: true })
  htmlBody!: string | null;
  @ApiProperty()
  snippet!: string;
  @ApiProperty({ type: [String] })
  labels!: string[];
  @ApiProperty({ type: [EmailAttachmentResponseDto] })
  attachments!: NormalizedEmailAttachment[];
  @ApiProperty({ format: 'date-time' })
  sentAt!: string;

  static fromEntity(
    this: void,
    email: NormalizedEmail,
  ): NormalizedEmailResponseDto {
    return { ...email };
  }
}

export class NormalizedEmailListResponseDto {
  @ApiProperty({ type: [NormalizedEmailResponseDto] })
  items!: NormalizedEmailResponseDto[];
}

export class NormalizedThreadResponseDto implements NormalizedEmailThread {
  @ApiProperty()
  id!: string;
  @ApiProperty({ type: [NormalizedEmailResponseDto] })
  messages!: NormalizedEmail[];
}

export class NormalizedDraftResponseDto implements NormalizedDraft {
  @ApiProperty()
  id!: string;
  @ApiProperty({ type: NormalizedEmailResponseDto })
  message!: NormalizedEmail;
}
