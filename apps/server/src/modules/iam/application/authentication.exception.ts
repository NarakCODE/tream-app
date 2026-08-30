import { HttpStatus } from '@nestjs/common';
import { AppErrorCode } from '../../../common/enums/app-error-code.enum';
import { AppException } from '../../../common/exceptions/app.exception';

export class AuthenticationException extends AppException {
  constructor(message = 'Authentication credentials are invalid.') {
    super(AppErrorCode.Unauthorized, message, HttpStatus.UNAUTHORIZED);
  }
}
