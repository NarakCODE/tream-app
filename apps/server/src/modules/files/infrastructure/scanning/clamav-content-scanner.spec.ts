import { createServer, type Server, type Socket } from 'node:net';
import { ClamavContentScanner } from './clamav-content-scanner';
import { DevelopmentContentScanner } from './development-content-scanner';
import { ScanError } from '../../domain/content-scanner.port';
type ParsedStream = { command: string; chunks: Buffer[] };
describe('ClamAV INSTREAM adapter', () => {
  let server: Server | undefined;
  let sockets: Set<Socket>;
  beforeEach(() => {
    sockets = new Set();
  });
  afterEach(async () => {
    for (const socket of sockets) socket.destroy();
    if (server)
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  });
  async function fixture(
    reply: string | null,
    receive?: (parsed: ParsedStream) => void,
    timeoutMs = 500,
  ) {
    server = createServer((socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.on('error', () => undefined);
      let pending = Buffer.alloc(0);
      let command: string | undefined;
      const chunks: Buffer[] = [];
      socket.on('data', (data: Buffer) => {
        pending = Buffer.concat([pending, data]);
        if (command === undefined) {
          const zero = pending.indexOf(0);
          if (zero < 0) return;
          command = pending.subarray(0, zero).toString();
          pending = pending.subarray(zero + 1);
        }
        while (pending.length >= 4) {
          const length = pending.readUInt32BE(0);
          if (pending.length < 4 + length) return;
          const chunk = pending.subarray(4, 4 + length);
          pending = pending.subarray(4 + length);
          if (length === 0) {
            receive?.({ command, chunks });
            if (reply !== null) socket.write(Buffer.from(reply));
            return;
          }
          chunks.push(chunk);
        }
      });
    });
    await new Promise<void>((resolve, reject) => {
      server!.once('error', reject);
      server!.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing test TCP address');
    return new ClamavContentScanner({
      host: '127.0.0.1',
      port: address.port,
      timeoutMs,
    });
  }
  it('streams every byte with network-order chunk framing before accepting a clean response', async () => {
    const bytes = Buffer.alloc(150000, 42);
    let actual: ParsedStream | undefined;
    const scanner = await fixture('stream: OK\0', (parsed) => {
      actual = parsed;
    });
    await expect(scanner.scan(bytes)).resolves.toEqual({ status: 'clean' });
    expect(actual!.command).toBe('zINSTREAM');
    expect(actual!.chunks.map((c) => c.length)).toEqual([65536, 65536, 18928]);
    expect(Buffer.concat(actual!.chunks)).toEqual(bytes);
  });
  it('returns an infected verdict instead of a clean response', async () => {
    const scanner = await fixture('stream: Eicar-Signature FOUND\0');
    await expect(scanner.scan(Buffer.from('EICAR'))).resolves.toEqual({
      status: 'infected',
      signature: 'Eicar-Signature',
    });
  });
  it.each([
    'stream: Unknown ERROR\0',
    'OK\0',
    'stream: OK\0extra',
    'stream: unsigned signature with spaces FOUND\0',
  ])('fails closed for malformed daemon replies %s', async (reply) => {
    const scanner = await fixture(reply);
    await expect(scanner.scan(Buffer.from('a'))).rejects.toBeInstanceOf(
      ScanError,
    );
  });
  it('rejects oversized replies', async () => {
    const scanner = await fixture(`${'a'.repeat(4097)}\0`);
    await expect(scanner.scan(Buffer.from('a'))).rejects.toBeInstanceOf(
      ScanError,
    );
  });
  it('fails closed on timeout and unframed truncated replies', async () => {
    const scanner = await fixture('stream: OK', undefined, 25);
    await expect(scanner.scan(Buffer.from('a'))).rejects.toBeInstanceOf(
      ScanError,
    );
  });
  it('fails closed when the daemon is unavailable', async () => {
    const scanner = await fixture(null);
    const address = server!.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing address');
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
    const unavailable = new ClamavContentScanner({
      host: '127.0.0.1',
      port: address.port,
      timeoutMs: 100,
    });
    await expect(unavailable.scan(Buffer.from('a'))).rejects.toBeInstanceOf(
      ScanError,
    );
    void scanner;
  });
  it('caps request bytes before contacting the daemon', async () => {
    const scanner = new ClamavContentScanner({
      host: '127.0.0.1',
      port: 3310,
      timeoutMs: 20,
      maxFileBytes: 1,
    });
    await expect(scanner.scan(Buffer.alloc(2))).rejects.toBeInstanceOf(
      ScanError,
    );
  });
});
describe('explicit development scanner', () => {
  it('detects the standard EICAR test marker and permits plain smoke-test text', async () => {
    const scanner = new DevelopmentContentScanner('test');
    await expect(scanner.scan(Buffer.from('hello'))).resolves.toEqual({
      status: 'clean',
    });
    await expect(
      scanner.scan(
        Buffer.from(
          'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
        ),
      ),
    ).resolves.toEqual({
      status: 'infected',
      signature: 'Eicar-Test-Signature',
    });
  });
  it('cannot be constructed in production', () =>
    expect(() => new DevelopmentContentScanner('production')).toThrow(
      'forbidden',
    ));
});
