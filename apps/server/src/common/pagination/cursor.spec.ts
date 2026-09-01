import { ValidationException } from '../exceptions/validation.exception';
import { decodeCursor, encodeCursor } from './cursor';

describe('cursor pagination', () => {
  it('round-trips a versioned createdAt and id tuple', () => {
    const tuple = {
      createdAt: new Date('2026-08-30T12:34:56.789Z'),
      id: 'con_01K00000000000000000000000',
    };

    expect(decodeCursor(encodeCursor(tuple))).toEqual(tuple);
  });

  it.each(['not base64!', Buffer.from('{}').toString('base64url')])(
    'rejects invalid cursor %s as field validation',
    (cursor) => {
      expect(() => decodeCursor(cursor)).toThrow(ValidationException);
      try {
        decodeCursor(cursor);
      } catch (error) {
        expect(error).toMatchObject({ details: [{ field: 'cursor' }] });
      }
    },
  );
});
