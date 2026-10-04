export type StorageErrorCode =
  'CONFLICT' | 'NOT_FOUND' | 'INVALID_KEY' | 'TOO_LARGE' | 'UNAVAILABLE';
export class StorageError extends Error {
  constructor(
    readonly code: StorageErrorCode,
    message: string,
  ) {
    super(message);
  }
}
export interface StoredObjectStat {
  sizeBytes: number;
  checksumSha256: string;
}
/** Objects have opaque server-generated keys and immutable bytes. */
export abstract class ObjectStorage {
  abstract put(key: string, bytes: Buffer): Promise<void>;
  abstract read(key: string): Promise<Buffer>;
  abstract remove(key: string): Promise<void>;
  abstract stat(key: string): Promise<StoredObjectStat | null>;
}
