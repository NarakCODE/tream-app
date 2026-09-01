import {
  HttpStatus,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppErrorCode } from '../../../common/enums/app-error-code.enum';
import { AppException } from '../../../common/exceptions/app.exception';
import {
  COMPANIES_REPOSITORY,
  type CompaniesRepository,
} from '../application/ports/companies-repository.port';
import {
  canReadCompanies,
  canWriteCompanies,
} from '../domain/company-role-policy';
import {
  COMPANY_ACCESS_MODE_KEY,
  type CompanyAccessMode,
} from '../presentation/decorators/company-access.decorator';
import type { CompanyRequest } from './company-request';

@Injectable()
export class CompanyAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(COMPANIES_REPOSITORY)
    private readonly repository: CompaniesRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CompanyRequest>();
    const companyId = request.params.companyId;
    const user = request.user;
    if (companyId === undefined || user === undefined) {
      throw this.forbidden();
    }

    const access = await this.repository.findAccess(companyId, user.id);
    if (access === null) {
      throw this.forbidden();
    }

    const mode =
      this.reflector.getAllAndOverride<CompanyAccessMode>(
        COMPANY_ACCESS_MODE_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? 'read';
    const allowed =
      mode === 'write'
        ? canWriteCompanies(access.role)
        : canReadCompanies(access.role);
    if (!allowed) {
      throw this.forbidden();
    }

    request.companyAccess = access;
    return true;
  }

  private forbidden(): AppException {
    return new AppException(
      AppErrorCode.Forbidden,
      'You do not have access to this company.',
      HttpStatus.FORBIDDEN,
    );
  }
}
