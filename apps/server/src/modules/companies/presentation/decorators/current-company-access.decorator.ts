import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { CompanyAccess } from '../../application/ports/companies-repository.port';
import type { CompanyRequest } from '../../infrastructure/company-request';

export const CurrentCompanyAccess = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CompanyAccess => {
    const request = context.switchToHttp().getRequest<CompanyRequest>();
    return request.companyAccess as CompanyAccess;
  },
);
