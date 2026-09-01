import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import type { CursorPaginatedResult } from '../../../common/interfaces/api-response.interface';
import { decodeCursor, encodeCursor } from '../../../common/pagination/cursor';
import { AppErrorCode } from '../../../common/enums/app-error-code.enum';
import { AppException } from '../../../common/exceptions/app.exception';
import { ResourceConflictException } from '../../../common/exceptions/resource-conflict.exception';
import { ResourceNotFoundException } from '../../../common/exceptions/resource-not-found.exception';
import type { Contact, ContactStatus } from '../domain/contact';
import {
  CONTACTS_REPOSITORY,
  type ContactChanges,
  type ContactsRepository,
} from './ports/contacts-repository.port';

export interface CreateContactCommand {
  companyId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  phone?: string | null;
  status?: ContactStatus;
  attributes?: Record<string, unknown>;
}

export type UpdateContactCommand = ContactChanges;

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

@Injectable()
export class ContactsService {
  constructor(
    @Inject(CONTACTS_REPOSITORY)
    private readonly repository: ContactsRepository,
  ) {}

  async list(
    workspaceId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<CursorPaginatedResult<Contact>> {
    const page = await this.repository.list({
      workspaceId,
      cursor: cursor === undefined ? null : decodeCursor(cursor),
      limit,
    });
    const last = page.items.at(-1);
    return {
      paginationType: 'cursor',
      items: page.items,
      cursor: cursor ?? null,
      nextCursor:
        page.hasNext && last !== undefined
          ? encodeCursor({ createdAt: last.createdAt, id: last.id })
          : null,
      hasNext: page.hasNext,
      limit,
      total: page.total,
    };
  }

  async findByEmail(workspaceId: string, email: string): Promise<Contact> {
    const contact = await this.repository.findByWorkspaceAndEmail(
      workspaceId,
      normalizeEmail(email),
    );
    if (contact === null) {
      throw new ResourceNotFoundException('Contact', email);
    }
    return contact;
  }

  async create(
    workspaceId: string,
    actorUserId: string,
    input: CreateContactCommand,
  ): Promise<Contact> {
    const now = new Date();
    const contact: Contact = {
      id: `con_${ulid()}`,
      workspaceId,
      companyId: input.companyId ?? null,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      email: normalizeEmail(input.email),
      phone: input.phone ?? null,
      status: input.status ?? 'LEAD',
      attributes: input.attributes ?? {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    const result = await this.repository.create({ contact, actorUserId });
    if (result.type === 'created') {
      return result.contact;
    }
    if (result.type === 'email_conflict') {
      throw this.emailConflict(result.existingContactId);
    }
    if (result.type === 'company_not_found') {
      throw new ResourceNotFoundException('Company', input.companyId as string);
    }
    throw this.forbidden();
  }

  async update(
    contactId: string,
    actorUserId: string,
    input: UpdateContactCommand,
  ): Promise<Contact> {
    const changes: ContactChanges = {
      ...input,
      ...(input.email === undefined
        ? {}
        : { email: normalizeEmail(input.email) }),
    };
    const result = await this.repository.update({
      contactId,
      actorUserId,
      changes,
      updatedAt: new Date(),
    });
    if (result.type === 'updated') {
      return result.contact;
    }
    if (result.type === 'email_conflict') {
      throw this.emailConflict(result.existingContactId);
    }
    if (result.type === 'company_not_found') {
      throw new ResourceNotFoundException('Company', input.companyId as string);
    }
    throw this.forbidden();
  }

  async delete(contactId: string, actorUserId: string): Promise<void> {
    const result = await this.repository.softDelete({
      contactId,
      actorUserId,
      deletedAt: new Date(),
    });
    if (result.type !== 'deleted') {
      throw this.forbidden();
    }
  }

  private emailConflict(existingContactId: string): ResourceConflictException {
    return new ResourceConflictException(
      'An active contact with this email already exists in the workspace.',
      {
        field: 'email',
        existingContactId,
        recommendation: 'Merge with the existing contact.',
      },
    );
  }

  private forbidden(): AppException {
    return new AppException(
      AppErrorCode.Forbidden,
      'You do not have access to this contact.',
      HttpStatus.FORBIDDEN,
    );
  }
}
