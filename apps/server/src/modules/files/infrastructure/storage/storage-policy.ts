import { createHash } from 'node:crypto';
import { StorageError } from '../../domain/object-storage.port';
export const MAX_STORED_FILE_BYTES = 25 * 1024 * 1024;
export function validateStorageKey(key: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(key))
    throw new StorageError(
      'INVALID_KEY',
      'Object keys must be opaque server-generated identifiers.',
    );
}
export function validateStorageLimit(maxFileBytes: number) {
  if (
    !Number.isSafeInteger(maxFileBytes) ||
    maxFileBytes < 1 ||
    maxFileBytes > MAX_STORED_FILE_BYTES
  )
    throw new Error('Invalid object storage size limit.');
}
export function validateBytes(bytes: Buffer, maxFileBytes: number) {
  if (bytes.length > maxFileBytes)
    throw new StorageError(
      'TOO_LARGE',
      'Object exceeds the configured size limit.',
    );
}
export function objectChecksum(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex');
}
