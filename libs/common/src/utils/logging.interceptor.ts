import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger, HttpException } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const { method, url } = request;
    const userAgent = request.get('User-Agent') || '';
    const now = Date.now();

    this.logger.log(`[${method}] ${url} - Start - User-Agent: ${userAgent}`);

    return next.handle().pipe(
      tap(() => {
        const { statusCode } = response;
        const contentLength = response.get('Content-Length') || 'unknown';
        const duration = Date.now() - now;
        this.logger.log(`[${method}] ${url} - ${statusCode} - ${contentLength} bytes - ${duration}ms`);
      }),
      catchError((error) => {
        const statusCode = error instanceof HttpException ? error.getStatus() : 500;
        const duration = Date.now() - now;
        const message = error instanceof HttpException
          ? (error.getResponse() as any)?.message || error.message
          : error.message;
        this.logger.error(`[${method}] ${url} - ${statusCode} - ${duration}ms - ${message}`);
        return throwError(() => error);
      }),
    );
  }
}