import { CallHandler, ExecutionContext } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { lastValueFrom, of, throwError, toArray } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';

describe('LoggingInterceptor', () => {
  const logger = {
    setContext: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  };
  const request = {
    id: 'request-123',
    method: 'GET',
    originalUrl: '/i-one/users/private-email@example.com?token=secret',
    baseUrl: '/i-one',
    route: { path: '/users/:userId' },
  };
  const response = { statusCode: 200 };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as ExecutionContext;

  let interceptor: LoggingInterceptor;

  beforeEach(() => {
    jest.clearAllMocks();
    response.statusCode = 200;
    interceptor = new LoggingInterceptor(logger as unknown as PinoLogger);
  });

  it('logs a route template and records successful request metrics', async () => {
    await lastValueFrom(
      interceptor
        .intercept(context, { handle: () => of('one', 'two') } as CallHandler)
        .pipe(toArray()),
    );

    expect(logger.info).toHaveBeenCalledTimes(1);
    const [fields] = logger.info.mock.calls[0];
    expect(fields).toMatchObject({
      request_id: 'request-123',
      method: 'GET',
      route: '/i-one/users/:userId',
      status_code: 200,
    });
    expect(JSON.stringify(fields)).not.toContain('private-email@example.com');
    expect(JSON.stringify(fields)).not.toContain('token=secret');
  });

  it('logs an exception type without logging its potentially sensitive message', async () => {
    await expect(
      lastValueFrom(
        interceptor.intercept(context, {
          handle: () =>
            throwError(() => new Error('sensitive provider payload')),
        } as CallHandler),
      ),
    ).rejects.toThrow('sensitive provider payload');

    const [fields] = logger.error.mock.calls[0];
    expect(fields).toMatchObject({
      status_code: 500,
      error_type: 'Error',
    });
    expect(JSON.stringify(fields)).not.toContain('sensitive provider payload');
  });
});
