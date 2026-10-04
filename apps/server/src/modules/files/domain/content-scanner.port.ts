export type ScanResult =
  { status: 'clean' } | { status: 'infected'; signature?: string };
export class ScanError extends Error {
  constructor() {
    super('File scanning is unavailable or returned an invalid result.');
  }
}
/** Errors are inconclusive, never a clean verdict. */
export abstract class ContentScanner {
  abstract scan(bytes: Buffer): Promise<ScanResult>;
}
