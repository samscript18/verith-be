import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { RequestValidationException } from './core/exceptions';
import { GlobalExceptionFilter } from './core/filters/global-exception.filter';
import { ResponseInterceptor } from './core/interceptors/response.interceptor';
import type { AppConfig } from './shared/config';
import { nestLogLevels } from './shared/utils/nest-log-levels';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: nestLogLevels(),
    rawBody: true,
  });
  const configService = app.get(ConfigService);
  const config = configService.getOrThrow<AppConfig>('app');

  app.enableShutdownHooks();
  app.disable('x-powered-by');

  if (config.trustProxy) {
    app.set('trust proxy', 1);
  }

  app.use(
    process.env.NODE_ENV === 'production'
      ? helmet()
      : helmet({
          contentSecurityPolicy: false,
          strictTransportSecurity: false,
        }),
  );
  app.use(cookieParser());
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader(
      'Permissions-Policy',
      'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
    );
    next();
  });
  app.useBodyParser('json', { limit: '2mb' });
  app.useBodyParser('urlencoded', { limit: '2mb', extended: true });
  app.enableCors({
    origin: config.allowedOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.setGlobalPrefix(config.apiPrefix);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      exceptionFactory: (errors) => new RequestValidationException(errors),
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  if (config.swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Verith API')
      .setDescription(
        'Explainable misinformation verification and media literacy API',
      )
      .setVersion('1.0.0')
      .addBearerAuth()
      .addCookieAuth(
        'verith_refresh',
        { type: 'apiKey', in: 'cookie' },
        'verith_refresh',
      )
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      jsonDocumentUrl: 'api/docs-json',
    });
  }

  await app.listen(config.port, config.host);
  Logger.log(
    `Verith API listening at ${await app.getUrl()}/${config.apiPrefix}`,
    'Bootstrap',
  );
}

void bootstrap();
