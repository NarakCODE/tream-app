import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { RequestContextService } from '../../common/context/request-context.service';

@Injectable()
export class AppLoggerService {
  constructor(
    private readonly logger: PinoLogger,
    private readonly requestContext: RequestContextService,
  ) {}

  log(message: string, context: Record<string, unknown> = {}): void {
    this.logger.info(
      { ...context, requestId: this.requestContext.getRequestId() },
      message,
    );
  }

  error(message: string, context: Record<string, unknown> = {}): void {
    this.logger.error(
      { ...context, requestId: this.requestContext.getRequestId() },
      message,
    );
  }
}
