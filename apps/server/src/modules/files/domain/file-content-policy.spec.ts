import {
  contentDisposition,
  normalizeFilename,
  sniffMime,
  validateFileContent,
} from './file-content-policy';
describe('attachment content and filename policy', () => {
  const png = () => {
    const bytes = Buffer.alloc(33);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
    bytes.writeUInt32BE(13, 8);
    bytes.write('IHDR', 12);
    bytes.writeUInt32BE(1, 16);
    bytes.writeUInt32BE(1, 20);
    return bytes;
  };
  const pdf = (content = '') =>
    Buffer.from(
      `%PDF-1.7\n1 0 obj\n<< /Type /Catalog ${content} >>\nendobj\n%%EOF\n`,
    );
  it('recognizes supported signatures and UTF8 plain text', () => {
    expect(validateFileContent(png(), 'image/png')).toBe('image/png');
    expect(
      validateFileContent(
        Buffer.from([255, 216, 255, 224, 255, 217]),
        'image/jpeg',
      ),
    ).toBe('image/jpeg');
    expect(validateFileContent(pdf(), 'application/pdf')).toBe(
      'application/pdf',
    );
    expect(validateFileContent(Buffer.from('Hello សួស្តី'), 'text/plain')).toBe(
      'text/plain',
    );
  });
  it('rejects a mismatching declared MIME and unsupported types', () => {
    expect(() =>
      validateFileContent(
        Buffer.from('png filename is misleading'),
        'image/png',
      ),
    ).toThrow('does not match');
    expect(() =>
      validateFileContent(png(), 'application/octet-stream'),
    ).toThrow('Unsupported');
  });
  it.each([
    '<html><body>hello</body></html>',
    '<svg xmlns="x"></svg>',
    '<script>alert(1)</script>',
    '<div>injected markup</div>',
    '<!DOCTYPE html>',
  ])('rejects active or injected HTML/SVG markup %s', (text) =>
    expect(() => validateFileContent(Buffer.from(text), 'text/plain')).toThrow(
      'markup',
    ),
  );
  it.each([
    '/S /JavaScript /JS (evil)',
    '/S /J#61vaScript /J#53 (evil)',
    '/OpenAction 2 0 R',
    '/AA 2 0 R',
    '/Launch (evil)',
    '/Type /ObjStm',
    '/EmbeddedFile',
    '/XFA 2 0 R',
  ])('rejects active or hidden PDF dictionaries %s', (value) =>
    expect(() => validateFileContent(pdf(value), 'application/pdf')).toThrow(
      'PDF',
    ),
  );
  it('rejects active markup appended to an allowed image signature', () =>
    expect(() =>
      validateFileContent(
        Buffer.concat([png(), Buffer.from('<script>x</script>')]),
        'image/png',
      ),
    ).toThrow('markup'));
  it.each([
    Buffer.alloc(0),
    Buffer.from([0x7f, 0x45, 0x4c, 0x46]),
    Buffer.from([0x50, 0x4b, 3, 4]),
    Buffer.from('MZ executable'),
    Buffer.from('#!/bin/sh'),
    Buffer.from([0xc0, 0xaf]),
    Buffer.from('%PDF-1.7\nmissing eof'),
  ])('rejects empty, executable, binary and truncated content', (bytes) =>
    expect(() => sniffMime(bytes)).toThrow(),
  );
  it.each([
    '../secret',
    'folder/file.txt',
    'folder\\file.txt',
    'header\r\nInjected:true',
    'bad\0name',
    '..',
    '',
    'x'.repeat(151),
    '\ud800',
    'unsafe\u202ename',
  ])('rejects unsafe filename %s', (name) =>
    expect(() => normalizeFilename(name)).toThrow(),
  );
  it('normalizes Unicode and produces escaped ASCII plus RFC5987 attachment names', () => {
    expect(normalizeFilename(' cafe\u0301.txt ')).toBe('café.txt');
    expect(contentDisposition('café "draft".txt')).toBe(
      'attachment; filename="caf_ _draft_.txt"; filename*=UTF-8\'\'caf%C3%A9%20%22draft%22.txt',
    );
    expect(contentDisposition("plan's (1).txt")).toContain(
      'plan%27s%20%281%29.txt',
    );
  });
});
