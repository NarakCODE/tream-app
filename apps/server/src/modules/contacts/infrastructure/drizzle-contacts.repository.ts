import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { DatabaseService } from '../../../database/database.service';
import {
  companies,
  contacts,
  dealContacts,
  memberships,
  workspaces,
} from '../../../database/schema';
import type {
  ContactAccess,
  ContactChanges,
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
} from '../application/ports/contacts-repository.port';
import type { Contact } from '../domain/contact';
import { canWriteContacts } from '../domain/contact-role-policy';

const first = <T>(values: T[]): T | null => values[0] ?? null;

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === '23505';

const activeWorkspaceFilter = (workspaceId: string) =>
  and(eq(workspaces.id, workspaceId), isNull(workspaces.deletedAt));

const activeContactFilter = (contactId: string) =>
  and(eq(contacts.id, contactId), isNull(contacts.deletedAt));

const normalizedEmailFilter = (workspaceId: string, email: string) =>
  and(
    eq(contacts.workspaceId, workspaceId),
    eq(sql<string>`lower(${contacts.email})`, email.toLowerCase()),
    isNull(contacts.deletedAt),
  );

@Injectable()
export class DrizzleContactsRepository implements ContactsRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(input: ListContactsInput): Promise<ContactPage> {
    const cursorFilter =
      input.cursor === null
        ? undefined
        : or(
            lt(contacts.createdAt, input.cursor.createdAt),
            and(
              eq(contacts.createdAt, input.cursor.createdAt),
              lt(contacts.id, input.cursor.id),
            ),
          );
    const filters = and(
      eq(contacts.workspaceId, input.workspaceId),
      isNull(contacts.deletedAt),
      cursorFilter,
    );
    const [rows, totals] = await Promise.all([
      this.database.db
        .select()
        .from(contacts)
        .where(filters)
        .orderBy(desc(contacts.createdAt), desc(contacts.id))
        .limit(input.limit + 1),
      this.database.db
        .select({ value: count() })
        .from(contacts)
        .where(
          and(
            eq(contacts.workspaceId, input.workspaceId),
            isNull(contacts.deletedAt),
          ),
        ),
    ]);
    return {
      items: rows.slice(0, input.limit),
      hasNext: rows.length > input.limit,
      total: totals[0]?.value ?? 0,
    };
  }

  async listByCompany(input: ListCompanyContactsInput): Promise<ContactPage> {
    const cursorFilter =
      input.cursor === null
        ? undefined
        : or(
            lt(contacts.createdAt, input.cursor.createdAt),
            and(
              eq(contacts.createdAt, input.cursor.createdAt),
              lt(contacts.id, input.cursor.id),
            ),
          );
    const companyFilters = and(
      eq(contacts.workspaceId, input.workspaceId),
      eq(contacts.companyId, input.companyId),
      isNull(contacts.deletedAt),
    );
    const [rows, totals] = await Promise.all([
      this.database.db
        .select()
        .from(contacts)
        .where(and(companyFilters, cursorFilter))
        .orderBy(desc(contacts.createdAt), desc(contacts.id))
        .limit(input.limit + 1),
      this.database.db
        .select({ value: count() })
        .from(contacts)
        .where(companyFilters),
    ]);
    return {
      items: rows.slice(0, input.limit),
      hasNext: rows.length > input.limit,
      total: totals[0]?.value ?? 0,
    };
  }

  async listByDeal(input: ListDealContactsInput): Promise<ContactPage> {
    const cursorFilter =
      input.cursor === null
        ? undefined
        : or(
            lt(contacts.createdAt, input.cursor.createdAt),
            and(
              eq(contacts.createdAt, input.cursor.createdAt),
              lt(contacts.id, input.cursor.id),
            ),
          );
    const associationFilter = and(
      eq(dealContacts.workspaceId, input.workspaceId),
      eq(dealContacts.dealId, input.dealId),
      isNull(contacts.deletedAt),
    );
    const [rows, totals] = await Promise.all([
      this.database.db
        .select({ contact: contacts })
        .from(dealContacts)
        .innerJoin(contacts, eq(contacts.id, dealContacts.contactId))
        .where(and(associationFilter, cursorFilter))
        .orderBy(desc(contacts.createdAt), desc(contacts.id))
        .limit(input.limit + 1),
      this.database.db
        .select({ value: count() })
        .from(dealContacts)
        .innerJoin(contacts, eq(contacts.id, dealContacts.contactId))
        .where(associationFilter),
    ]);
    return {
      items: rows.slice(0, input.limit).map(({ contact }) => contact),
      hasNext: rows.length > input.limit,
      total: totals[0]?.value ?? 0,
    };
  }

  async findByWorkspaceAndEmail(
    workspaceId: string,
    email: string,
  ): Promise<Contact | null> {
    return first(
      await this.database.db
        .select()
        .from(contacts)
        .where(normalizedEmailFilter(workspaceId, email))
        .limit(1),
    );
  }

  async findAccess(
    contactId: string,
    userId: string,
  ): Promise<ContactAccess | null> {
    const row = first(
      await this.database.db
        .select({ contact: contacts, role: memberships.role })
        .from(contacts)
        .innerJoin(workspaces, eq(workspaces.id, contacts.workspaceId))
        .innerJoin(
          memberships,
          and(
            eq(memberships.workspaceId, contacts.workspaceId),
            eq(memberships.userId, userId),
          ),
        )
        .where(
          and(
            eq(contacts.id, contactId),
            isNull(contacts.deletedAt),
            isNull(workspaces.deletedAt),
          ),
        )
        .limit(1),
    );
    return row;
  }

  async create(input: CreateContactInput): Promise<CreateContactResult> {
    try {
      return await this.database.db.transaction(async (transaction) => {
        const workspace = first(
          await transaction
            .select({ id: workspaces.id })
            .from(workspaces)
            .where(activeWorkspaceFilter(input.contact.workspaceId))
            .for('update')
            .limit(1),
        );
        if (workspace === null) {
          return { type: 'workspace_not_found' } as const;
        }

        const actor = first(
          await transaction
            .select({ role: memberships.role })
            .from(memberships)
            .where(
              and(
                eq(memberships.workspaceId, input.contact.workspaceId),
                eq(memberships.userId, input.actorUserId),
              ),
            )
            .limit(1),
        );
        if (actor === null || !canWriteContacts(actor.role)) {
          return { type: 'forbidden' } as const;
        }

        if (input.contact.companyId !== null) {
          const company = first(
            await transaction
              .select({ id: companies.id })
              .from(companies)
              .where(
                and(
                  eq(companies.id, input.contact.companyId),
                  eq(companies.workspaceId, input.contact.workspaceId),
                  isNull(companies.deletedAt),
                ),
              )
              .limit(1),
          );
          if (company === null) {
            return { type: 'company_not_found' } as const;
          }
        }

        const existing = first(
          await transaction
            .select({ id: contacts.id })
            .from(contacts)
            .where(
              normalizedEmailFilter(
                input.contact.workspaceId,
                input.contact.email,
              ),
            )
            .limit(1),
        );
        if (existing !== null) {
          return {
            type: 'email_conflict',
            existingContactId: existing.id,
          } as const;
        }

        const created = first(
          await transaction.insert(contacts).values(input.contact).returning(),
        );
        if (created === null) {
          throw new Error('The contact insert returned no row.');
        }
        return { type: 'created', contact: created } as const;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const existing = await this.findByWorkspaceAndEmail(
          input.contact.workspaceId,
          input.contact.email,
        );
        if (existing !== null) {
          return {
            type: 'email_conflict',
            existingContactId: existing.id,
          };
        }
      }
      throw error;
    }
  }

  async update(input: UpdateContactInput): Promise<UpdateContactResult> {
    try {
      return await this.database.db.transaction(async (transaction) => {
        const contactWorkspace = first(
          await transaction
            .select({ workspaceId: contacts.workspaceId })
            .from(contacts)
            .where(activeContactFilter(input.contactId))
            .limit(1),
        );
        if (contactWorkspace === null) {
          return { type: 'not_found' } as const;
        }

        const workspace = first(
          await transaction
            .select({ id: workspaces.id })
            .from(workspaces)
            .where(activeWorkspaceFilter(contactWorkspace.workspaceId))
            .for('update')
            .limit(1),
        );
        if (workspace === null) {
          return { type: 'not_found' } as const;
        }

        const actor = first(
          await transaction
            .select({ role: memberships.role })
            .from(memberships)
            .where(
              and(
                eq(memberships.workspaceId, contactWorkspace.workspaceId),
                eq(memberships.userId, input.actorUserId),
              ),
            )
            .limit(1),
        );
        if (actor === null || !canWriteContacts(actor.role)) {
          return { type: 'forbidden' } as const;
        }

        const active = first(
          await transaction
            .select({ id: contacts.id })
            .from(contacts)
            .where(activeContactFilter(input.contactId))
            .for('update')
            .limit(1),
        );
        if (active === null) {
          return { type: 'not_found' } as const;
        }

        if (
          input.changes.companyId !== undefined &&
          input.changes.companyId !== null
        ) {
          const company = first(
            await transaction
              .select({ id: companies.id })
              .from(companies)
              .where(
                and(
                  eq(companies.id, input.changes.companyId),
                  eq(companies.workspaceId, contactWorkspace.workspaceId),
                  isNull(companies.deletedAt),
                ),
              )
              .limit(1),
          );
          if (company === null) {
            return { type: 'company_not_found' } as const;
          }
        }

        if (input.changes.email !== undefined) {
          const existing = first(
            await transaction
              .select({ id: contacts.id })
              .from(contacts)
              .where(
                normalizedEmailFilter(
                  contactWorkspace.workspaceId,
                  input.changes.email,
                ),
              )
              .limit(1),
          );
          if (existing !== null && existing.id !== input.contactId) {
            return {
              type: 'email_conflict',
              existingContactId: existing.id,
            } as const;
          }
        }

        const updated = first(
          await transaction
            .update(contacts)
            .set({
              ...this.toContactChanges(input.changes),
              updatedAt: input.updatedAt,
            })
            .where(activeContactFilter(input.contactId))
            .returning(),
        );
        return updated === null
          ? ({ type: 'not_found' } as const)
          : ({ type: 'updated', contact: updated } as const);
      });
    } catch (error) {
      if (isUniqueViolation(error) && input.changes.email !== undefined) {
        const target = first(
          await this.database.db
            .select({ workspaceId: contacts.workspaceId })
            .from(contacts)
            .where(eq(contacts.id, input.contactId))
            .limit(1),
        );
        if (target !== null) {
          const existing = await this.findByWorkspaceAndEmail(
            target.workspaceId,
            input.changes.email,
          );
          if (existing !== null) {
            return {
              type: 'email_conflict',
              existingContactId: existing.id,
            };
          }
        }
      }
      throw error;
    }
  }

  async softDelete(input: DeleteContactInput): Promise<DeleteContactResult> {
    return this.database.db.transaction(async (transaction) => {
      const contactWorkspace = first(
        await transaction
          .select({ workspaceId: contacts.workspaceId })
          .from(contacts)
          .where(activeContactFilter(input.contactId))
          .limit(1),
      );
      if (contactWorkspace === null) {
        return { type: 'not_found' } as const;
      }

      const workspace = first(
        await transaction
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(activeWorkspaceFilter(contactWorkspace.workspaceId))
          .for('update')
          .limit(1),
      );
      if (workspace === null) {
        return { type: 'not_found' } as const;
      }

      const actor = first(
        await transaction
          .select({ role: memberships.role })
          .from(memberships)
          .where(
            and(
              eq(memberships.workspaceId, contactWorkspace.workspaceId),
              eq(memberships.userId, input.actorUserId),
            ),
          )
          .limit(1),
      );
      if (actor === null || !canWriteContacts(actor.role)) {
        return { type: 'forbidden' } as const;
      }

      const deleted = await transaction
        .update(contacts)
        .set({ deletedAt: input.deletedAt, updatedAt: input.deletedAt })
        .where(activeContactFilter(input.contactId))
        .returning({ id: contacts.id });
      return deleted.length === 0
        ? ({ type: 'not_found' } as const)
        : ({ type: 'deleted' } as const);
    });
  }

  private toContactChanges(changes: ContactChanges): ContactChanges {
    return {
      ...(changes.companyId === undefined
        ? {}
        : { companyId: changes.companyId }),
      ...(changes.firstName === undefined
        ? {}
        : { firstName: changes.firstName }),
      ...(changes.lastName === undefined ? {} : { lastName: changes.lastName }),
      ...(changes.email === undefined ? {} : { email: changes.email }),
      ...(changes.phone === undefined ? {} : { phone: changes.phone }),
      ...(changes.status === undefined ? {} : { status: changes.status }),
      ...(changes.attributes === undefined
        ? {}
        : { attributes: changes.attributes }),
    };
  }
}
