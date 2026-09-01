import type { CursorTuple } from '../../../../common/pagination/cursor';
import type { WorkspaceRole } from '../../../iam/domain/workspace-membership';
import type { Contact, ContactStatus } from '../../domain/contact';

export const CONTACTS_REPOSITORY = Symbol('CONTACTS_REPOSITORY');

export interface ContactAccess {
  contact: Contact;
  role: WorkspaceRole;
}

export interface ListContactsInput {
  workspaceId: string;
  cursor: CursorTuple | null;
  limit: number;
}

export interface ContactPage {
  items: Contact[];
  hasNext: boolean;
  total: number;
}

export interface ListCompanyContactsInput extends ListContactsInput {
  companyId: string;
}

export interface ListDealContactsInput extends ListContactsInput {
  dealId: string;
}

export interface CreateContactInput {
  contact: Contact;
  actorUserId: string;
}

export type CreateContactResult =
  | { type: 'created'; contact: Contact }
  | { type: 'workspace_not_found' }
  | { type: 'forbidden' }
  | { type: 'company_not_found' }
  | { type: 'email_conflict'; existingContactId: string };

export interface ContactChanges {
  companyId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string;
  phone?: string | null;
  status?: ContactStatus;
  attributes?: Record<string, unknown>;
}

export interface UpdateContactInput {
  contactId: string;
  actorUserId: string;
  changes: ContactChanges;
  updatedAt: Date;
}

export type UpdateContactResult =
  | { type: 'updated'; contact: Contact }
  | { type: 'not_found' }
  | { type: 'forbidden' }
  | { type: 'company_not_found' }
  | { type: 'email_conflict'; existingContactId: string };

export interface DeleteContactInput {
  contactId: string;
  actorUserId: string;
  deletedAt: Date;
}

export type DeleteContactResult =
  { type: 'deleted' } | { type: 'not_found' } | { type: 'forbidden' };

export interface ContactsRepository {
  list(input: ListContactsInput): Promise<ContactPage>;
  listByCompany(input: ListCompanyContactsInput): Promise<ContactPage>;
  listByDeal(input: ListDealContactsInput): Promise<ContactPage>;
  findByWorkspaceAndEmail(
    workspaceId: string,
    email: string,
  ): Promise<Contact | null>;
  findAccess(contactId: string, userId: string): Promise<ContactAccess | null>;
  create(input: CreateContactInput): Promise<CreateContactResult>;
  update(input: UpdateContactInput): Promise<UpdateContactResult>;
  softDelete(input: DeleteContactInput): Promise<DeleteContactResult>;
}
