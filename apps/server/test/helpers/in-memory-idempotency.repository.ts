import { randomUUID } from 'node:crypto';
import type {
  IdempotencyReservation,
  IdempotencyReservationInput,
  StoredIdempotencyResponse,
} from '../../src/common/idempotency/idempotency.types';

interface IdempotencyEntry {
  id: string;
  input: IdempotencyReservationInput;
  status: 'PENDING' | 'COMPLETED';
  response: StoredIdempotencyResponse | null;
}

const identityKey = (input: IdempotencyReservationInput): string =>
  [input.userId, input.method, input.route, input.key].join('\0');

export class InMemoryIdempotencyRepository {
  private readonly entries = new Map<string, IdempotencyEntry>();
  private readonly ids = new Map<string, string>();
  private sequence = 0;

  reset(): void {
    this.entries.clear();
    this.ids.clear();
    this.sequence = 0;
  }

  reserve(input: IdempotencyReservationInput): Promise<IdempotencyReservation> {
    const key = identityKey(input);
    const existing = this.entries.get(key);

    if (existing === undefined) {
      const id = `idempotency-${++this.sequence}`;
      this.entries.set(key, {
        id,
        input,
        status: 'PENDING',
        response: null,
      });
      this.ids.set(id, key);
      return Promise.resolve({ kind: 'reserved', id });
    }

    if (existing.input.requestHash !== input.requestHash) {
      return Promise.resolve({ kind: 'payload-conflict' });
    }
    if (existing.status === 'PENDING' || existing.response === null) {
      return Promise.resolve({ kind: 'in-progress' });
    }
    return Promise.resolve({ kind: 'replay', response: existing.response });
  }

  complete(id: string, response: StoredIdempotencyResponse): Promise<void> {
    const key = this.ids.get(id);
    if (key === undefined) {
      return Promise.resolve();
    }
    const entry = this.entries.get(key);
    if (entry === undefined) {
      return Promise.resolve();
    }
    this.entries.set(key, { ...entry, status: 'COMPLETED', response });
    return Promise.resolve();
  }

  release(id: string): Promise<void> {
    const key = this.ids.get(id);
    if (key === undefined) {
      return Promise.resolve();
    }
    this.entries.delete(key);
    this.ids.delete(id);
    return Promise.resolve();
  }
}

export const idempotentBearer = (
  accessToken: string,
): Record<string, string> => ({
  authorization: `Bearer ${accessToken}`,
  'idempotency-key': randomUUID(),
});
