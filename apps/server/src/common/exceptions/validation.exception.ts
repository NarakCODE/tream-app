import { HttpStatus } from '@nestjs/common';
import { AppErrorCode } from '../enums/app-error-code.enum';
import { AppException } from './app.exception';

export interface ValidationErrorDetails {
  field: string;
  constraints: string[];
}

export class ValidationException extends AppException {
  constructor(details: ValidationErrorDetails[]) {
    super(
      AppErrorCode.ValidationError,
      'Input validation failed.',
      HttpStatus.BAD_REQUEST,
      details,
    );
  }
}
