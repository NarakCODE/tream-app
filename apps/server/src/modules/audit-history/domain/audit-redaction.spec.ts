import { redactAuditMetadata } from './audit-redaction';
describe('audit presentation redaction', () => {
  it('retains immutable IDs, transitions and bounded scalar facts', () => {
    expect(
      redactAuditMetadata({
        issue_id: 'i',
        previous_role: 'MEMBER',
        role: 'ADMIN',
        changed_fields: ['title'],
        revision: 4,
      }),
    ).toEqual({
      issue_id: 'i',
      previous_role: 'MEMBER',
      role: 'ADMIN',
      changed_fields: ['title'],
      revision: 4,
    });
  });
  it('removes secret content, arbitrary nested data and unknown fields', () => {
    expect(
      redactAuditMetadata({
        password: 'p',
        token: 't',
        email: 'e',
        body: 'secret',
        title: 'private',
        storage_key: 'key',
        extra: { secret: 's' },
        issue_id: 'i',
      }),
    ).toEqual({ issue_id: 'i' });
  });
  it('bounds metadata arrays and strings', () => {
    const result = redactAuditMetadata({
      issue_id: 'i'.repeat(1000),
      related_ids: Array.from({ length: 200 }, () => 'v'.repeat(200)),
    });
    expect(result.issue_id).toHaveLength(512);
    expect(result.related_ids).toHaveLength(100);
  });
});
