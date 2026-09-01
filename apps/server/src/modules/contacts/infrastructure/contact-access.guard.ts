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
  CONTACTS_REPOSITORY,
  type ContactsRepository,
} from '../application/ports/contacts-repository.port';
import {
  canReadContacts,
  canWriteContacts,
} from '../domain/contact-role-policy';
import {
  CONTACT_ACCESS_MODE_KEY,
  type ContactAccessMode,
} from '../presentation/decorators/contact-access.decorator';
import type { ContactRequest } from './contact-request';

@Injectable()
export class ContactAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(CONTACTS_REPOSITORY)
    private readonly repository: ContactsRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ContactRequest>();
    const contactId = request.params.contactId;
    const user = request.user;
    if (contactId === undefined || user === undefined) {
      throw this.forbidden();
    }

    const access = await this.repository.findAccess(contactId, user.id);
    if (access === null) {
      throw this.forbidden();
    }

    const mode =
      this.reflector.getAllAndOverride<ContactAccessMode>(
        CONTACT_ACCESS_MODE_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? 'read';
    const allowed =
      mode === 'write'
        ? canWriteContacts(access.role)
        : canReadContacts(access.role);
    if (!allowed) {
      throw this.forbidden();
    }

    request.contactAccess = access;
    return true;
  }

  private forbidden(): AppException {
    return new AppException(
      AppErrorCode.Forbidden,
      'You do not have access to this contact.',
      HttpStatus.FORBIDDEN,
    );
  }
}
