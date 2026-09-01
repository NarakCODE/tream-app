import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { ContactAccess } from '../../application/ports/contacts-repository.port';
import type { ContactRequest } from '../../infrastructure/contact-request';

export const CurrentContactAccess = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ContactAccess => {
    const request = context.switchToHttp().getRequest<ContactRequest>();
    return request.contactAccess as ContactAccess;
  },
);
