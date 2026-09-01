import { SetMetadata } from '@nestjs/common';

export const DEAL_ACCESS_MODE_KEY = 'deal_access_mode';
export type DealAccessMode = 'read' | 'write';

export const DealAccessMode = (mode: DealAccessMode): MethodDecorator =>
  SetMetadata(DEAL_ACCESS_MODE_KEY, mode);
