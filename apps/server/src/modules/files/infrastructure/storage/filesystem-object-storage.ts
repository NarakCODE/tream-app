import { constants } from 'node:fs';
import {
  chmod,
  link,
  lstat,
  mkdir,
  open,
  readdir,
  unlink,
} from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  ObjectStorage,
  StorageError,
  type StoredObjectStat,
} from '../../domain/object-storage.port';
import {
  objectChecksum,
  validateBytes,
  validateStorageKey,
  validateStorageLimit,
} from './storage-policy';
export interface FilesystemStorageOptions {
  rootDirectory: string;
  maxFileBytes: number;
}
export class FilesystemObjectStorage extends ObjectStorage {
  private readonly root: string;
  private ready: Promise<void> | undefined;
  constructor(private readonly options: FilesystemStorageOptions) {
    super();
    validateStorageLimit(options.maxFileBytes);
    if (
      !isAbsolute(options.rootDirectory) ||
      resolve(options.rootDirectory) === '/'
    )
      throw new Error(
        'Local object storage requires a dedicated absolute directory.',
      );
    this.root = resolve(options.rootDirectory);
  }
  private ensureRoot() {
    if (!this.ready) {
      const pending = (async () => {
        await mkdir(this.root, { recursive: true, mode: 0o700 });
        const stats = await lstat(this.root);
        if (!stats.isDirectory() || stats.isSymbolicLink())
          throw new StorageError(
            'UNAVAILABLE',
            'Object storage directory is unavailable.',
          );
        await chmod(this.root, 0o700);
      })().catch((error) => {
        throw storageFailure(error);
      });
      this.ready = pending;
      void pending.catch(() => {
        if (this.ready === pending) this.ready = undefined;
      });
    }
    return this.ready;
  }
  async put(key: string, bytes: Buffer): Promise<void> {
    validateStorageKey(key);
    validateBytes(bytes, this.options.maxFileBytes);
    await this.ensureRoot();
    // The durable upload intent owns this entire key-specific staging namespace.
    // A process crash can leave a temporary inode; remove(key) reclaims it too.
    const temporary = join(this.root, `.${key}.upload-${randomUUID()}`);
    try {
      const file = await open(temporary, 'wx', 0o600);
      try {
        await file.writeFile(bytes);
        await file.sync();
        await file.chmod(0o400);
      } finally {
        await file.close();
      }
      try {
        await link(temporary, join(this.root, key));
        await this.syncDirectory();
      } catch (error) {
        if (!isCode(error, 'EEXIST')) throw error;
        const existing = await this.read(key);
        if (!existing.equals(bytes))
          throw new StorageError('CONFLICT', 'Object bytes are immutable.');
      }
    } catch (error) {
      throw storageFailure(error);
    } finally {
      await unlink(temporary).catch((error) => {
        if (!isCode(error, 'ENOENT')) throw storageFailure(error);
      });
    }
  }
  async read(key: string): Promise<Buffer> {
    validateStorageKey(key);
    await this.ensureRoot();
    try {
      const file = await open(
        join(this.root, key),
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      try {
        const stat = await file.stat();
        if (!stat.isFile())
          throw new StorageError(
            'UNAVAILABLE',
            'Object storage entry is unavailable.',
          );
        if (stat.size > this.options.maxFileBytes)
          throw new StorageError(
            'TOO_LARGE',
            'Object exceeds the configured size limit.',
          );
        const bytes = await file.readFile();
        validateBytes(bytes, this.options.maxFileBytes);
        return bytes;
      } finally {
        await file.close();
      }
    } catch (error) {
      throw storageFailure(error);
    }
  }
  async remove(key: string): Promise<void> {
    validateStorageKey(key);
    await this.ensureRoot();
    try {
      const staged = (await readdir(this.root)).filter((name) =>
        name.startsWith(`.${key}.upload-`),
      );
      for (const name of [...staged, key])
        await unlink(join(this.root, name)).catch((error) => {
          if (!isCode(error, 'ENOENT')) throw error;
        });
      await this.syncDirectory();
    } catch (error) {
      if (!isCode(error, 'ENOENT')) throw storageFailure(error);
    }
  }
  private async syncDirectory() {
    const directory = await open(this.root, constants.O_RDONLY);
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }
  async stat(key: string): Promise<StoredObjectStat | null> {
    try {
      const bytes = await this.read(key);
      return { sizeBytes: bytes.length, checksumSha256: objectChecksum(bytes) };
    } catch (error) {
      if (error instanceof StorageError && error.code === 'NOT_FOUND')
        return null;
      throw error;
    }
  }
}
function isCode(error: unknown, code: string) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}
function storageFailure(error: unknown) {
  if (error instanceof StorageError) return error;
  if (isCode(error, 'ENOENT'))
    return new StorageError('NOT_FOUND', 'Object not found.');
  return new StorageError('UNAVAILABLE', 'Object storage is unavailable.');
}
