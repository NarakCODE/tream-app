export const ALLOWED_FILE_MIMES = [
  'image/png',
  'image/jpeg',
  'application/pdf',
  'text/plain',
] as const;
export type AllowedMime = (typeof ALLOWED_FILE_MIMES)[number];
export class FileContentError extends Error {
  constructor(message: string) {
    super(message);
  }
}
export function normalizeFilename(value: string): string {
  const name = value.normalize('NFC').trim();
  if (
    !name ||
    name.length > 150 ||
    hasControl(name) ||
    name.includes('/') ||
    name.includes('\\') ||
    Buffer.from(name, 'utf8').toString('utf8') !== name ||
    /^\.+$/.test(name) ||
    /[\u202a-\u202e\u2066-\u2069]/u.test(name)
  )
    throw new FileContentError(
      'Filename must be a plain name of at most 150 characters without paths or controls.',
    );
  return name;
}
export function contentDisposition(value: string): string {
  const name = normalizeFilename(value);
  const fallback = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
function activeMarkup(text: string) {
  return /<\s*(?:!doctype\b[^<>]*|\/[a-z][a-z0-9:-]*\s*|[a-z][a-z0-9:-]*(?:\s+[^<>]*)?\/?)>/i.test(
    text,
  );
}
function hasControl(value: string, allowWhitespace = false) {
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (
      (code < 32 || (code >= 127 && code <= 159)) &&
      !(allowWhitespace && [9, 10, 13].includes(code))
    )
      return true;
  }
  return false;
}
export function sniffMime(bytes: Buffer): AllowedMime {
  if (!bytes.length)
    throw new FileContentError('Empty files are not supported.');
  // Signature checks are deliberately narrow. Content is always served as an attachment.
  if (
    bytes.length >= 33 &&
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    bytes.toString('ascii', 12, 16) === 'IHDR' &&
    bytes.readUInt32BE(8) === 13 &&
    bytes.readUInt32BE(16) > 0 &&
    bytes.readUInt32BE(20) > 0
  )
    return 'image/png';
  if (
    bytes.length >= 4 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255 &&
    bytes[bytes.length - 2] === 255 &&
    bytes[bytes.length - 1] === 217
  )
    return 'image/jpeg';
  if (
    /^%PDF-(?:1\.[0-7]|2\.0)(?:\r|\n)/.test(bytes.toString('latin1', 0, 12)) &&
    /%%EOF\s*$/.test(
      bytes.subarray(Math.max(0, bytes.length - 1024)).toString('latin1'),
    )
  )
    return 'application/pdf';
  if (bytes.subarray(0, 5).toString('ascii') === '%PDF-')
    throw new FileContentError('Unsupported or truncated PDF content.');
  // Fatal UTF-8 decoding rejects disguised binary files, executable headers, ZIPs, etc.
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new FileContentError('Unsupported file content.');
  }
  if (hasControl(text, true) || /^(?:MZ|#!)/.test(text))
    throw new FileContentError('Unsupported file content.');
  return 'text/plain';
}
export function validateFileContent(
  bytes: Buffer,
  declaredMime: string,
): AllowedMime {
  if (!ALLOWED_FILE_MIMES.includes(declaredMime as AllowedMime))
    throw new FileContentError('Unsupported file MIME type.');
  const actual = sniffMime(bytes);
  if (actual !== declaredMime)
    throw new FileContentError(
      'Declared MIME type does not match the file content.',
    );
  const raw = bytes.toString('latin1');
  if (
    actual === 'text/plain'
      ? activeMarkup(raw)
      : /<\s*(?:!doctype\b|\/?(?:html|script|svg|iframe|object|embed)\b)/i.test(
          raw,
        )
  )
    throw new FileContentError('Active markup is not allowed in attachments.');
  if (actual === 'application/pdf') {
    const decodedNames = raw.replace(/#([a-f0-9]{2})/gi, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
    // Object streams can hide active dictionaries from a byte-level policy; reject
    // them rather than treating an unparsed compressed dictionary as safe.
    if (
      /\/(?:JavaScript|JS|OpenAction|AA|Launch|RichMedia|EmbeddedFile|ObjStm|XFA)\b/i.test(
        decodedNames,
      )
    )
      throw new FileContentError(
        'Active or embedded PDF content is not allowed.',
      );
  }
  return actual;
}
