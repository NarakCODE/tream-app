import {
  decodeQueryCursor,
  encodeQueryCursor,
  queryScope,
} from './query-cursor';
import { textPattern } from './resource-query.repository';
describe('bounded permission-scoped resource cursors', () => {
  const scope = queryScope(['workspace', 'member', 'ISSUES', { version: 1 }]);
  it.each(['CREATED_DESC', 'UPDATED_DESC', 'TITLE_ASC', 'POSITION_ASC'])(
    'roundtrips deterministic %s cursor',
    (sort) => {
      const value = {
        v: 1 as const,
        scope,
        sort,
        position:
          sort === 'TITLE_ASC'
            ? 'a title'
            : sort === 'POSITION_ASC'
              ? '12'
              : '2026-10-02T00:00:00.123Z',
        id: 'resource_1',
        kind: 'issue',
      };
      expect(decodeQueryCursor(encodeQueryCursor(value), scope, sort)).toEqual(
        value,
      );
    },
  );
  it('rejects cursors crossing tenant, actor, filter or sort scopes', () => {
    const value = {
      v: 1 as const,
      scope,
      sort: 'CREATED_DESC',
      position: '2026-10-02T00:00:00.123Z',
      id: 'resource_1',
      kind: 'issue',
    };
    const token = encodeQueryCursor(value);
    expect(() =>
      decodeQueryCursor(token, 'other-scope', 'CREATED_DESC'),
    ).toThrow();
    expect(() => decodeQueryCursor(token, scope, 'UPDATED_DESC')).toThrow();
  });
  it.each([
    'bad!',
    '',
    Buffer.from(
      JSON.stringify({
        v: 1,
        scope,
        sort: 'CREATED_DESC',
        position: 'invalid',
        id: 'resource_1',
        kind: 'issue',
      }),
    ).toString('base64url'),
    'a'.repeat(4097),
  ])('rejects malformed cursor %s', (token) =>
    expect(() => decodeQueryCursor(token, scope, 'CREATED_DESC')).toThrow(),
  );
  it('escapes wildcards/backslashes as literal search text', () =>
    expect(textPattern('10%_\\')).toBe('%10\\%\\_\\\\%'));
});
