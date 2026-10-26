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
    let details: unknown;
    // Actionable guard errors (e.g. EMAIL_VERIFICATION_REQUIRED → VERIFY_EMAIL)
    // the app branches on.
    let code: unknown;
    let nextStep: unknown;

    if (exception instanceof HttpException) {
      const response = exception.getResponse() as any;
      statusCode = exception.getStatus();
      message = response.message || response;
      // Optional machine-readable context, e.g. the current score on a 409.
      details = response.details;
      code = response.code;
      nextStep = response.nextStep;
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
      ...(code !== undefined && { code }),
      ...(nextStep !== undefined && { nextStep }),
      ...(details !== undefined && { details }),
    };

    httpAdapter.reply(ctx.getResponse(), responseBody, statusCode);
  }
}
