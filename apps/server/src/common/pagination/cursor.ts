import { ValidationException } from '../exceptions/validation.exception';

const CURSOR_VERSION = 1;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export interface CursorTuple {
  createdAt: Date;
  id: string;
}

interface SerializedCursor {
  v: typeof CURSOR_VERSION;
  createdAt: string;
  id: string;
}

export const encodeCursor = ({ createdAt, id }: CursorTuple): string =>
  Buffer.from(
    JSON.stringify({
      v: CURSOR_VERSION,
      createdAt: createdAt.toISOString(),
      id,
    }),
    'utf8',
  ).toString('base64url');

export const decodeCursor = (cursor: string): CursorTuple => {
  try {
    if (!BASE64URL_PATTERN.test(cursor)) {
      throw new Error('Invalid base64url encoding.');
    }

    const parsed: unknown = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    );
    if (!isSerializedCursor(parsed)) {
      throw new Error('Invalid cursor payload.');
    }

    const createdAt = new Date(parsed.createdAt);
    if (
      Number.isNaN(createdAt.getTime()) ||
      createdAt.toISOString() !== parsed.createdAt
    ) {
      throw new Error('Invalid cursor timestamp.');
    }

    return { createdAt, id: parsed.id };
  } catch {
    throw new ValidationException([
      {
        field: 'cursor',
        constraints: ['cursor must be a valid pagination cursor'],
      },
    ]);
  }
};

const isSerializedCursor = (value: unknown): value is SerializedCursor => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    candidate.v === CURSOR_VERSION &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    Object.keys(candidate).length === 3
  );
};
