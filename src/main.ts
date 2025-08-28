import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from '@app/common';
import * as cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';
import { populateDb } from './helpers/seed-users';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

    app.enableCors({
    origin: [
      'http://localhost:4500',
      'https://i-one-sports.com',
      'http://172.20.10.5:4500',
      'http://172.20.10.6:4500'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type', 
      'Authorization', 
      'Accept',
      'Origin',
      'X-Requested-With',
      'Access-Control-Request-Method',
      'Access-Control-Request-Headers'
    ],
    exposedHeaders: ['Set-Cookie'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
    credentials: true,
  });
  
  const httpAdapter = app.get(HttpAdapterHost);
  
  app.use(cookieParser());

    
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  


  app.useGlobalFilters(new GlobalExceptionFilter(httpAdapter));
  app.setGlobalPrefix('i-one');
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
