import type {
  AddDealContactResult,
  CreateDealInput,
  CreateDealResult,
  DealAccess,
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
} from '../../src/modules/deals/application/ports/deals-repository.port';
import type { Deal } from '../../src/modules/deals/domain/deal';
import { canWriteDeals } from '../../src/modules/deals/domain/deal-role-policy';
import { canTransitionDealStage } from '../../src/modules/deals/domain/deal-stage-policy';
import type { InMemoryWorkspaceRepository } from './in-memory-workspace.repository';

export class InMemoryDealsRepository implements DealsRepository {
  private readonly deals = new Map<string, Deal>();
  private readonly contactIdsByDeal = new Map<string, Set<string>>();
  private companyValidator?: (
    workspaceId: string,
    companyId: string,
  ) => boolean;
  private contactValidator?: (
    workspaceId: string,
    contactId: string,
  ) => boolean;

  constructor(
    private readonly workspaceRepository: InMemoryWorkspaceRepository,
  ) {}

  reset(): void {
    this.deals.clear();
    this.contactIdsByDeal.clear();
  }

  setCompanyValidator(
    validator: (workspaceId: string, companyId: string) => boolean,
  ): void {
    this.companyValidator = validator;
  }

  setContactValidator(
    validator: (workspaceId: string, contactId: string) => boolean,
  ): void {
    this.contactValidator = validator;
  }

  list(input: ListDealsInput): Promise<DealPage> {
    return this.listMatching(
      input,
      (deal) =>
        (input.stage === undefined || deal.stage === input.stage) &&
        (input.companyId === undefined || deal.companyId === input.companyId),
    );
  }

  listByCompany(input: ListCompanyDealsInput): Promise<DealPage> {
    return this.listMatching(
      input,
      (deal) => deal.companyId === input.companyId,
    );
  }

  async findAccess(dealId: string, userId: string): Promise<DealAccess | null> {
    const deal = this.deals.get(dealId);
    if (deal === undefined || deal.deletedAt !== null) {
      return null;
    }
    const access = await this.workspaceRepository.findActiveWorkspaceMembership(
      deal.workspaceId,
      userId,
    );
    return access === null ? null : { deal, role: access.membership.role };
  }

  async create(input: CreateDealInput): Promise<CreateDealResult> {
    const access = await this.workspaceRepository.findActiveWorkspaceMembership(
      input.deal.workspaceId,
      input.actorUserId,
    );
    if (access === null) {
      return { type: 'workspace_not_found' };
    }
    if (!canWriteDeals(access.membership.role)) {
      return { type: 'forbidden' };
    }
    if (!this.validCompany(input.deal.workspaceId, input.deal.companyId)) {
      return { type: 'invalid_company' };
    }
    this.deals.set(input.deal.id, input.deal);
    return { type: 'created', deal: input.deal };
  }

  async update(input: UpdateDealInput): Promise<UpdateDealResult> {
    const access = await this.findAccess(input.dealId, input.actorUserId);
    if (access === null) {
      return { type: 'not_found' };
    }
    if (!canWriteDeals(access.role)) {
      return { type: 'forbidden' };
    }
    if (
      input.changes.companyId !== undefined &&
      !this.validCompany(access.deal.workspaceId, input.changes.companyId)
    ) {
      return { type: 'invalid_company' };
    }
    if (
      input.changes.stage !== undefined &&
      !canTransitionDealStage(access.deal.stage, input.changes.stage)
    ) {
      return { type: 'invalid_stage_transition' };
    }
    const changed = Object.entries(input.changes).some(([key, value]) => {
      const current = access.deal[key as keyof Deal];
      return current instanceof Date && value instanceof Date
        ? current.getTime() !== value.getTime()
        : current !== value;
    });
    if (!changed) {
      return { type: 'unchanged', deal: access.deal };
    }
    const updated: Deal = {
      ...access.deal,
      ...input.changes,
      updatedAt: input.updatedAt,
    };
    this.deals.set(updated.id, updated);
    return { type: 'updated', deal: updated };
  }

  async softDelete(input: DeleteDealInput): Promise<DeleteDealResult> {
    const access = await this.findAccess(input.dealId, input.actorUserId);
    if (access === null) {
      return { type: 'not_found' };
    }
    if (!canWriteDeals(access.role)) {
      return { type: 'forbidden' };
    }
    this.deals.set(input.dealId, {
      ...access.deal,
      deletedAt: input.deletedAt,
      updatedAt: input.deletedAt,
    });
    return { type: 'deleted' };
  }

  async addContact(input: DealContactInput): Promise<AddDealContactResult> {
    const access = await this.findAccess(input.dealId, input.actorUserId);
    if (access === null) {
      return { type: 'not_found' };
    }
    if (!canWriteDeals(access.role)) {
      return { type: 'forbidden' };
    }
    if (
      this.contactValidator === undefined ||
      !this.contactValidator(access.deal.workspaceId, input.contactId)
    ) {
      return { type: 'invalid_contact' };
    }
    const contacts = this.contactIdsByDeal.get(input.dealId) ?? new Set();
    if (contacts.has(input.contactId)) {
      return { type: 'already_associated' };
    }
    contacts.add(input.contactId);
    this.contactIdsByDeal.set(input.dealId, contacts);
    return { type: 'associated' };
  }

  async removeContact(
    input: DealContactInput,
  ): Promise<RemoveDealContactResult> {
    const access = await this.findAccess(input.dealId, input.actorUserId);
    if (access === null) {
      return { type: 'not_found' };
    }
    if (!canWriteDeals(access.role)) {
      return { type: 'forbidden' };
    }
    const contacts = this.contactIdsByDeal.get(input.dealId);
    if (contacts?.delete(input.contactId) !== true) {
      return { type: 'association_not_found' };
    }
    return { type: 'removed' };
  }

  getContactIds(workspaceId: string, dealId: string): ReadonlySet<string> {
    const deal = this.deals.get(dealId);
    return deal?.workspaceId === workspaceId && deal.deletedAt === null
      ? (this.contactIdsByDeal.get(dealId) ?? new Set())
      : new Set();
  }

  isActiveInWorkspace(workspaceId: string, dealId: string): boolean {
    const deal = this.deals.get(dealId);
    return deal?.workspaceId === workspaceId && deal.deletedAt === null;
  }

  private listMatching(
    input: ListDealsInput | ListCompanyDealsInput,
    matches: (deal: Deal) => boolean,
  ): Promise<DealPage> {
    const all = [...this.deals.values()]
      .filter(
        (deal) =>
          deal.workspaceId === input.workspaceId &&
          deal.deletedAt === null &&
          matches(deal),
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
            (deal) =>
              deal.createdAt < input.cursor!.createdAt ||
              (deal.createdAt.getTime() === input.cursor!.createdAt.getTime() &&
                deal.id < input.cursor!.id),
          );
    return Promise.resolve({
      items: afterCursor.slice(0, input.limit),
      hasNext: afterCursor.length > input.limit,
      total: all.length,
    });
  }

  private validCompany(workspaceId: string, companyId: string | null): boolean {
    return (
      companyId === null ||
      (this.companyValidator?.(workspaceId, companyId) ?? false)
    );
  }
}
