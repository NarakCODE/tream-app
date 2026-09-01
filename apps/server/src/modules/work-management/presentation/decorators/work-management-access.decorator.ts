import { SetMetadata } from '@nestjs/common';

export const WORK_MANAGEMENT_ACCESS_MODE_KEY = 'work_management_access_mode';
export type WorkManagementAccessMode = 'read' | 'write' | 'admin';

export const WorkManagementAccessMode = (
  mode: WorkManagementAccessMode,
): MethodDecorator => SetMetadata(WORK_MANAGEMENT_ACCESS_MODE_KEY, mode);
