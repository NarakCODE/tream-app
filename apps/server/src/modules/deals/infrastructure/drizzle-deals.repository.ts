import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, isNull, lt, or } from 'drizzle-orm';
import { DatabaseService } from '../../../database/database.service';
import {
  companies,
  contacts,
  dealContacts,
  deals,
  memberships,
  workspaces,
} from '../../../database/schema';
import type {
  AddDealContactResult,
  CreateDealInput,
  CreateDealResult,
  DealAccess,
  DealChanges,
  DealContactInput,
  DealPage,
  DealsRepository,
  DeleteDealInput,
  DeleteDealResult,
  ListCompanyDealsInput,
  ListDealsInput,
  RemoveDealContactResult,
  UpdateDealInput,
  UpdateDealResult,
} from '../application/ports/deals-repository.port';
import type { Deal } from '../domain/deal';
import { canWriteDeals } from '../domain/deal-role-policy';
import { canTransitionDealStage } from '../domain/deal-stage-policy';

const first = <T>(values: T[]): T | null => values[0] ?? null;

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === '23505';

const activeWorkspaceFilter = (workspaceId: string) =>
  and(eq(workspaces.id, workspaceId), isNull(workspaces.deletedAt));

const activeDealFilter = (dealId: string) =>
  and(eq(deals.id, dealId), isNull(deals.deletedAt));

const datesEqual = (left: Date | null, right: Date | null): boolean =>
  left?.getTime() === right?.getTime();

@Injectable()
export class DrizzleDealsRepository implements DealsRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(input: ListDealsInput): Promise<DealPage> {
    const cursorFilter =
      input.cursor === null
        ? undefined
        : or(
            lt(deals.createdAt, input.cursor.createdAt),
            and(
              eq(deals.createdAt, input.cursor.createdAt),
              lt(deals.id, input.cursor.id),
            ),
          );
    const baseFilters = and(
      eq(deals.workspaceId, input.workspaceId),
      isNull(deals.deletedAt),
      input.stage === undefined ? undefined : eq(deals.stage, input.stage),
      input.companyId === undefined
        ? undefined
        : eq(deals.companyId, input.companyId),
    );
    const [rows, totals] = await Promise.all([
      this.database.db
        .select()
        .from(deals)
        .where(and(baseFilters, cursorFilter))
        .orderBy(desc(deals.createdAt), desc(deals.id))
        .limit(input.limit + 1),
      this.database.db
        .select({ value: count() })
        .from(deals)
        .where(baseFilters),
    ]);
    return {
      items: rows.slice(0, input.limit),
      hasNext: rows.length > input.limit,
      total: totals[0]?.value ?? 0,
    };
  }

  async listByCompany(input: ListCompanyDealsInput): Promise<DealPage> {
    return this.list({
      workspaceId: input.workspaceId,
      companyId: input.companyId,
      cursor: input.cursor,
      limit: input.limit,
    });
  }

  async findAccess(dealId: string, userId: string): Promise<DealAccess | null> {
    return first(
      await this.database.db
        .select({ deal: deals, role: memberships.role })
        .from(deals)
        .innerJoin(workspaces, eq(workspaces.id, deals.workspaceId))
        .innerJoin(
          memberships,
          and(
            eq(memberships.workspaceId, deals.workspaceId),
            eq(memberships.userId, userId),
          ),
        )
        .where(
          and(
            eq(deals.id, dealId),
            isNull(deals.deletedAt),
            isNull(workspaces.deletedAt),
          ),
        )
        .limit(1),
    );
  }

  async create(input: CreateDealInput): Promise<CreateDealResult> {
    return this.database.db.transaction(async (transaction) => {
      const workspace = first(
        await transaction
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(activeWorkspaceFilter(input.deal.workspaceId))
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
              eq(memberships.workspaceId, input.deal.workspaceId),
              eq(memberships.userId, input.actorUserId),
            ),
          )
          .limit(1),
      );
      if (actor === null || !canWriteDeals(actor.role)) {
        return { type: 'forbidden' } as const;
      }

      if (
        input.deal.companyId !== null &&
        !(await this.companyIsActive(
          transaction,
          input.deal.workspaceId,
          input.deal.companyId,
        ))
      ) {
        return { type: 'invalid_company' } as const;
      }

      const deal = first(
        await transaction.insert(deals).values(input.deal).returning(),
      );
      if (deal === null) {
        throw new Error('The deal insert returned no row.');
      }
      return { type: 'created', deal } as const;
    });
  }

  async update(input: UpdateDealInput): Promise<UpdateDealResult> {
    return this.database.db.transaction(async (transaction) => {
      const current = first(
        await transaction
          .select()
          .from(deals)
          .where(activeDealFilter(input.dealId))
          .for('update')
          .limit(1),
      );
      if (current === null) {
        return { type: 'not_found' } as const;
      }

      const workspace = first(
        await transaction
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(activeWorkspaceFilter(current.workspaceId))
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
              eq(memberships.workspaceId, current.workspaceId),
              eq(memberships.userId, input.actorUserId),
            ),
          )
          .limit(1),
      );
      if (actor === null || !canWriteDeals(actor.role)) {
        return { type: 'forbidden' } as const;
      }

      if (
        input.changes.companyId !== undefined &&
        input.changes.companyId !== current.companyId &&
        input.changes.companyId !== null &&
        !(await this.companyIsActive(
          transaction,
          current.workspaceId,
          input.changes.companyId,
        ))
      ) {
        return { type: 'invalid_company' } as const;
      }
      if (
        input.changes.stage !== undefined &&
        !canTransitionDealStage(current.stage, input.changes.stage)
      ) {
        return { type: 'invalid_stage_transition' } as const;
      }
      if (!this.hasChanges(current, input.changes)) {
        return { type: 'unchanged', deal: current } as const;
      }

      const updated = first(
        await transaction
          .update(deals)
          .set({ ...input.changes, updatedAt: input.updatedAt })
          .where(activeDealFilter(input.dealId))
          .returning(),
      );
      return updated === null
        ? ({ type: 'not_found' } as const)
        : ({ type: 'updated', deal: updated } as const);
    });
  }

  async softDelete(input: DeleteDealInput): Promise<DeleteDealResult> {
    return this.database.db.transaction(async (transaction) => {
      const current = first(
        await transaction
          .select({ workspaceId: deals.workspaceId })
          .from(deals)
          .where(activeDealFilter(input.dealId))
          .for('update')
          .limit(1),
      );
      if (current === null) {
        return { type: 'not_found' } as const;
      }

      const workspace = first(
        await transaction
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(activeWorkspaceFilter(current.workspaceId))
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
              eq(memberships.workspaceId, current.workspaceId),
              eq(memberships.userId, input.actorUserId),
            ),
          )
          .limit(1),
      );
      if (actor === null || !canWriteDeals(actor.role)) {
        return { type: 'forbidden' } as const;
      }

      const deleted = await transaction
        .update(deals)
        .set({ deletedAt: input.deletedAt, updatedAt: input.deletedAt })
        .where(activeDealFilter(input.dealId))
        .returning({ id: deals.id });
      return deleted.length === 0
        ? ({ type: 'not_found' } as const)
        : ({ type: 'deleted' } as const);
    });
  }

  async addContact(input: DealContactInput): Promise<AddDealContactResult> {
    try {
      return await this.database.db.transaction(async (transaction) => {
        const deal = first(
          await transaction
            .select({ workspaceId: deals.workspaceId })
            .from(deals)
            .where(activeDealFilter(input.dealId))
            .for('update')
            .limit(1),
        );
        if (deal === null) {
          return { type: 'not_found' } as const;
        }

        const workspace = first(
          await transaction
            .select({ id: workspaces.id })
            .from(workspaces)
            .where(activeWorkspaceFilter(deal.workspaceId))
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
                eq(memberships.workspaceId, deal.workspaceId),
                eq(memberships.userId, input.actorUserId),
              ),
            )
            .limit(1),
        );
        if (actor === null || !canWriteDeals(actor.role)) {
          return { type: 'forbidden' } as const;
        }

        const contact = first(
          await transaction
            .select({ id: contacts.id })
            .from(contacts)
            .where(
              and(
                eq(contacts.id, input.contactId),
                eq(contacts.workspaceId, deal.workspaceId),
                isNull(contacts.deletedAt),
              ),
            )
            .for('update')
            .limit(1),
        );
        if (contact === null) {
          return { type: 'invalid_contact' } as const;
        }

        const existing = first(
          await transaction
            .select({ dealId: dealContacts.dealId })
            .from(dealContacts)
            .where(
              and(
                eq(dealContacts.dealId, input.dealId),
                eq(dealContacts.contactId, input.contactId),
              ),
            )
            .limit(1),
        );
        if (existing !== null) {
          return { type: 'already_associated' } as const;
        }

        await transaction.insert(dealContacts).values({
          workspaceId: deal.workspaceId,
          dealId: input.dealId,
          contactId: input.contactId,
        });
        return { type: 'associated' } as const;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return { type: 'already_associated' };
      }
      throw error;
    }
  }

  async removeContact(
    input: DealContactInput,
  ): Promise<RemoveDealContactResult> {
    return this.database.db.transaction(async (transaction) => {
      const deal = first(
        await transaction
          .select({ workspaceId: deals.workspaceId })
          .from(deals)
          .where(activeDealFilter(input.dealId))
          .for('update')
          .limit(1),
      );
      if (deal === null) {
        return { type: 'not_found' } as const;
      }

      const workspace = first(
        await transaction
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(activeWorkspaceFilter(deal.workspaceId))
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
              eq(memberships.workspaceId, deal.workspaceId),
              eq(memberships.userId, input.actorUserId),
            ),
          )
          .limit(1),
      );
      if (actor === null || !canWriteDeals(actor.role)) {
        return { type: 'forbidden' } as const;
      }

      const removed = await transaction
        .delete(dealContacts)
        .where(
          and(
            eq(dealContacts.dealId, input.dealId),
            eq(dealContacts.contactId, input.contactId),
            eq(dealContacts.workspaceId, deal.workspaceId),
          ),
        )
        .returning({ dealId: dealContacts.dealId });
      return removed.length === 0
        ? ({ type: 'association_not_found' } as const)
        : ({ type: 'removed' } as const);
    });
  }

  private async companyIsActive(
    transaction: Parameters<
      Parameters<DatabaseService['db']['transaction']>[0]
    >[0],
    workspaceId: string,
    companyId: string,
  ): Promise<boolean> {
    return (
      first(
        await transaction
          .select({ id: companies.id })
          .from(companies)
          .where(
            and(
              eq(companies.id, companyId),
              eq(companies.workspaceId, workspaceId),
              isNull(companies.deletedAt),
            ),
          )
          .for('update')
          .limit(1),
      ) !== null
    );
  }

  private hasChanges(current: Deal, changes: DealChanges): boolean {
    return (
      (changes.companyId !== undefined &&
        changes.companyId !== current.companyId) ||
      (changes.title !== undefined && changes.title !== current.title) ||
      (changes.amount !== undefined && changes.amount !== current.amount) ||
      (changes.currency !== undefined &&
        changes.currency !== current.currency) ||
      (changes.stage !== undefined && changes.stage !== current.stage) ||
      (changes.closeDate !== undefined &&
        !datesEqual(changes.closeDate, current.closeDate))
    );
  }
}
