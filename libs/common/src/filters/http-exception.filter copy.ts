import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest();

    const method = request?.method || 'UNKNOWN';
    const url = httpAdapter.getRequestUrl(request) || 'UNKNOWN';

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      const response = exception.getResponse() as any;
      statusCode = exception.getStatus();
      message = response.message || response;
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const displayMessage = Array.isArray(message) ? message[0] : message;

    if (statusCode >= 500) {
      this.logger.error(`[${method}] ${url} - ${statusCode} - ${displayMessage}`);
    } else {
      this.logger.warn(`[${method}] ${url} - ${statusCode} - ${displayMessage}`);
    }

    const responseBody = {
      statusCode,
      timestamp: new Date().toISOString(),
      path: url,
      message: displayMessage,
    };

    httpAdapter.reply(ctx.getResponse(), responseBody, statusCode);
  }
}
