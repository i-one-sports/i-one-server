import { HttpException, HttpStatus } from '@nestjs/common';

export class CustomHttpException extends HttpException {
  // `details` is passed through to the response body by GlobalExceptionFilter.
  constructor(message: string, statusCode: HttpStatus, details?: Record<string, unknown>) {
    super(
      {
        statusCode,
        message,
        timestamp: new Date().toISOString(),
        ...(details && { details }),
      },
      statusCode,
    );
  }
}
