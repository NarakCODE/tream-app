import { Inject, Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import { AppErrorCode } from '../../../common/enums/app-error-code.enum';
import { AppException } from '../../../common/exceptions/app.exception';
import { HttpStatus } from '@nestjs/common';
import type { OAuthVault } from '../application/ports/oauth-vault.port';
import {
  isOAuthTokenBundle,
  type OAuthTokenBundle,
} from '../domain/oauth-token';
import {
  GMAIL_INTEGRATION_CONFIG,
  type GmailIntegrationConfig,
} from '../integrations.config';

const FORMAT_VERSION = 'v1';

@Injectable()
export class AesGcmOAuthVault implements OAuthVault {
  constructor(
    @Inject(GMAIL_INTEGRATION_CONFIG)
    private readonly config: GmailIntegrationConfig,
  ) {}

  encryptTokens(workspaceId: string, tokens: OAuthTokenBundle): string {
    return this.encrypt(workspaceId, JSON.stringify(tokens));
  }

  decryptTokens(workspaceId: string, encrypted: string): OAuthTokenBundle {
    let parsed: unknown;
    try {
      parsed = JSON.parse(this.decrypt(workspaceId, encrypted));
    } catch (error) {
      if (error instanceof AppException) throw error;
      throw this.invalidCiphertext();
    }
    if (!isOAuthTokenBundle(parsed)) throw this.invalidCiphertext();
    return parsed;
  }

  encryptSecret(workspaceId: string, secret: string): string {
    return this.encrypt(workspaceId, secret);
  }

  decryptSecret(workspaceId: string, encrypted: string): string {
    return this.decrypt(workspaceId, encrypted);
  }

  private encrypt(workspaceId: string, plaintext: string): string {
    const key = this.deriveKey(workspaceId);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(workspaceId, 'utf8'));
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [FORMAT_VERSION, iv, tag, ciphertext]
      .map((part) =>
        typeof part === 'string' ? part : part.toString('base64url'),
      )
      .join('.');
  }

  private decrypt(workspaceId: string, encrypted: string): string {
    const [version, ivValue, tagValue, ciphertextValue, extra] =
      encrypted.split('.');
    if (
      version !== FORMAT_VERSION ||
      ivValue === undefined ||
      tagValue === undefined ||
      ciphertextValue === undefined ||
      extra !== undefined
    ) {
      throw this.invalidCiphertext();
    }
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.deriveKey(workspaceId),
        Buffer.from(ivValue, 'base64url'),
      );
      decipher.setAAD(Buffer.from(workspaceId, 'utf8'));
      decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertextValue, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw this.invalidCiphertext();
    }
  }

  private deriveKey(workspaceId: string): Buffer {
    const configuredSecret = this.config.encryptionSecret.trim();
    if (configuredSecret.length < 32) {
      throw new AppException(
        AppErrorCode.ServiceUnavailable,
        'The integration credential vault is not configured.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return Buffer.from(
      hkdfSync(
        'sha256',
        Buffer.from(configuredSecret, 'utf8'),
        Buffer.from(workspaceId, 'utf8'),
        Buffer.from('tream:gmail-oauth:v1', 'utf8'),
        32,
      ),
    );
  }

  private invalidCiphertext(): AppException {
    return new AppException(
      AppErrorCode.InternalServerError,
      'Stored integration credentials could not be decrypted.',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
