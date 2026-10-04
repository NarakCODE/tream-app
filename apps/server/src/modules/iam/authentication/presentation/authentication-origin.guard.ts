import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';
import type { ApplicationConfiguration } from '../../../../config/configuration.interface';

@Injectable()
export class AuthenticationOriginGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService<ApplicationConfiguration, true>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const origin = request.headers.origin;
    if (!origin) return true;

    const allowedOrigins = this.config
      .getOrThrow('app.corsOrigin', { infer: true })
      .split(',')
      .map((value) => value.trim());
    if (!allowedOrigins.includes(origin)) {
      throw new UnauthorizedException('Untrusted browser origin');
    }
    return true;
  }
}
