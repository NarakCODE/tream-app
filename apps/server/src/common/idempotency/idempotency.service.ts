import { Injectable } from '@nestjs/common';
import { ResourceConflictException } from '../exceptions/resource-conflict.exception';
import { IdempotencyRepository } from './idempotency.repository';
import type {
  IdempotencyReservationInput,
  StoredIdempotencyResponse,
} from './idempotency.types';

@Injectable()
export class IdempotencyService {
  constructor(private readonly repository: IdempotencyRepository) {}

  async reserve(
    input: IdempotencyReservationInput,
  ): Promise<
    | { kind: 'reserved'; id: string }
    | { kind: 'replay'; response: StoredIdempotencyResponse }
  > {
    const reservation = await this.repository.reserve(input);

    if (reservation.kind === 'payload-conflict') {
      throw new ResourceConflictException(
        'The Idempotency-Key was already used with a different request payload.',
      );
    }
    if (reservation.kind === 'in-progress') {
      throw new ResourceConflictException(
        'A request with this Idempotency-Key is already in progress.',
      );
    }
    return reservation;
  }

  complete(id: string, response: StoredIdempotencyResponse): Promise<void> {
    return this.repository.complete(id, response);
  }

  release(id: string): Promise<void> {
    return this.repository.release(id);
  }
}
