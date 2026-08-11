import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import type { MongooseModuleOptions } from '@nestjs/mongoose';
import { createConnection } from 'mongoose';
import type { DatabaseConfig } from '../../shared/config';
import { DatabaseService } from './database.service';

const exportingOpenApi = process.env.OPENAPI_EXPORT === 'true';
const databaseImports = exportingOpenApi
  ? []
  : [
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
    ];
const openApiProviders = exportingOpenApi
  ? [
      {
        provide: getConnectionToken(),
        useFactory: () => createConnection(),
      },
    ]
  : [];

@Global()
@Module({
  imports: databaseImports,
  providers: [DatabaseService, ...openApiProviders],
  exports: [
    DatabaseService,
    ...(exportingOpenApi ? [getConnectionToken()] : [MongooseModule]),
  ],
})
export class DatabaseModule {}
