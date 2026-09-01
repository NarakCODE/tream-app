const MONEY_PATTERN = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export const normalizeMoney = (value: string): string | null => {
  const candidate = value.trim();
  if (!MONEY_PATTERN.test(candidate)) {
    return null;
  }

  const [integer, fraction = ''] = candidate.split('.');
  return `${integer}.${fraction.padEnd(2, '0')}`;
};

export const normalizeCurrency = (value: string): string | null => {
  const candidate = value.trim().toUpperCase();
  return CURRENCY_PATTERN.test(candidate) ? candidate : null;
};
