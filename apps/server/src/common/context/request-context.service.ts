import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { ulid } from 'ulid';

export interface RequestContext {
  requestId: string;
}

const REQUEST_ID_PATTERN =
  /^(?:req_)?[0-9A-HJKMNP-TV-Z]{26}$|^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const createRequestId = (candidate: string | undefined): string =>
  candidate !== undefined && REQUEST_ID_PATTERN.test(candidate)
    ? candidate
    : `req_${ulid()}`;

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  enter(requestId: string): void {
    this.storage.enterWith({ requestId });
  }

  getRequestId(): string {
    return this.storage.getStore()?.requestId ?? 'unknown';
  }
}
