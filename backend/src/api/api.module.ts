import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { UploadsModule } from './uploads/uploads.module';
import { VerificationsModule } from './verifications/verifications.module';

@Module({
  imports: [
    DatabaseModule,
    IntegrationsModule,
    HealthModule,
    UsersModule,
    AuthModule,
    UploadsModule,
    VerificationsModule,
  ],
})
export class ApiModule {}
