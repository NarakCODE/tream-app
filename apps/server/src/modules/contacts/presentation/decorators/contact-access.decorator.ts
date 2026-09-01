import { SetMetadata } from '@nestjs/common';

export const CONTACT_ACCESS_MODE_KEY = 'contact_access_mode';
export type ContactAccessMode = 'read' | 'write';

export const ContactAccessMode = (mode: ContactAccessMode): MethodDecorator =>
  SetMetadata(CONTACT_ACCESS_MODE_KEY, mode);
