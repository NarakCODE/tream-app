import { Inject, Injectable } from '@nestjs/common';
import type { CursorPaginatedResult } from '../../../common/interfaces/api-response.interface';
import { decodeCursor, encodeCursor } from '../../../common/pagination/cursor';
import type { Contact } from '../domain/contact';
import {
  CONTACTS_REPOSITORY,
  type ContactsRepository,
} from './ports/contacts-repository.port';

@Injectable()
export class ContactsQueryService {
  constructor(
    @Inject(CONTACTS_REPOSITORY)
    private readonly repository: ContactsRepository,
  ) {}

  async listForCompany(
    workspaceId: string,
    companyId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<CursorPaginatedResult<Contact>> {
    const page = await this.repository.listByCompany({
      workspaceId,
      companyId,
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

  async listForDeal(
    workspaceId: string,
    dealId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<CursorPaginatedResult<Contact>> {
    const page = await this.repository.listByDeal({
      workspaceId,
      dealId,
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
}
