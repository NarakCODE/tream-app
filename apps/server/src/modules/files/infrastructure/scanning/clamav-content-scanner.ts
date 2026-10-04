import { createConnection, type Socket } from 'node:net';
import {
  ContentScanner,
  ScanError,
  type ScanResult,
} from '../../domain/content-scanner.port';
import { MAX_STORED_FILE_BYTES } from '../storage/storage-policy';
export interface ClamavScannerOptions {
  host: string;
  port: number;
  timeoutMs: number;
  maxFileBytes?: number;
}
export class ClamavContentScanner extends ContentScanner {
  constructor(private readonly options: ClamavScannerOptions) {
    super();
    if (
      !options.host ||
      !Number.isSafeInteger(options.port) ||
      options.port < 1 ||
      options.port > 65535 ||
      !Number.isSafeInteger(options.timeoutMs) ||
      options.timeoutMs < 1
    )
      throw new Error('Invalid ClamAV scanner configuration.');
    if (
      options.maxFileBytes !== undefined &&
      (!Number.isSafeInteger(options.maxFileBytes) ||
        options.maxFileBytes < 1 ||
        options.maxFileBytes > MAX_STORED_FILE_BYTES)
    )
      throw new Error('Invalid ClamAV size limit.');
  }
  scan(bytes: Buffer): Promise<ScanResult> {
    if (bytes.length > (this.options.maxFileBytes ?? MAX_STORED_FILE_BYTES))
      return Promise.reject(new ScanError());
    return new Promise((resolve, reject) => {
      const socket = createConnection({
        host: this.options.host,
        port: this.options.port,
      });
      let done = false;
      let streamSent = false;
      let response = Buffer.alloc(0);
      const finish = (result?: ScanResult) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        socket.destroy();
        if (result) resolve(result);
        else reject(new ScanError());
      };
      const timer = setTimeout(() => finish(), this.options.timeoutMs);
      timer.unref();
      socket.on('error', () => finish());
      socket.on('end', () => finish());
      socket.on('data', (chunk: Buffer) => {
        if (done) return;
        response = Buffer.concat([response, chunk]);
        if (response.length > 4096) return finish();
        const zero = response.indexOf(0);
        if (zero < 0) return;
        if (!streamSent) return finish();
        if (zero !== response.length - 1) return finish();
        const reply = response.subarray(0, zero).toString('utf8');
        if (reply === 'stream: OK') return finish({ status: 'clean' });
        const found = /^stream: ([A-Za-z0-9_.:-]{1,200}) FOUND$/.exec(reply);
        if (found) return finish({ status: 'infected', signature: found[1]! });
        finish();
      });
      socket.once('connect', () => {
        socket.setNoDelay(true);
        void sendStream(socket, bytes)
          .then(() => {
            streamSent = true;
          })
          .catch(() => finish());
      });
    });
  }
}
async function sendStream(socket: Socket, bytes: Buffer) {
  await write(socket, Buffer.from('zINSTREAM\0'));
  for (let offset = 0; offset < bytes.length; offset += 64 * 1024) {
    const chunk = bytes.subarray(
      offset,
      Math.min(offset + 64 * 1024, bytes.length),
    );
    const length = Buffer.alloc(4);
    length.writeUInt32BE(chunk.length);
    await write(socket, length);
    await write(socket, chunk);
  }
  await write(socket, Buffer.alloc(4));
}
function write(socket: Socket, bytes: Buffer) {
  return new Promise<void>((resolve, reject) =>
    socket.write(bytes, (error) => (error ? reject(error) : resolve())),
  );
}
