import { isIP } from 'node:net';
import { domainToASCII } from 'node:url';
import { ValidateBy, type ValidationOptions } from 'class-validator';

const DOMAIN_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const MAX_DOMAIN_LENGTH = 253;

export const canonicalizeDomain = (value: string): string | null => {
  const trimmed = value.trim().toLowerCase().replace(/\.$/, '');
  if (
    trimmed.length === 0 ||
    trimmed.length > MAX_DOMAIN_LENGTH ||
    trimmed.includes('://') ||
    /[\s/:?#@]/.test(trimmed)
  ) {
    return null;
  }

  const ascii = domainToASCII(trimmed).toLowerCase();
  if (
    ascii.length === 0 ||
    ascii.length > MAX_DOMAIN_LENGTH ||
    isIP(ascii) !== 0
  ) {
    return null;
  }

  const labels = ascii.split('.');
  if (
    labels.length < 2 ||
    labels.some(
      (label) => label.length === 0 || !DOMAIN_LABEL_PATTERN.test(label),
    )
  ) {
    return null;
  }
  return ascii;
};

export const canonicalizeDomainValue = ({
  value,
}: {
  value: unknown;
}): unknown => {
  if (typeof value !== 'string') {
    return value;
  }
  return canonicalizeDomain(value) ?? value.trim().toLowerCase();
};

export const IsCanonicalDomain = (
  validationOptions?: ValidationOptions,
): PropertyDecorator =>
  ValidateBy(
    {
      name: 'isCanonicalDomain',
      validator: {
        validate: (value: unknown): boolean =>
          typeof value === 'string' && canonicalizeDomain(value) === value,
        defaultMessage: (): string =>
          'domain must be a valid canonical DNS domain without a scheme, path, port, or IP address',
      },
    },
    validationOptions,
  );
