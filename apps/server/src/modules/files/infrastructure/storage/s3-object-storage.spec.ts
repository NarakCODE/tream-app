import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { S3ObjectStorage } from './s3-object-storage';
function fixture(maxFileBytes = 1024) {
  const send = jest.fn<Promise<unknown>, [unknown, unknown?]>();
  const destroy = jest.fn();
  const provider = new S3ObjectStorage(
    { bucket: 'private-bucket', region: 'test-region', maxFileBytes },
    { send, destroy } as unknown as S3Client,
  );
  return { send, destroy, provider };
}
describe('private S3-compatible storage', () => {
  it('uses conditional immutable writes and server-computed SHA256 without ACLs or public URLs', async () => {
    const f = fixture();
    f.send.mockResolvedValue({});
    const bytes = Buffer.from('private');
    await f.provider.put('key', bytes);
    const command = f.send.mock.calls[0]![0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'private-bucket',
      Key: 'key',
      IfNoneMatch: '*',
      ContentLength: bytes.length,
      ContentType: 'application/octet-stream',
      ChecksumSHA256: createHash('sha256').update(bytes).digest('base64'),
    });
    expect(command.input.ACL).toBeUndefined();
    expect(command.input.Body).toEqual(bytes);
  });
  it('accepts identical conditional retry and rejects a changed payload', async () => {
    const f = fixture();
    f.send
      .mockRejectedValueOnce({
        name: 'PreconditionFailed',
        $metadata: { httpStatusCode: 412 },
      })
      .mockResolvedValueOnce({ ContentLength: 5 })
      .mockResolvedValueOnce({ Body: Readable.from(Buffer.from('first')) });
    await expect(
      f.provider.put('key', Buffer.from('first')),
    ).resolves.toBeUndefined();
    f.send
      .mockRejectedValueOnce({ name: 'PreconditionFailed' })
      .mockResolvedValueOnce({ ContentLength: 5 })
      .mockResolvedValueOnce({ Body: Readable.from(Buffer.from('first')) });
    await expect(
      f.provider.put('key', Buffer.from('other')),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('computes actual stats rather than trusting supplied object metadata', async () => {
    const f = fixture();
    const bytes = Buffer.from('actual');
    f.send
      .mockResolvedValueOnce({
        ContentLength: bytes.length,
        Metadata: { sha256: 'forged' },
      })
      .mockResolvedValueOnce({ Body: Readable.from(bytes) });
    expect(await f.provider.stat('key')).toEqual({
      sizeBytes: bytes.length,
      checksumSha256: createHash('sha256').update(bytes).digest('hex'),
    });
    expect(f.send.mock.calls[0]![0]).toBeInstanceOf(HeadObjectCommand);
    expect(f.send.mock.calls[1]![0]).toBeInstanceOf(GetObjectCommand);
  });
  it('caps declared object length before downloading and actual streaming bytes', async () => {
    const f = fixture(4);
    f.send.mockResolvedValueOnce({ ContentLength: 5 });
    await expect(f.provider.read('key')).rejects.toMatchObject({
      code: 'TOO_LARGE',
    });
    expect(f.send).toHaveBeenCalledTimes(1);
    const body = Readable.from([Buffer.alloc(3), Buffer.alloc(3)]);
    f.send
      .mockResolvedValueOnce({ ContentLength: 3 })
      .mockResolvedValueOnce({ Body: body });
    await expect(f.provider.read('key')).rejects.toMatchObject({
      code: 'TOO_LARGE',
    });
    expect(body.destroyed).toBe(true);
  });
  it('maps missing objects to nullable stat and idempotent removal', async () => {
    const f = fixture();
    f.send.mockRejectedValueOnce({
      name: 'NotFound',
      $metadata: { httpStatusCode: 404 },
    });
    expect(await f.provider.stat('key')).toBeNull();
    f.send.mockRejectedValueOnce({ name: 'NoSuchKey' });
    await expect(f.provider.remove('key')).resolves.toBeUndefined();
    expect(f.send.mock.calls[1]![0]).toBeInstanceOf(DeleteObjectCommand);
  });
  it('fails closed when the provider returns no body or operational errors', async () => {
    const f = fixture();
    f.send
      .mockResolvedValueOnce({ ContentLength: 1 })
      .mockResolvedValueOnce({});
    await expect(f.provider.read('key')).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    f.send.mockRejectedValueOnce(new Error('AWS key secret should not escape'));
    await expect(f.provider.put('key', Buffer.from('x'))).rejects.toThrow(
      'Object storage is unavailable.',
    );
  });
  it('enforces its deadline even if the client does not settle its pending request', async () => {
    jest.useFakeTimers();
    try {
      const f = fixture();
      f.send.mockImplementation(() => new Promise(() => undefined));
      const result = f.provider.read('key');
      const assertion = expect(result).rejects.toMatchObject({
        code: 'UNAVAILABLE',
      });
      await jest.advanceTimersByTimeAsync(3000);
      await assertion;
      const options = f.send.mock.calls[0]![1] as { abortSignal: AbortSignal };
      expect(options.abortSignal.aborted).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
  it('rejects unsafe keys before IO and releases the client on shutdown', async () => {
    const f = fixture();
    await expect(f.provider.read('../key')).rejects.toMatchObject({
      code: 'INVALID_KEY',
    });
    expect(f.send).not.toHaveBeenCalled();
    f.provider.onModuleDestroy();
    expect(f.destroy).toHaveBeenCalledTimes(1);
  });
});
