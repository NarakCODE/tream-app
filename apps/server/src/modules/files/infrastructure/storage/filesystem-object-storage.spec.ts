import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { FilesystemObjectStorage } from './filesystem-object-storage';
describe('private filesystem object storage', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'tream-storage-test-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const storage = () =>
    new FilesystemObjectStorage({
      rootDirectory: root,
      maxFileBytes: 1024 * 1024,
    });
  it('writes privately and computes actual byte length and SHA256', async () => {
    const provider = storage();
    const bytes = Buffer.from('Private attachment');
    await provider.put('file_123', bytes);
    expect(await provider.read('file_123')).toEqual(bytes);
    expect(await provider.stat('file_123')).toEqual({
      sizeBytes: bytes.length,
      checksumSha256: createHash('sha256').update(bytes).digest('hex'),
    });
    expect((await stat(root)).mode & 0o777).toBe(0o700);
    expect((await stat(join(root, 'file_123'))).mode & 0o777).toBe(0o400);
    expect(await readdir(root)).toEqual(['file_123']);
  });
  it('makes identical retries idempotent and rejects replacing immutable bytes', async () => {
    const provider = storage();
    await provider.put('file_123', Buffer.from('first'));
    await provider.put('file_123', Buffer.from('first'));
    await expect(
      provider.put('file_123', Buffer.from('second')),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await provider.read('file_123')).toString()).toBe('first');
    expect(await readdir(root)).toEqual(['file_123']);
  });
  it('publishes exactly one complete object during opposing concurrent writes', async () => {
    const provider = storage();
    const a = Buffer.alloc(128 * 1024, 1);
    const b = Buffer.alloc(128 * 1024, 2);
    const result = await Promise.allSettled([
      provider.put('file_123', a),
      provider.put('file_123', b),
    ]);
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(result.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const actual = await provider.read('file_123');
    expect(actual.equals(a) || actual.equals(b)).toBe(true);
    expect(await readdir(root)).toEqual(['file_123']);
  });
  it('never exposes a partially written final key', async () => {
    const provider = storage();
    const bytes = Buffer.alloc(1024 * 1024, 42);
    let done = false;
    const pending = provider.put('file_123', bytes).then(() => {
      done = true;
    });
    while (!done) {
      const info = await provider.stat('file_123');
      if (info) expect(info.sizeBytes).toBe(bytes.length);
    }
    await pending;
    expect(await provider.read('file_123')).toEqual(bytes);
  });
  it.each([
    '../secret',
    '/etc/passwd',
    'folder/key',
    'folder\\key',
    '.',
    '..',
    'key.txt',
    'key\n',
    '',
    'x'.repeat(129),
  ])('rejects path-like or nonopaque keys %s', async (key) => {
    const provider = storage();
    await expect(provider.put(key, Buffer.from('a'))).rejects.toMatchObject({
      code: 'INVALID_KEY',
    });
    await expect(provider.read(key)).rejects.toMatchObject({
      code: 'INVALID_KEY',
    });
    await expect(provider.remove(key)).rejects.toMatchObject({
      code: 'INVALID_KEY',
    });
  });
  it('caps writes and externally altered oversized reads', async () => {
    const provider = new FilesystemObjectStorage({
      rootDirectory: root,
      maxFileBytes: 4,
    });
    await expect(provider.put('key', Buffer.alloc(5))).rejects.toMatchObject({
      code: 'TOO_LARGE',
    });
    await writeFile(join(root, 'key'), Buffer.alloc(5));
    await expect(provider.read('key')).rejects.toMatchObject({
      code: 'TOO_LARGE',
    });
  });
  it('does not follow symlinks or expose linked external files', async () => {
    const external = join(root, 'external');
    await writeFile(external, 'secret');
    await symlink(external, join(root, 'file_123'));
    const provider = storage();
    await expect(provider.read('file_123')).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    await provider.remove('file_123');
    expect((await readFile(external)).toString()).toBe('secret');
  });
  it('cleans crashed staging inodes only for the owned durable key', async () => {
    await writeFile(join(root, '.file_123.upload-crashed'), 'partial');
    await writeFile(join(root, '.other_key.upload-crashed'), 'other');
    await writeFile(join(root, 'file_123'), 'published');
    const provider = storage();
    await provider.remove('file_123');
    await provider.remove('file_123');
    expect(await provider.stat('file_123')).toBeNull();
    expect(await readdir(root)).toEqual(['.other_key.upload-crashed']);
    await expect(provider.read('file_123')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
  it('rejects unsafe roots and invalid hard size limits', () => {
    expect(
      () =>
        new FilesystemObjectStorage({
          rootDirectory: 'relative',
          maxFileBytes: 10,
        }),
    ).toThrow();
    expect(
      () =>
        new FilesystemObjectStorage({ rootDirectory: '/', maxFileBytes: 10 }),
    ).toThrow();
    expect(
      () =>
        new FilesystemObjectStorage({
          rootDirectory: root,
          maxFileBytes: 26 * 1024 * 1024,
        }),
    ).toThrow();
  });
});
