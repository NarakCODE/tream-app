import type { CursorTuple } from '../../../../common/pagination/cursor';
import type { WorkspaceRole } from '../../../iam/domain/workspace-membership';
import type { Company } from '../../domain/company';

export const COMPANIES_REPOSITORY = Symbol('COMPANIES_REPOSITORY');

export interface CompanyAccess {
  company: Company;
  role: WorkspaceRole;
}

export interface ListCompaniesInput {
  workspaceId: string;
  cursor: CursorTuple | null;
  limit: number;
}

export interface CompanyPage {
  items: Company[];
  hasNext: boolean;
  total: number;
}

export interface CreateCompanyInput {
  company: Company;
  actorUserId: string;
}

export type CreateCompanyResult =
  | { type: 'created'; company: Company }
  | { type: 'workspace_not_found' }
  | { type: 'forbidden' };

export interface CompanyChanges {
  name?: string;
  domain?: string | null;
  industry?: string | null;
}

export interface UpdateCompanyInput {
  companyId: string;
  actorUserId: string;
  changes: CompanyChanges;
  updatedAt: Date;
}

export type UpdateCompanyResult =
  | { type: 'updated'; company: Company }
  | { type: 'not_found' }
  | { type: 'forbidden' };

export interface DeleteCompanyInput {
  companyId: string;
  actorUserId: string;
  deletedAt: Date;
}

export type DeleteCompanyResult =
  { type: 'deleted' } | { type: 'not_found' } | { type: 'forbidden' };

export interface CompaniesRepository {
  list(input: ListCompaniesInput): Promise<CompanyPage>;
  findByWorkspaceAndDomain(
    workspaceId: string,
    domain: string,
  ): Promise<Company[]>;
  findAccess(companyId: string, userId: string): Promise<CompanyAccess | null>;
  create(input: CreateCompanyInput): Promise<CreateCompanyResult>;
  update(input: UpdateCompanyInput): Promise<UpdateCompanyResult>;
  softDelete(input: DeleteCompanyInput): Promise<DeleteCompanyResult>;
}
