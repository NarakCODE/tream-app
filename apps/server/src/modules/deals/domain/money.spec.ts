import { normalizeCurrency, normalizeMoney } from './money';

describe('deal money', () => {
  it.each([
    ['0', '0.00'],
    ['0.00', '0.00'],
    ['12', '12.00'],
    ['12.3', '12.30'],
    ['9999999999.99', '9999999999.99'],
    [' 42.50 ', '42.50'],
  ])('normalizes %s to fixed scale', (input, expected) => {
    expect(normalizeMoney(input)).toBe(expected);
  });

  it.each(['-1.00', '1e3', '1.234', '10000000000.00', '.50', '01.00', ''])(
    'rejects invalid amount %s',
    (input) => {
      expect(normalizeMoney(input)).toBeNull();
    },
  );
});

describe('deal currency', () => {
  it.each([
    ['usd', 'USD'],
    [' eur ', 'EUR'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeCurrency(input)).toBe(expected);
  });

  it.each(['US', 'USDT', 'U1D', '$$$', ''])(
    'rejects invalid code %s',
    (input) => {
      expect(normalizeCurrency(input)).toBeNull();
    },
  );
});
