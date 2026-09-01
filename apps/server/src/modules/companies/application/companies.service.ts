import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import { AppErrorCode } from '../../../common/enums/app-error-code.enum';
import { AppException } from '../../../common/exceptions/app.exception';
import { ResourceConflictException } from '../../../common/exceptions/resource-conflict.exception';
import { ResourceNotFoundException } from '../../../common/exceptions/resource-not-found.exception';
import { ValidationException } from '../../../common/exceptions/validation.exception';
import type { CursorPaginatedResult } from '../../../common/interfaces/api-response.interface';
import { canonicalizeDomain } from '../../../common/normalization/domain';
import { decodeCursor, encodeCursor } from '../../../common/pagination/cursor';
import type { Company } from '../domain/company';
import {
  COMPANIES_REPOSITORY,
  type CompaniesRepository,
  type CompanyChanges,
} from './ports/companies-repository.port';

export interface CreateCompanyCommand {
  name: string;
  domain?: string | null;
  industry?: string | null;
}

export type UpdateCompanyCommand = CompanyChanges;

@Injectable()
export class CompaniesService {
  constructor(
    @Inject(COMPANIES_REPOSITORY)
    private readonly repository: CompaniesRepository,
  ) {}

  async list(
    workspaceId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<CursorPaginatedResult<Company>> {
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

  async findByDomain(workspaceId: string, domain: string): Promise<Company> {
    const canonicalDomain = this.requireCanonicalDomain(domain);
    const matches = await this.repository.findByWorkspaceAndDomain(
      workspaceId,
      canonicalDomain,
    );
    if (matches.length === 0) {
      throw new ResourceNotFoundException('Company domain', canonicalDomain);
    }
    if (matches.length > 1) {
      throw new ResourceConflictException(
        'Multiple active companies match this domain.',
        {
          field: 'domain',
          domain: canonicalDomain,
          matchingCompanyIds: matches.map(({ id }) => id),
        },
      );
    }
    return matches[0] as Company;
  }

  async create(
    workspaceId: string,
    actorUserId: string,
    input: CreateCompanyCommand,
  ): Promise<Company> {
    const now = new Date();
    const company: Company = {
      id: `cmp_${ulid()}`,
      workspaceId,
      name: input.name,
      domain:
        input.domain === undefined || input.domain === null
          ? null
          : this.requireCanonicalDomain(input.domain),
      industry: input.industry ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    const result = await this.repository.create({ company, actorUserId });
    if (result.type === 'created') {
      return result.company;
    }
    throw this.forbidden();
  }

  async update(
    companyId: string,
    actorUserId: string,
    input: UpdateCompanyCommand,
  ): Promise<Company> {
    const changes: CompanyChanges = {
      ...input,
      ...(input.domain === undefined
        ? {}
        : {
            domain:
              input.domain === null
                ? null
                : this.requireCanonicalDomain(input.domain),
          }),
    };
    const result = await this.repository.update({
      companyId,
      actorUserId,
      changes,
      updatedAt: new Date(),
    });
    if (result.type === 'updated') {
      return result.company;
    }
    throw this.forbidden();
  }

  async delete(companyId: string, actorUserId: string): Promise<void> {
    const result = await this.repository.softDelete({
      companyId,
      actorUserId,
      deletedAt: new Date(),
    });
    if (result.type !== 'deleted') {
      throw this.forbidden();
    }
  }

  private requireCanonicalDomain(domain: string): string {
    const canonical = canonicalizeDomain(domain);
    if (canonical === null) {
      throw new ValidationException([
        {
          field: 'domain',
          constraints: ['domain must be a valid DNS domain'],
        },
      ]);
    }
    return canonical;
  }

  private forbidden(): AppException {
    return new AppException(
      AppErrorCode.Forbidden,
      'You do not have access to this company.',
      HttpStatus.FORBIDDEN,
    );
  }
}
