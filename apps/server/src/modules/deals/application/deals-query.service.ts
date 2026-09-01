import { Inject, Injectable } from '@nestjs/common';
import type { CursorPaginatedResult } from '../../../common/interfaces/api-response.interface';
import { decodeCursor, encodeCursor } from '../../../common/pagination/cursor';
import type { Deal } from '../domain/deal';
import {
  DEALS_REPOSITORY,
  type DealsRepository,
} from './ports/deals-repository.port';

@Injectable()
export class DealsQueryService {
  constructor(
    @Inject(DEALS_REPOSITORY)
    private readonly repository: DealsRepository,
  ) {}

  async listForCompany(
    workspaceId: string,
    companyId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<CursorPaginatedResult<Deal>> {
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
}
