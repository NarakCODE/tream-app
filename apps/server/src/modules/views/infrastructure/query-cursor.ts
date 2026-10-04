import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
export interface QueryCursor {
  v: 1;
  scope: string;
  sort: string;
  position: string;
  id: string;
  kind: string;
}
export function queryScope(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export function encodeQueryCursor(value: QueryCursor) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}
export function decodeQueryCursor(
  value: string,
  scope: string,
  sort: string,
): QueryCursor {
  try {
    if (value.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(value))
      throw new Error();
    const buffer = Buffer.from(value, 'base64url');
    if (buffer.toString('base64url') !== value) throw new Error();
    const parsed: unknown = JSON.parse(buffer.toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
      throw new Error();
    const p = parsed as Record<string, unknown>;
    if (
      Object.keys(p).sort().join(',') !== 'id,kind,position,scope,sort,v' ||
      p.v !== 1 ||
      p.scope !== scope ||
      p.sort !== sort ||
      typeof p.position !== 'string' ||
      p.position.length > 500 ||
      typeof p.id !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(p.id) ||
      typeof p.kind !== 'string' ||
      !['issue', 'project', 'document', 'view', 'favorite'].includes(p.kind)
    )
      throw new Error();
    if (sort === 'TITLE_ASC' && p.position.length > 500) throw new Error();
    else if (sort === 'POSITION_ASC') {
      if (!/^\d{1,10}$/.test(p.position)) throw new Error();
    } else if (sort !== 'TITLE_ASC') {
      const date = new Date(p.position);
      if (!Number.isFinite(date.getTime()) || date.toISOString() !== p.position)
        throw new Error();
    }
    return p as unknown as QueryCursor;
  } catch {
    throw new BadRequestException('Invalid or mismatched query cursor.');
  }
}
