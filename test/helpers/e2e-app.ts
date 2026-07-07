import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import Redis from 'ioredis';
import { AppModule } from '../../src/app.module';
import { GlobalExceptionFilter, MailerService, UploadType } from '@app/common';
import { AwsService } from '@app/common/providers/aws.service';
import { PaystackService } from '@app/common/providers/paystack.service';

export interface E2eTestApp {
  app: INestApplication;
  connection: Connection;
  httpServer: any;
  agent: any;
  cleanDatabase: () => Promise<void>;
  flushRedis: () => Promise<void>;
  close: () => Promise<void>;
}

export const mockMailerService = {
  sendMail: jest.fn().mockResolvedValue(undefined),
  sendEmailVerificationOtp: jest.fn().mockResolvedValue(undefined),
  sendTemplateMail: jest.fn().mockResolvedValue(undefined),
};

export const mockAwsService = {
  upload: jest
    .fn()
    .mockImplementation(
      (_file: Express.Multer.File, type: UploadType, key?: string) =>
        Promise.resolve(`https://example.test/${type}/${key ?? 'file'}`),
    ),
};

export const mockPaystackService = {
  initializeTransaction: jest
    .fn()
    .mockImplementation(
      async (
        _email: string,
        amount: number,
        reference: string,
        metadata?: Record<string, any>,
      ) => ({
        authorization_url: `https://paystack.test/checkout/${reference}`,
        reference,
        amount,
        metadata,
      }),
    ),
  verifyTransaction: jest.fn(),
  fetchAllBanks: jest.fn().mockResolvedValue([]),
  resolveAccount: jest.fn(),
  initiateTransfer: jest.fn(),
};

export async function createE2eTestApp(): Promise<E2eTestApp> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(MailerService)
    .useValue(mockMailerService)
    .overrideProvider(AwsService)
    .useValue(mockAwsService)
    .overrideProvider(PaystackService)
    .useValue(mockPaystackService)
    .compile();

  const app = moduleFixture.createNestApplication({ rawBody: true });
  app.use(
    json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.setGlobalPrefix('i-one');

  const httpAdapter = app.get(HttpAdapterHost);
  app.useGlobalFilters(new GlobalExceptionFilter(httpAdapter));

  await app.init();

  const connection = app.get<Connection>(getConnectionToken());
  await connection.dropDatabase();
  await connection
    .collection('locations')
    .createIndex({ 'location.coordinates': '2dsphere' });

  const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
    enableReadyCheck: false,
  });

  const cleanDatabase = async () => {
    await Promise.all(
      Object.values(connection.collections).map((collection) =>
        collection.deleteMany({}),
      ),
    );
  };

  const flushRedis = async () => {
    await redis.flushdb();
  };

  return {
    app,
    connection,
    httpServer: app.getHttpServer(),
    agent: request(app.getHttpServer()),
    cleanDatabase,
    flushRedis,
    close: async () => {
      await redis.quit();
      await app.close();
    },
  };
}

export function authCookie(response: request.Response): string[] {
  const cookie = response.headers['set-cookie'];
  return Array.isArray(cookie) ? cookie : [cookie].filter(Boolean);
}
