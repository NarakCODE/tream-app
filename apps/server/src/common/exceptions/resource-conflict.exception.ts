import { HttpStatus } from '@nestjs/common';
import { AppErrorCode } from '../enums/app-error-code.enum';
import { AppException } from './app.exception';

export class ResourceConflictException extends AppException {
  constructor(message: string, details: unknown = null) {
    super(AppErrorCode.ResourceConflict, message, HttpStatus.CONFLICT, details);
  }
}
