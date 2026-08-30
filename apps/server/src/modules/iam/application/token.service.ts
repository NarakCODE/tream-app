import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { ulid } from 'ulid';
import type { ApplicationConfiguration } from '../../../config/configuration.interface';
import type { AuthUser } from '../domain/auth-user';
import { durationToMilliseconds, durationToSeconds } from './duration';

export interface OpaqueToken {
  raw: string;
  hash: string;
}

export interface AccessToken {
  value: string;
  expiresIn: number;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<ApplicationConfiguration, true>,
  ) {}

  async createAccessToken(user: AuthUser): Promise<AccessToken> {
    const expiresIn = durationToSeconds(
      this.config.getOrThrow('auth.jwt.accessTtl', { infer: true }),
    );
    const value = await this.jwtService.signAsync(
      {
        sub: user.id,
        typ: 'access',
        jti: `tok_${ulid()}`,
      },
      {
        secret: this.config.getOrThrow('auth.jwt.accessSecret', {
          infer: true,
        }),
        issuer: this.config.getOrThrow('auth.jwt.issuer', { infer: true }),
        audience: this.config.getOrThrow('auth.jwt.audience', { infer: true }),
        expiresIn,
      },
    );
    return { value, expiresIn };
  }

  createRefreshToken(): OpaqueToken {
    return this.createOpaqueToken('rfr');
  }

  createMagicLinkToken(): OpaqueToken {
    return this.createOpaqueToken('mag');
  }

  hashOpaqueToken(token: string): string {
    return createHash('sha256').update(token).digest('base64url');
  }

  getRefreshExpiration(now: Date): Date {
    return this.addDuration(
      now,
      this.config.getOrThrow('auth.jwt.refreshTtl', { infer: true }),
    );
  }

  getMagicLinkExpiration(now: Date): Date {
    return this.addDuration(
      now,
      this.config.getOrThrow('auth.magicLink.ttl', { infer: true }),
    );
  }

  private createOpaqueToken(prefix: string): OpaqueToken {
    const raw = `${prefix}_${randomBytes(32).toString('base64url')}`;
    return { raw, hash: this.hashOpaqueToken(raw) };
  }

  private addDuration(now: Date, duration: string): Date {
    return new Date(now.getTime() + durationToMilliseconds(duration));
  }
}
