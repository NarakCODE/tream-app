import { HttpStatus } from '@nestjs/common';
import { AppErrorCode } from '../enums/app-error-code.enum';
import { AppException } from './app.exception';

export class ResourceNotFoundException extends AppException {
  constructor(resource: string, identifier: string | number) {
    super(
      AppErrorCode.ResourceNotFound,
      `${resource} with id '${identifier}' was not found.`,
      HttpStatus.NOT_FOUND,
    );
  }
}
