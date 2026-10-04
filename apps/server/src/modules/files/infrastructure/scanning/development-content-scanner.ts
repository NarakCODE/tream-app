import {
  ContentScanner,
  ScanError,
  type ScanResult,
} from '../../domain/content-scanner.port';
import { MAX_STORED_FILE_BYTES } from '../storage/storage-policy';
/** Development smoke checks only; this is deliberately not an antivirus engine. */
export class DevelopmentContentScanner extends ContentScanner {
  constructor(nodeEnv: string) {
    super();
    if (nodeEnv === 'production')
      throw new Error('Development scanning is forbidden in production.');
  }
  scan(bytes: Buffer): Promise<ScanResult> {
    if (bytes.length > MAX_STORED_FILE_BYTES)
      return Promise.reject(new ScanError());
    const eicar =
      'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
    return Promise.resolve(
      bytes.includes(Buffer.from(eicar))
        ? { status: 'infected', signature: 'Eicar-Test-Signature' }
        : { status: 'clean' },
    );
  }
}
