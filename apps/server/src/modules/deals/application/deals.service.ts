import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import { AppErrorCode } from '../../../common/enums/app-error-code.enum';
import { AppException } from '../../../common/exceptions/app.exception';
import { ResourceConflictException } from '../../../common/exceptions/resource-conflict.exception';
import { ResourceNotFoundException } from '../../../common/exceptions/resource-not-found.exception';
import { ValidationException } from '../../../common/exceptions/validation.exception';
import type { CursorPaginatedResult } from '../../../common/interfaces/api-response.interface';
import { decodeCursor, encodeCursor } from '../../../common/pagination/cursor';
import type { Deal, DealStage } from '../domain/deal';
import { DEFAULT_DEAL_STAGE, isDealStage } from '../domain/deal-stage-policy';
import { normalizeCurrency, normalizeMoney } from '../domain/money';
import {
  DEALS_REPOSITORY,
  type DealChanges,
  type DealsRepository,
} from './ports/deals-repository.port';

export interface CreateDealCommand {
  companyId?: string | null;
  title: string;
  amount?: string;
  currency?: string;
  stage?: DealStage;
  closeDate?: string | null;
}

export interface UpdateDealCommand {
  companyId?: string | null;
  title?: string;
  amount?: string;
  currency?: string;
  stage?: DealStage;
  closeDate?: string | null;
}

@Injectable()
export class DealsService {
  constructor(
    @Inject(DEALS_REPOSITORY)
    private readonly repository: DealsRepository,
  ) {}

  async list(
    workspaceId: string,
    stage: DealStage | undefined,
    companyId: string | undefined,
    cursor: string | undefined,
    limit: number,
  ): Promise<CursorPaginatedResult<Deal>> {
    const page = await this.repository.list({
      workspaceId,
      ...(stage === undefined ? {} : { stage }),
      ...(companyId === undefined ? {} : { companyId }),
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

  async create(
    workspaceId: string,
    actorUserId: string,
    input: CreateDealCommand,
  ): Promise<Deal> {
    const now = new Date();
    const deal: Deal = {
      id: `del_${ulid()}`,
      workspaceId,
      companyId: input.companyId ?? null,
      title: input.title,
      amount: this.requireMoney(input.amount ?? '0.00'),
      currency: this.requireCurrency(input.currency ?? 'USD'),
      stage: this.requireStage(input.stage ?? DEFAULT_DEAL_STAGE),
      closeDate: this.toCloseDate(input.closeDate),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    const result = await this.repository.create({ deal, actorUserId });
    if (result.type === 'created') {
      return result.deal;
    }
    if (result.type === 'invalid_company') {
      throw new ResourceNotFoundException('Company', input.companyId as string);
    }
    throw this.forbidden();
  }

  async update(
    dealId: string,
    actorUserId: string,
    input: UpdateDealCommand,
  ): Promise<Deal> {
    const changes: DealChanges = {
      ...(input.companyId === undefined ? {} : { companyId: input.companyId }),
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.amount === undefined
        ? {}
        : { amount: this.requireMoney(input.amount) }),
      ...(input.currency === undefined
        ? {}
        : { currency: this.requireCurrency(input.currency) }),
      ...(input.stage === undefined
        ? {}
        : { stage: this.requireStage(input.stage) }),
      ...(input.closeDate === undefined
        ? {}
        : { closeDate: this.toCloseDate(input.closeDate) }),
    };
    const result = await this.repository.update({
      dealId,
      actorUserId,
      changes,
      updatedAt: new Date(),
    });
    if (result.type === 'updated' || result.type === 'unchanged') {
      return result.deal;
    }
    if (result.type === 'invalid_company') {
      throw new ResourceNotFoundException('Company', input.companyId as string);
    }
    if (result.type === 'invalid_stage_transition') {
      throw new ValidationException([
        {
          field: 'stage',
          constraints: ['stage transition is not allowed'],
        },
      ]);
    }
    throw this.forbidden();
  }

  async delete(dealId: string, actorUserId: string): Promise<void> {
    const result = await this.repository.softDelete({
      dealId,
      actorUserId,
      deletedAt: new Date(),
    });
    if (result.type !== 'deleted') {
      throw this.forbidden();
    }
  }

  async addContact(
    dealId: string,
    contactId: string,
    actorUserId: string,
  ): Promise<void> {
    const result = await this.repository.addContact({
      dealId,
      contactId,
      actorUserId,
    });
    if (result.type === 'associated') {
      return;
    }
    if (result.type === 'invalid_contact') {
      throw new ResourceNotFoundException('Contact', contactId);
    }
    if (result.type === 'already_associated') {
      throw new ResourceConflictException(
        'The contact is already associated with this deal.',
        { dealId, contactId },
      );
    }
    throw this.forbidden();
  }

  async removeContact(
    dealId: string,
    contactId: string,
    actorUserId: string,
  ): Promise<void> {
    const result = await this.repository.removeContact({
      dealId,
      contactId,
      actorUserId,
    });
    if (result.type === 'removed') {
      return;
    }
    if (result.type === 'association_not_found') {
      throw new ResourceNotFoundException(
        'Deal contact association',
        contactId,
      );
    }
    throw this.forbidden();
  }

  private requireMoney(value: string): string {
    const normalized = normalizeMoney(value);
    if (normalized === null) {
      throw new ValidationException([
        {
          field: 'amount',
          constraints: [
            'amount must be a non-negative decimal with at most 10 integer digits and 2 fractional digits',
          ],
        },
      ]);
    }
    return normalized;
  }

  private requireCurrency(value: string): string {
    const normalized = normalizeCurrency(value);
    if (normalized === null) {
      throw new ValidationException([
        {
          field: 'currency',
          constraints: ['currency must be exactly 3 ASCII letters'],
        },
      ]);
    }
    return normalized;
  }

  private requireStage(value: string): DealStage {
    if (!isDealStage(value)) {
      throw new ValidationException([
        { field: 'stage', constraints: ['stage must be DISCOVERY'] },
      ]);
    }
    return value;
  }

  private toCloseDate(value: string | null | undefined): Date | null {
    if (value === undefined || value === null) {
      return null;
    }
    const closeDate = new Date(value);
    if (Number.isNaN(closeDate.getTime())) {
      throw new ValidationException([
        { field: 'closeDate', constraints: ['closeDate must be an ISO date'] },
      ]);
    }
    return closeDate;
  }

  private forbidden(): AppException {
    return new AppException(
      AppErrorCode.Forbidden,
      'You do not have access to this deal.',
      HttpStatus.FORBIDDEN,
    );
  }
}
