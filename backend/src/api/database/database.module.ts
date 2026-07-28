import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import type { MongooseModuleOptions } from '@nestjs/mongoose';
import type { DatabaseConfig } from '../../shared/config';
import { DatabaseService } from './database.service';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): MongooseModuleOptions => {
        const config = configService.getOrThrow<DatabaseConfig>('database');
        return {
          uri: config.uri,
          dbName: config.name,
          appName: 'verith-backend',
          maxPoolSize: config.maxPoolSize,
          minPoolSize: config.minPoolSize,
          serverSelectionTimeoutMS: config.serverSelectionTimeoutMs,
          socketTimeoutMS: config.socketTimeoutMs,
          autoIndex: config.autoIndex,
        };
      },
    }),
  ],
  providers: [DatabaseService],
  exports: [DatabaseService, MongooseModule],
})
export class DatabaseModule {}
