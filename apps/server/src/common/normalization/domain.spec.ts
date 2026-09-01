import { canonicalizeDomain } from './domain';

describe('canonicalizeDomain', () => {
  it.each([
    [' Example.COM. ', 'example.com'],
    ['sales.Example.com', 'sales.example.com'],
    ['bücher.example', 'xn--bcher-kva.example'],
  ])('canonicalizes %s to %s', (input, expected) => {
    expect(canonicalizeDomain(input)).toBe(expected);
  });

  it.each([
    '',
    'localhost',
    'https://example.com',
    'example.com/path',
    'example.com:443',
    '127.0.0.1',
    '-invalid.example',
  ])('rejects invalid domain %s', (input) => {
    expect(canonicalizeDomain(input)).toBeNull();
  });
});
