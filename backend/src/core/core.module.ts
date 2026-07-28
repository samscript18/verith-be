import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { RequestIdMiddleware } from './middleware/request-id.middleware';

@Module({})
export class CoreModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('{*path}');
  }
}
