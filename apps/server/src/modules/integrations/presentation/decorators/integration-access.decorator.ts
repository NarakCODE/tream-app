import { SetMetadata } from '@nestjs/common';

export const INTEGRATION_ACCESS_MODE_KEY = 'integrationAccessMode';
export type IntegrationAccessMode = 'read' | 'write';

export const IntegrationAccessMode = (
  mode: IntegrationAccessMode,
): MethodDecorator & ClassDecorator =>
  SetMetadata(INTEGRATION_ACCESS_MODE_KEY, mode);
