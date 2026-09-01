import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, isNull, lt, or } from 'drizzle-orm';
import { DatabaseService } from '../../../database/database.service';
import { companies, memberships, workspaces } from '../../../database/schema';
import type {
  CompaniesRepository,
  CompanyAccess,
  CompanyChanges,
  CompanyPage,
  CreateCompanyInput,
  CreateCompanyResult,
  DeleteCompanyInput,
  DeleteCompanyResult,
  ListCompaniesInput,
  UpdateCompanyInput,
  UpdateCompanyResult,
} from '../application/ports/companies-repository.port';
import { canWriteCompanies } from '../domain/company-role-policy';

const first = <T>(values: T[]): T | null => values[0] ?? null;

const activeWorkspaceFilter = (workspaceId: string) =>
  and(eq(workspaces.id, workspaceId), isNull(workspaces.deletedAt));

const activeCompanyFilter = (companyId: string) =>
  and(eq(companies.id, companyId), isNull(companies.deletedAt));

@Injectable()
export class DrizzleCompaniesRepository implements CompaniesRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(input: ListCompaniesInput): Promise<CompanyPage> {
    const cursorFilter =
      input.cursor === null
        ? undefined
        : or(
            lt(companies.createdAt, input.cursor.createdAt),
            and(
              eq(companies.createdAt, input.cursor.createdAt),
              lt(companies.id, input.cursor.id),
            ),
          );
    const [rows, totals] = await Promise.all([
      this.database.db
        .select()
        .from(companies)
        .where(
          and(
            eq(companies.workspaceId, input.workspaceId),
            isNull(companies.deletedAt),
            cursorFilter,
          ),
        )
        .orderBy(desc(companies.createdAt), desc(companies.id))
        .limit(input.limit + 1),
      this.database.db
        .select({ value: count() })
        .from(companies)
        .where(
          and(
            eq(companies.workspaceId, input.workspaceId),
            isNull(companies.deletedAt),
          ),
        ),
    ]);
    return {
      items: rows.slice(0, input.limit),
      hasNext: rows.length > input.limit,
      total: totals[0]?.value ?? 0,
    };
  }

  async findByWorkspaceAndDomain(
    workspaceId: string,
    domain: string,
  ): ReturnType<CompaniesRepository['findByWorkspaceAndDomain']> {
    return this.database.db
      .select()
      .from(companies)
      .where(
        and(
          eq(companies.workspaceId, workspaceId),
          eq(companies.domain, domain),
          isNull(companies.deletedAt),
        ),
      )
      .orderBy(companies.id);
  }

  async findAccess(
    companyId: string,
    userId: string,
  ): Promise<CompanyAccess | null> {
    return first(
      await this.database.db
        .select({ company: companies, role: memberships.role })
        .from(companies)
        .innerJoin(workspaces, eq(workspaces.id, companies.workspaceId))
        .innerJoin(
          memberships,
          and(
            eq(memberships.workspaceId, companies.workspaceId),
            eq(memberships.userId, userId),
          ),
        )
        .where(
          and(
            eq(companies.id, companyId),
            isNull(companies.deletedAt),
            isNull(workspaces.deletedAt),
          ),
        )
        .limit(1),
    );
  }

  async create(input: CreateCompanyInput): Promise<CreateCompanyResult> {
    return this.database.db.transaction(async (transaction) => {
      const workspace = first(
        await transaction
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(activeWorkspaceFilter(input.company.workspaceId))
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
              eq(memberships.workspaceId, input.company.workspaceId),
              eq(memberships.userId, input.actorUserId),
            ),
          )
          .limit(1),
      );
      if (actor === null || !canWriteCompanies(actor.role)) {
        return { type: 'forbidden' } as const;
      }

      const company = first(
        await transaction.insert(companies).values(input.company).returning(),
      );
      if (company === null) {
        throw new Error('The company insert returned no row.');
      }
      return { type: 'created', company } as const;
    });
  }

  async update(input: UpdateCompanyInput): Promise<UpdateCompanyResult> {
    return this.database.db.transaction(async (transaction) => {
      const companyWorkspace = first(
        await transaction
          .select({ workspaceId: companies.workspaceId })
          .from(companies)
          .where(activeCompanyFilter(input.companyId))
          .limit(1),
      );
      if (companyWorkspace === null) {
        return { type: 'not_found' } as const;
      }

      const workspace = first(
        await transaction
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(activeWorkspaceFilter(companyWorkspace.workspaceId))
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
              eq(memberships.workspaceId, companyWorkspace.workspaceId),
              eq(memberships.userId, input.actorUserId),
            ),
          )
          .limit(1),
      );
      if (actor === null || !canWriteCompanies(actor.role)) {
        return { type: 'forbidden' } as const;
      }

      const updated = first(
        await transaction
          .update(companies)
          .set({ ...this.toChanges(input.changes), updatedAt: input.updatedAt })
          .where(activeCompanyFilter(input.companyId))
          .returning(),
      );
      return updated === null
        ? ({ type: 'not_found' } as const)
        : ({ type: 'updated', company: updated } as const);
    });
  }

  async softDelete(input: DeleteCompanyInput): Promise<DeleteCompanyResult> {
    return this.database.db.transaction(async (transaction) => {
      const companyWorkspace = first(
        await transaction
          .select({ workspaceId: companies.workspaceId })
          .from(companies)
          .where(activeCompanyFilter(input.companyId))
          .limit(1),
      );
      if (companyWorkspace === null) {
        return { type: 'not_found' } as const;
      }

      const workspace = first(
        await transaction
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(activeWorkspaceFilter(companyWorkspace.workspaceId))
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
              eq(memberships.workspaceId, companyWorkspace.workspaceId),
              eq(memberships.userId, input.actorUserId),
            ),
          )
          .limit(1),
      );
      if (actor === null || !canWriteCompanies(actor.role)) {
        return { type: 'forbidden' } as const;
      }

      const deleted = await transaction
        .update(companies)
        .set({ deletedAt: input.deletedAt, updatedAt: input.deletedAt })
        .where(activeCompanyFilter(input.companyId))
        .returning({ id: companies.id });
      return deleted.length === 0
        ? ({ type: 'not_found' } as const)
        : ({ type: 'deleted' } as const);
    });
  }

  private toChanges(changes: CompanyChanges): CompanyChanges {
    return {
      ...(changes.name === undefined ? {} : { name: changes.name }),
      ...(changes.domain === undefined ? {} : { domain: changes.domain }),
      ...(changes.industry === undefined ? {} : { industry: changes.industry }),
    };
  }
}
