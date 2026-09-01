import type {
  CompaniesRepository,
  CompanyAccess,
  CompanyPage,
  CreateCompanyInput,
  CreateCompanyResult,
  DeleteCompanyInput,
  DeleteCompanyResult,
  ListCompaniesInput,
  UpdateCompanyInput,
  UpdateCompanyResult,
} from '../../src/modules/companies/application/ports/companies-repository.port';
import type { Company } from '../../src/modules/companies/domain/company';
import { canWriteCompanies } from '../../src/modules/companies/domain/company-role-policy';
import type { InMemoryWorkspaceRepository } from './in-memory-workspace.repository';

export class InMemoryCompaniesRepository implements CompaniesRepository {
  private readonly companies = new Map<string, Company>();

  constructor(
    private readonly workspaceRepository: InMemoryWorkspaceRepository,
  ) {}

  reset(): void {
    this.companies.clear();
  }

  list(input: ListCompaniesInput): Promise<CompanyPage> {
    const all = [...this.companies.values()]
      .filter(
        (company) =>
          company.workspaceId === input.workspaceId &&
          company.deletedAt === null,
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
            (company) =>
              company.createdAt < input.cursor!.createdAt ||
              (company.createdAt.getTime() ===
                input.cursor!.createdAt.getTime() &&
                company.id < input.cursor!.id),
          );
    return Promise.resolve({
      items: afterCursor.slice(0, input.limit),
      hasNext: afterCursor.length > input.limit,
      total: all.length,
    });
  }

  findByWorkspaceAndDomain(
    workspaceId: string,
    domain: string,
  ): Promise<Company[]> {
    return Promise.resolve(
      [...this.companies.values()]
        .filter(
          (company) =>
            company.workspaceId === workspaceId &&
            company.deletedAt === null &&
            company.domain === domain,
        )
        .sort((left, right) => left.id.localeCompare(right.id)),
    );
  }

  async findAccess(
    companyId: string,
    userId: string,
  ): Promise<CompanyAccess | null> {
    const company = this.companies.get(companyId);
    if (company === undefined || company.deletedAt !== null) {
      return null;
    }
    const access = await this.workspaceRepository.findActiveWorkspaceMembership(
      company.workspaceId,
      userId,
    );
    return access === null ? null : { company, role: access.membership.role };
  }

  async create(input: CreateCompanyInput): Promise<CreateCompanyResult> {
    const access = await this.workspaceRepository.findActiveWorkspaceMembership(
      input.company.workspaceId,
      input.actorUserId,
    );
    if (access === null) {
      return { type: 'workspace_not_found' };
    }
    if (!canWriteCompanies(access.membership.role)) {
      return { type: 'forbidden' };
    }
    this.companies.set(input.company.id, input.company);
    return { type: 'created', company: input.company };
  }

  async update(input: UpdateCompanyInput): Promise<UpdateCompanyResult> {
    const access = await this.findAccess(input.companyId, input.actorUserId);
    if (access === null) {
      return { type: 'not_found' };
    }
    if (!canWriteCompanies(access.role)) {
      return { type: 'forbidden' };
    }
    const updated: Company = {
      ...access.company,
      ...input.changes,
      updatedAt: input.updatedAt,
    };
    this.companies.set(updated.id, updated);
    return { type: 'updated', company: updated };
  }

  async softDelete(input: DeleteCompanyInput): Promise<DeleteCompanyResult> {
    const access = await this.findAccess(input.companyId, input.actorUserId);
    if (access === null) {
      return { type: 'not_found' };
    }
    if (!canWriteCompanies(access.role)) {
      return { type: 'forbidden' };
    }
    this.companies.set(input.companyId, {
      ...access.company,
      deletedAt: input.deletedAt,
      updatedAt: input.deletedAt,
    });
    return { type: 'deleted' };
  }

  isActiveInWorkspace(workspaceId: string, companyId: string): boolean {
    const company = this.companies.get(companyId);
    return company?.workspaceId === workspaceId && company.deletedAt === null;
  }
}
