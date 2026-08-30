import { HttpStatus } from '@nestjs/common';
import { AppErrorCode } from '../enums/app-error-code.enum';

export const HTTP_STATUS_ERROR_CODE: Readonly<Record<number, AppErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: AppErrorCode.BadRequest,
  [HttpStatus.UNAUTHORIZED]: AppErrorCode.Unauthorized,
  [HttpStatus.FORBIDDEN]: AppErrorCode.Forbidden,
  [HttpStatus.NOT_FOUND]: AppErrorCode.ResourceNotFound,
  [HttpStatus.CONFLICT]: AppErrorCode.ResourceConflict,
  [HttpStatus.TOO_MANY_REQUESTS]: AppErrorCode.RateLimited,
  [HttpStatus.SERVICE_UNAVAILABLE]: AppErrorCode.ServiceUnavailable,
};
