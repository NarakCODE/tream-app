import { assertDemoSeedAllowed } from './runner';
import { createDemoContext } from './context';

describe('demo seed safety', () => {
  it('refuses production without the exact explicit flag', () => {
    expect(() => assertDemoSeedAllowed({ NODE_ENV: 'production' })).toThrow(
      'refused',
    );
    expect(() =>
      assertDemoSeedAllowed({
        NODE_ENV: 'production',
        ALLOW_DEMO_SEED: 'false',
      }),
    ).toThrow('refused');
    expect(() =>
      assertDemoSeedAllowed({
        NODE_ENV: 'production',
        ALLOW_DEMO_SEED: 'true',
      }),
    ).not.toThrow();
    expect(() =>
      assertDemoSeedAllowed({ NODE_ENV: 'development' }),
    ).not.toThrow();
  });
  it('uses namespace-scoped stable IDs and a fixed relative date anchor', () => {
    const now = new Date('2026-10-04T12:00:00Z');
    const a = createDemoContext(
      undefined as never,
      'namespace-a',
      'workspace',
      now,
    );
    const b = createDemoContext(
      undefined as never,
      'namespace-b',
      'workspace',
      now,
    );
    expect(a.issue(3)).toBe(a.issue(3));
    expect(a.issue(3)).not.toBe(b.issue(3));
    expect(a.date(-3).toISOString()).toBe('2026-10-01T12:00:00.000Z');
  });
});
