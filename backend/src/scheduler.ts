import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { nestLogLevels } from './shared/utils/nest-log-levels';

async function bootstrapScheduler() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: nestLogLevels(),
  });
  app.enableShutdownHooks();
}

void bootstrapScheduler();
