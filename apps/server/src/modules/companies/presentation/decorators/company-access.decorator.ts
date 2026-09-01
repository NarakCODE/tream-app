import { SetMetadata } from '@nestjs/common';

export const COMPANY_ACCESS_MODE_KEY = 'company_access_mode';
export type CompanyAccessMode = 'read' | 'write';

export const CompanyAccessMode = (mode: CompanyAccessMode): MethodDecorator =>
  SetMetadata(COMPANY_ACCESS_MODE_KEY, mode);
