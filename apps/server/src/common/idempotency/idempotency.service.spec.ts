import { ResourceConflictException } from '../exceptions/resource-conflict.exception';
import { IdempotencyRepository } from './idempotency.repository';
import { IdempotencyService } from './idempotency.service';

describe('IdempotencyService', () => {
  const input = {
    userId: 'usr_01',
    method: 'POST',
    route: '/api/v1/workspaces/:workspaceId/contacts',
    key: 'b2ea160a-9baf-4de9-b8ff-f511e6e29754',
    requestHash: 'hash',
  };
  let repository: jest.Mocked<
    Pick<IdempotencyRepository, 'reserve' | 'complete' | 'release'>
  >;
  let service: IdempotencyService;

  beforeEach(() => {
    repository = {
      reserve: jest.fn(),
      complete: jest.fn(),
      release: jest.fn(),
    };
    service = new IdempotencyService(
      repository as unknown as IdempotencyRepository,
    );
  });

  it('returns a replayed completed response', async () => {
    repository.reserve.mockResolvedValue({
      kind: 'replay',
      response: {
        statusCode: 201,
        body: { data: { id: 'con_01' } },
        headers: {},
      },
    });

    await expect(service.reserve(input)).resolves.toEqual({
      kind: 'replay',
      response: {
        statusCode: 201,
        body: { data: { id: 'con_01' } },
        headers: {},
      },
    });
  });

  it('rejects a key reused for another payload', async () => {
    repository.reserve.mockResolvedValue({ kind: 'payload-conflict' });

    await expect(service.reserve(input)).rejects.toThrow(
      ResourceConflictException,
    );
  });

  it('rejects concurrent execution of the same key', async () => {
    repository.reserve.mockResolvedValue({ kind: 'in-progress' });

    await expect(service.reserve(input)).rejects.toThrow('already in progress');
  });
});
