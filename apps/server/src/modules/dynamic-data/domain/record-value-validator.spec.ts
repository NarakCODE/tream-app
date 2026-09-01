import { validateRecordValues } from './record-value-validator';
import type { FieldDefinition } from './dynamic-data';

const field = (overrides: Partial<FieldDefinition>): FieldDefinition => ({
  id: 'fld_x',
  databaseId: 'db_x',
  name: 'Name',
  key: 'name',
  type: 'TEXT',
  isRequired: false,
  config: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...overrides,
});

describe('validateRecordValues', () => {
  it('rejects unknown and missing required fields', () => {
    expect(
      validateRecordValues([field({ isRequired: true })], { other: 1 }),
    ).toEqual([
      { field: 'values.other', constraints: ['unknown field key'] },
      { field: 'values.name', constraints: ['field is required'] },
    ]);
  });
  it('validates configured options and finite numbers', () => {
    expect(
      validateRecordValues(
        [
          field({
            key: 'stage',
            type: 'SELECT',
            config: { options: ['OPEN'] },
          }),
          field({ key: 'amount', type: 'NUMBER' }),
        ],
        { stage: 'LOST', amount: Number.NaN },
      ),
    ).toHaveLength(2);
  });
  it('ignores deleted field definitions', () => {
    expect(
      validateRecordValues([field({ deletedAt: new Date() })], {}),
    ).toEqual([]);
  });

  it('does not require system-managed fields but rejects supplied values', () => {
    const createdAt = field({
      key: 'created_at',
      type: 'CREATED_AT',
      isRequired: true,
    });
    expect(validateRecordValues([createdAt], {})).toEqual([]);
    expect(
      validateRecordValues([createdAt], {
        created_at: '2026-08-30T00:00:00.000Z',
      }),
    ).toEqual([
      {
        field: 'values.created_at',
        constraints: ['is system managed'],
      },
    ]);
  });
});
