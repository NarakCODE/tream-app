import type {
  ContactAccess,
  ContactPage,
  ContactsRepository,
  CreateContactInput,
  CreateContactResult,
  DeleteContactInput,
  DeleteContactResult,
  ListCompanyContactsInput,
  ListContactsInput,
  ListDealContactsInput,
  UpdateContactInput,
  UpdateContactResult,
} from '../../src/modules/contacts/application/ports/contacts-repository.port';
import type { Contact } from '../../src/modules/contacts/domain/contact';
import { canWriteContacts } from '../../src/modules/contacts/domain/contact-role-policy';
import type { InMemoryWorkspaceRepository } from './in-memory-workspace.repository';

export class InMemoryContactsRepository implements ContactsRepository {
  private readonly contacts = new Map<string, Contact>();
  private companyValidator?: (
    workspaceId: string,
    companyId: string,
  ) => boolean;
  private dealContactProvider?: (
    workspaceId: string,
    dealId: string,
  ) => ReadonlySet<string>;

  constructor(
    private readonly workspaceRepository: InMemoryWorkspaceRepository,
  ) {}

  reset(): void {
    this.contacts.clear();
  }

  setCompanyValidator(
    validator: (workspaceId: string, companyId: string) => boolean,
  ): void {
    this.companyValidator = validator;
  }

  setDealContactProvider(
    provider: (workspaceId: string, dealId: string) => ReadonlySet<string>,
  ): void {
    this.dealContactProvider = provider;
  }

  list(input: ListContactsInput): Promise<ContactPage> {
    return this.listMatching(input, () => true);
  }

  listByCompany(input: ListCompanyContactsInput): Promise<ContactPage> {
    return this.listMatching(
      input,
      (contact) => contact.companyId === input.companyId,
    );
  }

  listByDeal(input: ListDealContactsInput): Promise<ContactPage> {
    const contactIds =
      this.dealContactProvider?.(input.workspaceId, input.dealId) ?? new Set();
    return this.listMatching(input, (contact) => contactIds.has(contact.id));
  }

  private listMatching(
    input: ListContactsInput,
    matches: (contact: Contact) => boolean,
  ): Promise<ContactPage> {
    const all = [...this.contacts.values()]
      .filter(
        (contact) =>
          contact.workspaceId === input.workspaceId &&
          contact.deletedAt === null &&
          matches(contact),
      )
      .sort((left, right) => {
        const byCreatedAt =
          right.createdAt.getTime() - left.createdAt.getTime();
        return byCreatedAt !== 0
          ? byCreatedAt
          : right.id.localeCompare(left.id);
      });
    const afterCursor =
      input.cursor === null
        ? all
        : all.filter(
            (contact) =>
              contact.createdAt < input.cursor!.createdAt ||
              (contact.createdAt.getTime() ===
                input.cursor!.createdAt.getTime() &&
                contact.id < input.cursor!.id),
          );
    return Promise.resolve({
      items: afterCursor.slice(0, input.limit),
      hasNext: afterCursor.length > input.limit,
      total: all.length,
    });
  }

  findByWorkspaceAndEmail(
    workspaceId: string,
    email: string,
  ): Promise<Contact | null> {
    return Promise.resolve(
      [...this.contacts.values()].find(
        (contact) =>
          contact.workspaceId === workspaceId &&
          contact.deletedAt === null &&
          contact.email.toLowerCase() === email.toLowerCase(),
      ) ?? null,
    );
  }

  async findAccess(
    contactId: string,
    userId: string,
  ): Promise<ContactAccess | null> {
    const contact = this.contacts.get(contactId);
    if (contact === undefined || contact.deletedAt !== null) {
      return null;
    }
    const access = await this.workspaceRepository.findActiveWorkspaceMembership(
      contact.workspaceId,
      userId,
    );
    return access === null ? null : { contact, role: access.membership.role };
  }

  async create(input: CreateContactInput): Promise<CreateContactResult> {
    const access = await this.workspaceRepository.findActiveWorkspaceMembership(
      input.contact.workspaceId,
      input.actorUserId,
    );
    if (access === null) {
      return { type: 'workspace_not_found' };
    }
    if (!canWriteContacts(access.membership.role)) {
      return { type: 'forbidden' };
    }
    if (
      input.contact.companyId !== null &&
      (this.companyValidator === undefined ||
        !this.companyValidator(
          input.contact.workspaceId,
          input.contact.companyId,
        ))
    ) {
      return { type: 'company_not_found' };
    }
    const existing = await this.findByWorkspaceAndEmail(
      input.contact.workspaceId,
      input.contact.email,
    );
    if (existing !== null) {
      return { type: 'email_conflict', existingContactId: existing.id };
    }
    this.contacts.set(input.contact.id, input.contact);
    return { type: 'created', contact: input.contact };
  }

  async update(input: UpdateContactInput): Promise<UpdateContactResult> {
    const access = await this.findAccess(input.contactId, input.actorUserId);
    if (access === null) {
      return { type: 'not_found' };
    }
    if (!canWriteContacts(access.role)) {
      return { type: 'forbidden' };
    }
    if (
      input.changes.companyId !== undefined &&
      input.changes.companyId !== null &&
      (this.companyValidator === undefined ||
        !this.companyValidator(
          access.contact.workspaceId,
          input.changes.companyId,
        ))
    ) {
      return { type: 'company_not_found' };
    }
    if (input.changes.email !== undefined) {
      const existing = await this.findByWorkspaceAndEmail(
        access.contact.workspaceId,
        input.changes.email,
      );
      if (existing !== null && existing.id !== input.contactId) {
        return { type: 'email_conflict', existingContactId: existing.id };
      }
    }
    const updated: Contact = {
      ...access.contact,
      ...input.changes,
      updatedAt: input.updatedAt,
    };
    this.contacts.set(updated.id, updated);
    return { type: 'updated', contact: updated };
  }

  async softDelete(input: DeleteContactInput): Promise<DeleteContactResult> {
    const access = await this.findAccess(input.contactId, input.actorUserId);
    if (access === null) {
      return { type: 'not_found' };
    }
    if (!canWriteContacts(access.role)) {
      return { type: 'forbidden' };
    }
    this.contacts.set(input.contactId, {
      ...access.contact,
      deletedAt: input.deletedAt,
      updatedAt: input.deletedAt,
    });
    return { type: 'deleted' };
  }

  isActiveInWorkspace(workspaceId: string, contactId: string): boolean {
    const contact = this.contacts.get(contactId);
    return contact?.workspaceId === workspaceId && contact.deletedAt === null;
  }
}
