import { Test } from '@nestjs/testing';
import { GMAIL_INTEGRATION_CONFIG } from '../integrations.config';
import { AesGcmOAuthVault } from './aes-gcm-oauth.vault';

describe('AesGcmOAuthVault', () => {
  let vault: AesGcmOAuthVault;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AesGcmOAuthVault,
        {
          provide: GMAIL_INTEGRATION_CONFIG,
          useValue: {
            clientId: 'client',
            clientSecret: 'secret',
            redirectUri: 'https://app.example.test/callback',
            encryptionSecret:
              'a-production-secret-must-be-longer-than-thirty-two-bytes',
          },
        },
      ],
    }).compile();
    vault = module.get(AesGcmOAuthVault);
  });

  it('round-trips tokens without storing plaintext', () => {
    const tokens = {
      accessToken: 'access-secret',
      refreshToken: 'refresh-secret',
      tokenType: 'Bearer',
      scopes: ['gmail.modify'],
      expiresAt: '2026-08-30T12:00:00.000Z',
    };
    const encrypted = vault.encryptTokens('ws_one', tokens);

    expect(encrypted).not.toContain('access-secret');
    expect(vault.decryptTokens('ws_one', encrypted)).toEqual(tokens);
  });

  it('derives tenant-isolated keys', () => {
    const encrypted = vault.encryptSecret('ws_one', 'code-verifier');

    expect(() => vault.decryptSecret('ws_two', encrypted)).toThrow(
      'could not be decrypted',
    );
  });

  it('rejects tampered ciphertext', () => {
    const encrypted = vault.encryptSecret('ws_one', 'code-verifier');
    const parts = encrypted.split('.');
    expect(parts).toHaveLength(4);
    const ciphertext = Buffer.from(parts[3] as string, 'base64url');
    ciphertext[0] = (ciphertext[0] ?? 0) ^ 1;
    parts[3] = ciphertext.toString('base64url');
    const tampered = parts.join('.');

    expect(() => vault.decryptSecret('ws_one', tampered)).toThrow(
      'could not be decrypted',
    );
  });
});
