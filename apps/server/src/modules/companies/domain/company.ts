export interface Company {
  id: string;
  workspaceId: string;
  name: string;
  domain: string | null;
  industry: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
