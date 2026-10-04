import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
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
export interface S3StorageOptions {
  bucket: string;
  region: string;
  maxFileBytes: number;
  endpoint?: string;
  accessKey?: string;
  secretKey?: string;
  ioTimeoutMs?: number;
}
export class S3ObjectStorage extends ObjectStorage {
  private readonly client: S3Client;
  constructor(
    private readonly options: S3StorageOptions,
    client?: S3Client,
  ) {
    super();
    validateStorageLimit(options.maxFileBytes);
    if (!options.bucket || !options.region)
      throw new Error('Private S3 storage needs a bucket and region.');
    if (Boolean(options.accessKey) !== Boolean(options.secretKey))
      throw new Error(
        'S3 credentials must supply both an access key and a secret key.',
      );
    if (
      options.ioTimeoutMs !== undefined &&
      (!Number.isSafeInteger(options.ioTimeoutMs) ||
        options.ioTimeoutMs < 1 ||
        options.ioTimeoutMs > 3000)
    )
      throw new Error('Invalid S3 request deadline.');
    const config: S3ClientConfig = {
      region: options.region,
      maxAttempts: 1,
      ...(options.endpoint
        ? { endpoint: options.endpoint, forcePathStyle: true }
        : {}),
      ...(options.accessKey && options.secretKey
        ? {
            credentials: {
              accessKeyId: options.accessKey,
              secretAccessKey: options.secretKey,
            },
          }
        : {}),
    };
    this.client = client ?? new S3Client(config);
  }
  async put(key: string, bytes: Buffer): Promise<void> {
    validateStorageKey(key);
    validateBytes(bytes, this.options.maxFileBytes);
    try {
      await this.withTimeout((signal) =>
        this.client.send(
          new PutObjectCommand({
            Bucket: this.options.bucket,
            Key: key,
            Body: bytes,
            ContentLength: bytes.length,
            ContentType: 'application/octet-stream',
            IfNoneMatch: '*',
            ChecksumSHA256: Buffer.from(objectChecksum(bytes), 'hex').toString(
              'base64',
            ),
          }),
          { abortSignal: signal },
        ),
      );
    } catch (error) {
      if (
        errorCode(error) === 'PreconditionFailed' ||
        errorStatus(error) === 412
      ) {
        const existing = await this.read(key);
        if (existing.equals(bytes)) return;
        throw new StorageError('CONFLICT', 'Object bytes are immutable.');
      }
      throw failure(error);
    }
  }
  async read(key: string): Promise<Buffer> {
    validateStorageKey(key);
    try {
      return await this.withTimeout(async (signal) => {
        const head = await this.client.send(
          new HeadObjectCommand({ Bucket: this.options.bucket, Key: key }),
          { abortSignal: signal },
        );
        if (
          head.ContentLength !== undefined &&
          head.ContentLength > this.options.maxFileBytes
        )
          throw new StorageError(
            'TOO_LARGE',
            'Object exceeds the configured size limit.',
          );
        const object = await this.client.send(
          new GetObjectCommand({ Bucket: this.options.bucket, Key: key }),
          { abortSignal: signal },
        );
        if (!object.Body)
          throw new StorageError(
            'UNAVAILABLE',
            'Object storage returned no body.',
          );
        if (signal.aborted) {
          destroyBody(object.Body);
          throw new StorageError(
            'UNAVAILABLE',
            'Object storage request timed out.',
          );
        }
        if (
          object.ContentLength !== undefined &&
          object.ContentLength > this.options.maxFileBytes
        ) {
          destroyBody(object.Body);
          throw new StorageError(
            'TOO_LARGE',
            'Object exceeds the configured size limit.',
          );
        }
        const chunks: Buffer[] = [];
        let size = 0;
        const onAbort = () => destroyBody(object.Body);
        signal.addEventListener('abort', onAbort, { once: true });
        try {
          for await (const chunk of object.Body as AsyncIterable<Uint8Array>) {
            const bytes = Buffer.from(chunk);
            size += bytes.length;
            if (size > this.options.maxFileBytes) {
              destroyBody(object.Body);
              throw new StorageError(
                'TOO_LARGE',
                'Object exceeds the configured size limit.',
              );
            }
            chunks.push(bytes);
          }
          return Buffer.concat(chunks, size);
        } finally {
          signal.removeEventListener('abort', onAbort);
        }
      });
    } catch (error) {
      throw failure(error);
    }
  }
  async remove(key: string): Promise<void> {
    validateStorageKey(key);
    try {
      await this.withTimeout((signal) =>
        this.client.send(
          new DeleteObjectCommand({ Bucket: this.options.bucket, Key: key }),
          { abortSignal: signal },
        ),
      );
    } catch (error) {
      if (errorStatus(error) !== 404 && errorCode(error) !== 'NoSuchKey')
        throw failure(error);
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
  private withTimeout<T>(
    work: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    let timeout!: NodeJS.Timeout;
    const deadline = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(
          new StorageError('UNAVAILABLE', 'Object storage request timed out.'),
        );
      }, this.options.ioTimeoutMs ?? 3000);
    });
    timeout.unref();
    return Promise.race([work(controller.signal), deadline]).finally(() =>
      clearTimeout(timeout),
    );
  }
  onModuleDestroy() {
    this.client.destroy();
  }
}
function errorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'name' in error
    ? error.name
    : undefined;
}
function errorStatus(error: unknown) {
  if (typeof error !== 'object' || error === null || !('$metadata' in error))
    return undefined;
  const metadata = error.$metadata;
  return typeof metadata === 'object' &&
    metadata !== null &&
    'httpStatusCode' in metadata
    ? metadata.httpStatusCode
    : undefined;
}
function failure(error: unknown) {
  if (error instanceof StorageError) return error;
  if (
    errorStatus(error) === 404 ||
    errorCode(error) === 'NoSuchKey' ||
    errorCode(error) === 'NotFound'
  )
    return new StorageError('NOT_FOUND', 'Object not found.');
  return new StorageError('UNAVAILABLE', 'Object storage is unavailable.');
}
function destroyBody(body: unknown) {
  if (
    typeof body === 'object' &&
    body !== null &&
    'destroy' in body &&
    typeof body.destroy === 'function'
  )
    (body.destroy as () => void).call(body);
}
