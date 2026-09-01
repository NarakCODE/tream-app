import type { CursorTuple } from '../../../../common/pagination/cursor';
import type { WorkspaceRole } from '../../../iam/domain/workspace-membership';
import type { Deal, DealStage } from '../../domain/deal';

export const DEALS_REPOSITORY = Symbol('DEALS_REPOSITORY');

export interface DealAccess {
  deal: Deal;
  role: WorkspaceRole;
}

export interface ListDealsInput {
  workspaceId: string;
  stage?: DealStage;
  companyId?: string;
  cursor: CursorTuple | null;
  limit: number;
}

export interface ListCompanyDealsInput {
  workspaceId: string;
  companyId: string;
  cursor: CursorTuple | null;
  limit: number;
}

export interface DealPage {
  items: Deal[];
  hasNext: boolean;
  total: number;
}

export interface CreateDealInput {
  deal: Deal;
  actorUserId: string;
}

export type CreateDealResult =
  | { type: 'created'; deal: Deal }
  | { type: 'workspace_not_found' }
  | { type: 'forbidden' }
  | { type: 'invalid_company' };

export interface DealChanges {
  companyId?: string | null;
  title?: string;
  amount?: string;
  currency?: string;
  stage?: DealStage;
  closeDate?: Date | null;
}

export interface UpdateDealInput {
  dealId: string;
  actorUserId: string;
  changes: DealChanges;
  updatedAt: Date;
}

export type UpdateDealResult =
  | { type: 'updated'; deal: Deal }
  | { type: 'unchanged'; deal: Deal }
  | { type: 'not_found' }
  | { type: 'forbidden' }
  | { type: 'invalid_company' }
  | { type: 'invalid_stage_transition' };

export interface DeleteDealInput {
  dealId: string;
  actorUserId: string;
  deletedAt: Date;
}

export type DeleteDealResult =
  { type: 'deleted' } | { type: 'not_found' } | { type: 'forbidden' };

export interface DealContactInput {
  dealId: string;
  contactId: string;
  actorUserId: string;
}

export type AddDealContactResult =
  | { type: 'associated' }
  | { type: 'not_found' }
  | { type: 'forbidden' }
  | { type: 'invalid_contact' }
  | { type: 'already_associated' };

export type RemoveDealContactResult =
  | { type: 'removed' }
  | { type: 'not_found' }
  | { type: 'forbidden' }
  | { type: 'association_not_found' };

export interface DealsRepository {
  list(input: ListDealsInput): Promise<DealPage>;
  listByCompany(input: ListCompanyDealsInput): Promise<DealPage>;
  findAccess(dealId: string, userId: string): Promise<DealAccess | null>;
  create(input: CreateDealInput): Promise<CreateDealResult>;
  update(input: UpdateDealInput): Promise<UpdateDealResult>;
  softDelete(input: DeleteDealInput): Promise<DeleteDealResult>;
  addContact(input: DealContactInput): Promise<AddDealContactResult>;
  removeContact(input: DealContactInput): Promise<RemoveDealContactResult>;
}
