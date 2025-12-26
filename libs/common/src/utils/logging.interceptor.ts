import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

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
      tap((data) => {
        const { statusCode } = response;
        const contentLength = response.get('Content-Length') || 'unknown';
        const duration = Date.now() - now;
        this.logger.log(`[${method}] ${url} - ${statusCode} - ${contentLength} bytes - ${duration}ms`);
      }),
    );
  }
}