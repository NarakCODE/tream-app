import { canManageFile, canRestoreFile, publicFile } from './file-policy';
describe('file lifecycle policies', () => {
  it('only author or visible workspace administrator can manage files', () => {
    expect(canManageFile('owner', { id: 'owner', role: 'MEMBER' })).toBe(true);
    expect(canManageFile('owner', { id: 'admin', role: 'ADMIN' })).toBe(true);
    expect(canManageFile('owner', { id: 'other', role: 'MEMBER' })).toBe(false);
  });
  it('restores clean retained bytes before retention deadline but never after purge claim', () => {
    const now = new Date();
    const file = {
      status: 'DELETED',
      readyAt: now,
      purgeAfter: new Date(now.getTime() + 1000),
    };
    expect(canRestoreFile(file, now)).toBe(true);
    for (const status of ['PURGING', 'PURGED', 'PENDING', 'EXPIRED'])
      expect(canRestoreFile({ ...file, status }, now)).toBe(false);
    expect(canRestoreFile({ ...file, readyAt: null }, now)).toBe(false);
    expect(canRestoreFile({ ...file, purgeAfter: now }, now)).toBe(false);
  });
  it('never exposes object keys through API serialization', () =>
    expect(publicFile({ id: 'file', storageKey: 'private/path' })).toEqual({
      id: 'file',
    }));
});
