export const CONTACT_STATUSES = ['LEAD'] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export interface Contact {
  id: string;
  workspaceId: string;
  companyId: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  status: ContactStatus;
  attributes: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
