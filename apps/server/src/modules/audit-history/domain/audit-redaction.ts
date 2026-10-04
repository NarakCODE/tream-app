const safeKey =
  /^(?:[a-z_]*_ids?|changed_fields|role|previous_role|state|previous_state|status|reason|category|schema_version|revision|expected_revision|current_revision|position|[a-z_]*_at|count|[a-z_]*_count|correlation_id)$/;
const sensitiveKey =
  /(?:password|token|secret|authorization|cookie|email|storage_key|body|description|content|name|title|url)/i;
export function redactAuditMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (sensitiveKey.test(key) || !safeKey.test(key)) continue;
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    )
      result[key] = typeof value === 'string' ? value.slice(0, 512) : value;
    else if (Array.isArray(value))
      result[key] = value
        .slice(0, 100)
        .filter(
          (x) =>
            typeof x === 'string' ||
            typeof x === 'number' ||
            typeof x === 'boolean',
        )
        .map((x) => (typeof x === 'string' ? x.slice(0, 128) : x));
  }
  return result;
}
