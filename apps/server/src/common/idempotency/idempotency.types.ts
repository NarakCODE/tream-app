export interface IdempotencyIdentity {
  userId: string;
  method: string;
  route: string;
  key: string;
}

export interface IdempotencyReservationInput extends IdempotencyIdentity {
  requestHash: string;
}

export interface StoredIdempotencyResponse {
  statusCode: number;
  body: unknown;
  headers: Record<string, string | string[]>;
}

export type IdempotencyReservation =
  | { kind: 'reserved'; id: string }
  | { kind: 'replay'; response: StoredIdempotencyResponse }
  | { kind: 'payload-conflict' }
  | { kind: 'in-progress' };

export type CommandIdentity = IdempotencyReservationInput;
