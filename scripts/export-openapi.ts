import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config as loadEnvironment } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { AppConfig } from '../src/shared/config';

async function exportOpenApi(): Promise<void> {
  loadEnvironment({
    path: resolve(process.cwd(), '.env.local'),
    quiet: true,
  });
  process.env.OPENAPI_EXPORT = 'true';
  const { AppModule } = await import('../src/app.module');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: false,
  });

  try {
    const config = app.get(ConfigService).getOrThrow<AppConfig>('app');
    app.setGlobalPrefix(config.apiPrefix);

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
    const destination = resolve(process.cwd(), 'openapi.json');

    await writeFile(destination, `${JSON.stringify(document, null, 2)}\n`, {
      encoding: 'utf8',
    });
    process.stdout.write(`OpenAPI contract written to ${destination}\n`);
  } finally {
    await app.close();
  }
}

void exportOpenApi().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`OpenAPI export failed: ${message}\n`);
  process.exitCode = 1;
});
