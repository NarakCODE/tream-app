export type FileGrantOperation = 'upload' | 'download';
export interface FileGrantClaims {
  operation: FileGrantOperation;
  userId: string;
  workspaceId: string;
  fileId: string;
  attachmentId: string;
  membershipId: string;
  sessionId: string;
  expiresAt: number;
}
export class FileGrantError extends Error {
  constructor() {
    super('Invalid or expired file grant.');
  }
}
export abstract class FileGrant {
  abstract sign(claims: FileGrantClaims): string;
  abstract verify(
    token: string,
    operation: FileGrantOperation,
  ): FileGrantClaims;
}
