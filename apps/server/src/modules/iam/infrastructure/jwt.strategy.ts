import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { ApplicationConfiguration } from '../../../config/configuration.interface';
import type { AuthenticatedUser } from '../domain/auth-user';
import { toAuthenticatedUser } from '../domain/auth-user';
import { AuthenticationException } from '../application/authentication.exception';
import {
  AUTH_REPOSITORY,
  type AuthRepository,
} from '../application/ports/auth-repository.port';

interface AccessTokenPayload {
  sub: string;
  typ: 'access';
  jti: string;
}

const isAccessTokenPayload = (value: unknown): value is AccessTokenPayload =>
  typeof value === 'object' &&
  value !== null &&
  'sub' in value &&
  typeof value.sub === 'string' &&
  'typ' in value &&
  value.typ === 'access' &&
  'jti' in value &&
  typeof value.jti === 'string';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService<ApplicationConfiguration, true>,
    @Inject(AUTH_REPOSITORY)
    private readonly repository: AuthRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow('auth.jwt.accessSecret', { infer: true }),
      issuer: config.getOrThrow('auth.jwt.issuer', { infer: true }),
      audience: config.getOrThrow('auth.jwt.audience', { infer: true }),
    });
  }

  async validate(payload: unknown): Promise<AuthenticatedUser> {
    if (!isAccessTokenPayload(payload)) {
      throw new AuthenticationException();
    }
    const user = await this.repository.findUserById(payload.sub);
    if (user === null) {
      throw new AuthenticationException();
    }
    return toAuthenticatedUser(user);
  }
}
