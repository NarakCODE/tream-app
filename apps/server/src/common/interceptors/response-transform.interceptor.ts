import {
  CallHandler,
  ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyReply } from 'fastify';
import { map, type Observable } from 'rxjs';
import { RequestContextService } from '../context/request-context.service';
import { SKIP_RESPONSE_TRANSFORM } from '../decorators/skip-transform.decorator';
import {
  createPaginationMeta,
  type ApiResponse,
  type PaginatedApiResponse,
  type PaginatedResult,
  type ResponseMeta,
} from '../interfaces/api-response.interface';

const isPaginatedResult = (
  value: unknown,
): value is PaginatedResult<unknown> => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const result = value as Record<string, unknown>;
  return (
    Array.isArray(result.items) &&
    typeof result.page === 'number' &&
    typeof result.limit === 'number' &&
    typeof result.total === 'number'
  );
};

@Injectable()
export class ResponseTransformInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly requestContext: RequestContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const shouldSkip = this.reflector.getAllAndOverride<boolean>(
      SKIP_RESPONSE_TRANSFORM,
      [context.getHandler(), context.getClass()],
    );
    const reply = context.switchToHttp().getResponse<FastifyReply>();

    if (shouldSkip || reply.statusCode === 204) {
      return next.handle();
    }

    return next.handle().pipe(
      map(
        (
          data: unknown,
        ): ApiResponse<unknown> | PaginatedApiResponse<unknown> | undefined => {
          if (reply.statusCode === 204) {
            return undefined;
          }
          const meta: ResponseMeta = {
            requestId: this.requestContext.getRequestId(),
            timestamp: new Date().toISOString(),
          };

          if (isPaginatedResult(data)) {
            return {
              data: data.items,
              meta: createPaginationMeta(data, meta),
            };
          }

          return { data, meta };
        },
      ),
    );
  }
}
