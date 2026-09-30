import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { IS_PUBLIC_ROUTE } from '../../../../common/decorators/public.decorator';
import { AuthenticationService } from '../application/authentication.service';
export interface AuthenticatedRequest extends FastifyRequest {
  user: { id: string; email: string; sessionId: string };
}
@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthenticationService,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header || !/^Bearer \S+$/.test(header))
      throw new UnauthorizedException('Bearer authentication required');
    request.user = await this.auth.authenticate(header.slice(7));
    return true;
  }
}
