import {
  BadRequestException,
  type CallHandler,
  type ExecutionContext,
} from '@nestjs/common';
import { of, lastValueFrom } from 'rxjs';
import { TRANSACTIONAL_COMMAND } from '../decorators/transactional-command.decorator';
import { IS_PUBLIC_ROUTE } from '../decorators/public.decorator';
import { SKIP_IDEMPOTENCY } from '../decorators/skip-idempotency.decorator';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { IdempotencyInterceptor } from './idempotency.interceptor';

const key = 'b2ea160a-9baf-4de9-b8ff-f511e6e29754';

const createReply = () => {
  const reply = {
    statusCode: 201,
    headers: {} as Record<string, string | string[]>,
    header(name: string, value: string | string[]) {
      this.headers[name] = value;
      return this;
    },
    status(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
    send: jest.fn(),
    getHeaders() {
      return this.headers;
    },
  };
  return reply;
};

describe('IdempotencyInterceptor', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  };
  const idempotency = {
    reserve: jest.fn(),
    complete: jest.fn(),
    release: jest.fn(),
  };
  let interceptor: IdempotencyInterceptor;

  beforeEach(() => {
    jest.resetAllMocks();
    reflector.getAllAndOverride.mockImplementation((metadataKey: string) => {
      if (metadataKey === IS_PUBLIC_ROUTE || metadataKey === SKIP_IDEMPOTENCY) {
        return false;
      }
      return undefined;
    });
    idempotency.complete.mockResolvedValue(undefined);
    idempotency.release.mockResolvedValue(undefined);
    interceptor = new IdempotencyInterceptor(
      reflector as never,
      idempotency as unknown as IdempotencyService,
    );
  });

  it('passes command identity without reserving outside a marked transaction', async () => {
    reflector.getAllAndOverride.mockImplementation(
      (metadataKey: string) => metadataKey === TRANSACTIONAL_COMMAND,
    );
    const reply = createReply();
    const request: Record<string, unknown> = {
      method: 'DELETE',
      headers: { 'idempotency-key': key },
      body: { b: 2, a: 1 },
      user: { id: 'usr_01' },
      url: '/api/v1/workspaces/ws_02',
    };
    const context = {
      getClass: () => class TestController {},
      getHandler: () => () => undefined,
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => reply,
      }),
    } as unknown as ExecutionContext;
    await lastValueFrom(interceptor.intercept(context, handler()));
    expect(request.commandIdentity).toEqual(
      expect.objectContaining({
        userId: 'usr_01',
        method: 'DELETE',
        route: '/api/v1/workspaces/ws_02',
        key,
        requestHash: expect.any(String) as unknown,
      }),
    );
    expect(idempotency.reserve).not.toHaveBeenCalled();
    expect(idempotency.complete).not.toHaveBeenCalled();
  });

  it('requires a UUID v4 key for authenticated POST requests', () => {
    const reply = createReply();
    const context = createContext(
      { method: 'POST', headers: {}, user: { id: 'usr_01' } },
      reply,
    );

    expect(() => interceptor.intercept(context, handler())).toThrow(
      BadRequestException,
    );
  });

  it('does not require a key for GET requests', async () => {
    const reply = createReply();
    const context = createContext(
      { method: 'GET', headers: {}, user: { id: 'usr_01' } },
      reply,
    );

    await expect(
      lastValueFrom(interceptor.intercept(context, handler())),
    ).resolves.toEqual({
      data: { id: 'con_01' },
    });
    expect(idempotency.reserve).not.toHaveBeenCalled();
  });

  it('persists the transformed successful response for a reserved key', async () => {
    const reply = createReply();
    const context = createContext(
      {
        method: 'POST',
        headers: { 'idempotency-key': key },
        body: { lastName: 'Doe', firstName: 'Jane' },
        user: { id: 'usr_01' },
      },
      reply,
    );
    idempotency.reserve.mockResolvedValue({ kind: 'reserved', id: 'record-1' });

    await expect(
      lastValueFrom(interceptor.intercept(context, handler())),
    ).resolves.toEqual({
      data: { id: 'con_01' },
    });
    expect(idempotency.complete).toHaveBeenCalledWith('record-1', {
      statusCode: 201,
      body: { data: { id: 'con_01' } },
      headers: {},
    });
    expect(idempotency.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        route: '/api/v1/workspaces/ws_01/contacts',
      }),
    );
    expect(reply.headers['idempotency-key']).toBe(key);
  });

  it('replays a completed response without executing the handler', async () => {
    const reply = createReply();
    const context = createContext(
      {
        method: 'PATCH',
        headers: { 'idempotency-key': key },
        body: { firstName: 'Jane' },
        user: { id: 'usr_01' },
      },
      reply,
    );
    const handle = jest.fn(() => of({ data: { id: 'con_01' } }));
    const next: CallHandler = { handle };
    idempotency.reserve.mockResolvedValue({
      kind: 'replay',
      response: {
        statusCode: 200,
        body: { data: { id: 'con_01' } },
        headers: { etag: '"abc"' },
      },
    });

    await expect(
      lastValueFrom(interceptor.intercept(context, next), {
        defaultValue: undefined,
      }),
    ).resolves.toBeUndefined();
    expect(handle).not.toHaveBeenCalled();
    expect(reply.statusCode).toBe(200);
    expect(reply.headers.etag).toBe('"abc"');
    expect(reply.headers['idempotency-replayed']).toBe('true');
    expect(reply.send).toHaveBeenCalledWith({ data: { id: 'con_01' } });
  });

  it('retains the reservation when persisting a successful response fails', async () => {
    const reply = createReply();
    const context = createContext(
      {
        method: 'POST',
        headers: { 'idempotency-key': key },
        body: { firstName: 'Jane' },
        user: { id: 'usr_01' },
      },
      reply,
    );
    idempotency.reserve.mockResolvedValue({ kind: 'reserved', id: 'record-1' });
    idempotency.complete.mockRejectedValue(new Error('database unavailable'));

    await expect(
      lastValueFrom(interceptor.intercept(context, handler())),
    ).rejects.toThrow('database unavailable');
    expect(idempotency.release).not.toHaveBeenCalled();
  });
});

function createContext(
  request: Record<string, unknown>,
  reply: ReturnType<typeof createReply>,
): ExecutionContext {
  return {
    getClass: () => class TestController {},
    getHandler: () => () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({
        ...request,
        routeOptions: { url: '/api/v1/workspaces/:workspaceId/contacts' },
        url: '/api/v1/workspaces/ws_01/contacts',
      }),
      getResponse: () => reply,
    }),
  } as unknown as ExecutionContext;
}

function handler(): jest.Mocked<CallHandler> {
  return { handle: jest.fn(() => of({ data: { id: 'con_01' } })) };
}
