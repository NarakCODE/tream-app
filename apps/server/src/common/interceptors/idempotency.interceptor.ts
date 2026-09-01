import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  catchError,
  defer,
  from,
  map,
  mergeMap,
  of,
  type Observable,
  throwError,
} from 'rxjs';
import { IS_PUBLIC_ROUTE } from '../decorators/public.decorator';
import { SKIP_IDEMPOTENCY } from '../decorators/skip-idempotency.decorator';
import { IdempotencyService } from '../idempotency/idempotency.service';
import type { StoredIdempotencyResponse } from '../idempotency/idempotency.types';

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const IDEMPOTENT_METHODS = new Set(['POST', 'PATCH']);
const REPLAYABLE_HEADER_NAMES = new Set([
  'content-type',
  'location',
  'cache-control',
  'etag',
  'last-modified',
]);

interface AuthenticatedRequest extends FastifyRequest {
  user?: { id: string };
}

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value instanceof Date) {
    return value.toJSON();
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
};

const hashRequestBody = (body: unknown): string =>
  createHash('sha256')
    .update(JSON.stringify(canonicalize(body) ?? null))
    .digest('hex');

const getHeader = (
  request: FastifyRequest,
  name: string,
): string | undefined => {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
};

const getNormalizedRoute = (request: FastifyRequest): string => {
  // Keep concrete tenant and resource identifiers in the operation identity.
  // A route template alone would allow the same key and payload to replay a
  // response created for a different workspace or resource.
  return request.url.split('?')[0] ?? request.url;
};

const responseHeaders = (
  reply: FastifyReply,
): Record<string, string | string[]> => {
  const headers = reply.getHeaders();
  const persisted: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(headers)) {
    const normalizedName = name.toLowerCase();
    if (!REPLAYABLE_HEADER_NAMES.has(normalizedName) || value === undefined) {
      continue;
    }
    persisted[normalizedName] = Array.isArray(value)
      ? value.map(String)
      : String(value);
  }
  return persisted;
};

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly idempotency: IdempotencyService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_ROUTE,
      [context.getHandler(), context.getClass()],
    );
    const isExempt = this.reflector.getAllAndOverride<boolean>(
      SKIP_IDEMPOTENCY,
      [context.getHandler(), context.getClass()],
    );

    if (
      !IDEMPOTENT_METHODS.has(request.method) ||
      isPublic ||
      isExempt ||
      !request.user
    ) {
      return next.handle();
    }

    const key = getHeader(request, 'idempotency-key');
    if (!key || !UUID_V4_PATTERN.test(key)) {
      throw new BadRequestException(
        'Idempotency-Key must be a UUID v4 for authenticated POST and PATCH requests.',
      );
    }

    const input = {
      userId: request.user.id,
      method: request.method,
      route: getNormalizedRoute(request),
      key: key.toLowerCase(),
      requestHash: hashRequestBody(request.body),
    };

    return defer(() => this.idempotency.reserve(input)).pipe(
      mergeMap((reservation) => {
        if (reservation.kind === 'replay') {
          for (const [name, value] of Object.entries(
            reservation.response.headers,
          )) {
            reply.header(name, value);
          }
          reply
            .header('idempotency-key', input.key)
            .header('idempotency-replayed', 'true')
            .status(reservation.response.statusCode)
            .send(reservation.response.body);
          return of(undefined);
        }

        return next.handle().pipe(
          catchError((error: unknown) =>
            from(this.idempotency.release(reservation.id)).pipe(
              mergeMap(() => throwError(() => error)),
            ),
          ),
          mergeMap((body: unknown) => {
            const response: StoredIdempotencyResponse = {
              statusCode: reply.statusCode,
              body: body ?? null,
              headers: responseHeaders(reply),
            };
            reply.header('idempotency-key', input.key);
            return from(
              this.idempotency.complete(reservation.id, response),
            ).pipe(map((): unknown => body));
          }),
        );
      }),
    );
  }
}
