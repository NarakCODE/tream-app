export type FileTarget = {
  targetType: 'issue' | 'project' | 'comment' | 'document';
  targetId: string;
};
export const canManageFile = (
  ownerId: string,
  member: { id: string; role: string },
) => ownerId === member.id || ['OWNER', 'ADMIN'].includes(member.role);
export const canRestoreFile = (
  file: { status: string; readyAt: Date | null; purgeAfter: Date | null },
  now: Date,
) =>
  file.status === 'DELETED' &&
  file.readyAt !== null &&
  (file.purgeAfter === null || file.purgeAfter > now);
export const publicFile = <T extends { storageKey: string }>(file: T) => {
  const { storageKey, ...metadata } = file;
  void storageKey;
  return metadata;
};
