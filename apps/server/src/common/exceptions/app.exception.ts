import { HttpException, type HttpStatus } from '@nestjs/common';
import type { AppErrorCode } from '../enums/app-error-code.enum';

export class AppException extends HttpException {
  constructor(
    readonly code: AppErrorCode,
    message: string,
    status: HttpStatus,
    readonly details: unknown = null,
  ) {
    super({ code, message, details }, status);
  }
}
