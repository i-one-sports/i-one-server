import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    // Log the exception for debugging
    console.error('Exception caught:', exception);
    if (exception instanceof Error) {
      console.error('Error stack:', exception.stack);
    }

    if (exception instanceof HttpException) {
      const response = exception.getResponse() as any;
      statusCode = exception.getStatus();
      message = response.message || response;
    }

    const responseBody = {
      statusCode,
      timestamp: new Date().toISOString(),
      path: httpAdapter.getRequestUrl(ctx.getRequest()),
      message: Array.isArray(message) ? message[0] : message,
    };

    httpAdapter.reply(ctx.getResponse(), responseBody, statusCode);
  }
}
