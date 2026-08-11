import { rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config as loadEnvironment } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { AppConfig } from '../src/shared/config';
import {
  buildOpenApiConfig,
  enhanceOpenApiDocument,
} from '../src/shared/openapi/openapi-document';

async function exportOpenApi(): Promise<void> {
  loadEnvironment({
    path: resolve(process.cwd(), '.env.local'),
    quiet: true,
  });
  process.env.OPENAPI_EXPORT = 'true';
  process.env.JWT_ACCESS_SECRET ??=
    'openapi-export-access-secret-32-characters';
  process.env.HASHING_PEPPER ??= 'openapi-export-hashing-pepper-32-characters';
  process.env.DATA_EXPORT_ENCRYPTION_KEY ??=
    'openapi-export-data-key-32-characters';
  const { AppModule } = await import('../src/app.module');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: false,
  });

  try {
    const config = app.get(ConfigService).getOrThrow<AppConfig>('app');
    app.setGlobalPrefix(config.apiPrefix);

    const document = enhanceOpenApiDocument(
      SwaggerModule.createDocument(app, buildOpenApiConfig()),
    );
    const destination = resolve(process.cwd(), 'openapi.json');
    const temporaryDestination = `${destination}.${process.pid}.tmp`;

    try {
      await writeFile(
        temporaryDestination,
        `${JSON.stringify(document, null, 2)}\n`,
        { encoding: 'utf8' },
      );
      await rename(temporaryDestination, destination);
    } catch (error) {
      await rm(temporaryDestination, { force: true });
      throw error;
    }
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
