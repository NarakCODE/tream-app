import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { HTTP_STATUS_ERROR_CODE } from '../constants/error-codes.constant';
import { RequestContextService } from '../context/request-context.service';
import { AppErrorCode } from '../enums/app-error-code.enum';
import { AppException } from '../exceptions/app.exception';
import type { ApiErrorResponse } from '../interfaces/api-response.interface';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const getHttpExceptionMessage = (exception: HttpException): string => {
  const response = exception.getResponse();
  if (typeof response === 'string') {
    return response;
  }
  if (isRecord(response)) {
    const message = response.message;
    if (typeof message === 'string') {
      return message;
    }
    if (
      Array.isArray(message) &&
      message.every((item) => typeof item === 'string')
    ) {
      return message.join(', ');
    }
  }
  return exception.message;
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly requestContext: RequestContextService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const requestId = this.requestContext.getRequestId();
    const timestamp = new Date().toISOString();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = AppErrorCode.InternalServerError;
    let message = 'An unexpected error occurred.';
    let details: unknown = null;

    if (exception instanceof AppException) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = HTTP_STATUS_ERROR_CODE[status] ?? AppErrorCode.InternalServerError;
      message = getHttpExceptionMessage(exception);
    } else {
      this.logger.error(exception, 'Unhandled exception');
    }

    const body: ApiErrorResponse = {
      error: { code, message, details },
      meta: { requestId, timestamp },
    };
    reply.header('x-request-id', requestId).status(status).send(body);
  }
}
