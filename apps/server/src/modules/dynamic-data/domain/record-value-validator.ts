import type { FieldDefinition } from './dynamic-data';

export interface ValueValidationError {
  field: string;
  constraints: string[];
}
const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const date = /^\d{4}-\d{2}-\d{2}$/;
const userId = /^usr_[0-9A-HJKMNP-TV-Z]{26}$/;
const recordId = /^rec_[0-9A-HJKMNP-TV-Z]{26}$/;

export function validateRecordValues(
  fields: FieldDefinition[],
  values: Record<string, unknown>,
  partial = false,
): ValueValidationError[] {
  const active = fields.filter((field) => field.deletedAt === null);
  const byKey = new Map(active.map((field) => [field.key, field]));
  const errors: ValueValidationError[] = [];
  for (const key of Object.keys(values)) {
    const field = byKey.get(key);
    if (field === undefined)
      errors.push({
        field: `values.${key}`,
        constraints: ['unknown field key'],
      });
    else errors.push(...validateValue(field, values[key]));
  }
  if (!partial) {
    for (const field of active) {
      if (
        field.isRequired &&
        field.type !== 'CREATED_AT' &&
        field.type !== 'UPDATED_AT' &&
        (values[field.key] === undefined ||
          values[field.key] === null ||
          values[field.key] === '')
      ) {
        errors.push({
          field: `values.${field.key}`,
          constraints: ['field is required'],
        });
      }
    }
  }
  return errors;
}

function validateValue(
  field: FieldDefinition,
  value: unknown,
): ValueValidationError[] {
  const bad = (message: string): ValueValidationError[] => [
    { field: `values.${field.key}`, constraints: [message] },
  ];
  if (value === null)
    return field.isRequired ? bad('field cannot be null') : [];
  switch (field.type) {
    case 'TEXT':
    case 'LONG_TEXT':
    case 'PHONE':
      return typeof value === 'string' ? [] : bad('must be a string');
    case 'EMAIL':
      return typeof value === 'string' && email.test(value)
        ? []
        : bad('must be an email');
    case 'URL': {
      if (typeof value !== 'string') return bad('must be a URL');
      try {
        new URL(value);
        return [];
      } catch {
        return bad('must be a URL');
      }
    }
    case 'NUMBER':
    case 'CURRENCY':
      return typeof value === 'number' && Number.isFinite(value)
        ? []
        : bad('must be a finite number');
    case 'BOOLEAN':
      return typeof value === 'boolean' ? [] : bad('must be a boolean');
    case 'DATE':
      return typeof value === 'string' &&
        date.test(value) &&
        !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
        ? []
        : bad('must be an ISO date');
    case 'DATETIME':
      return typeof value === 'string' && !Number.isNaN(Date.parse(value))
        ? []
        : bad('must be an ISO date-time');
    case 'SELECT':
    case 'STATUS':
      return validateOption(field, value, false);
    case 'MULTI_SELECT':
      return validateOption(field, value, true);
    case 'USER':
      return typeof value === 'string' && userId.test(value)
        ? []
        : bad('must be a valid user id');
    case 'RELATION':
      return typeof value === 'string' && recordId.test(value)
        ? []
        : bad('must be a valid resource id');
    case 'CREATED_AT':
    case 'UPDATED_AT':
      return bad('is system managed');
  }
}

function validateOption(
  field: FieldDefinition,
  value: unknown,
  multiple: boolean,
): ValueValidationError[] {
  const options = field.config.options;
  if (
    !Array.isArray(options) ||
    !options.every((item) => typeof item === 'string')
  )
    return [
      {
        field: `values.${field.key}`,
        constraints: ['field options are invalid'],
      },
    ];
  const values = multiple ? value : [value];
  if (
    !Array.isArray(values) ||
    !values.every((item) => typeof item === 'string' && options.includes(item))
  )
    return [
      {
        field: `values.${field.key}`,
        constraints: [
          multiple
            ? 'must contain configured options'
            : 'must be a configured option',
        ],
      },
    ];
  return [];
}
