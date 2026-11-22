import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { metrics, trace } from '@opentelemetry/api';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly requestCount = metrics
    .getMeter('i-one-backend')
    .createCounter('http.server.request.count', { unit: '{request}' });
  private readonly requestDuration = metrics
    .getMeter('i-one-backend')
    .createHistogram('http.server.request.duration', { unit: 's' });

  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext('HTTP');
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const { method } = request;
    const route = request.route?.path
      ? `${request.baseUrl ?? ''}${request.route.path}`
      : 'unmatched';
    const now = Date.now();

    return next.handle().pipe(
      tap({
        complete: () => {
          const statusCode = response.statusCode;
          const duration = Date.now() - now;
          this.recordMetrics(method, route, statusCode, duration);
          this.logger.info(
            {
              event: 'http_request',
              request_id: request.id,
              method,
              route,
              status_code: statusCode,
              duration_ms: duration,
              ...this.traceFields(),
            },
            'HTTP request completed',
          );
        },
        error: (error) => {
          const statusCode =
            error instanceof HttpException ? error.getStatus() : 500;
          const duration = Date.now() - now;
          this.recordMetrics(method, route, statusCode, duration);
          this.logger.error(
            {
              event: 'http_request',
              request_id: request.id,
              method,
              route,
              status_code: statusCode,
              duration_ms: duration,
              error_type: error instanceof Error ? error.name : 'UnknownError',
              ...this.traceFields(),
            },
            'HTTP request failed',
          );
        },
      }),
    );
  }

  private traceFields(): { trace_id?: string; span_id?: string } {
    const spanContext = trace.getActiveSpan()?.spanContext();
    if (!spanContext) return {};

    return {
      trace_id: spanContext.traceId,
      span_id: spanContext.spanId,
    };
  }

  private recordMetrics(
    method: string,
    route: string,
    statusCode: number,
    durationMs: number,
  ): void {
    const attributes = {
      'http.request.method': method,
      'http.route': route,
      'http.response.status_code': statusCode,
    };
    this.requestCount.add(1, attributes);
    this.requestDuration.record(durationMs / 1000, attributes);
  }
}
