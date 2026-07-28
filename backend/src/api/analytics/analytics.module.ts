import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ProviderExecution,
  ProviderExecutionSchema,
} from '../ai/schemas/provider-execution.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  Verification,
  VerificationSchema,
} from '../verifications/schemas/verification.schema';
import {
  WhatsAppMessage,
  WhatsAppMessageSchema,
} from '../whatsapp/schemas/whatsapp-message.schema';
import { AnalyticsController } from './controllers/analytics.controller';
import { AnalyticsService } from './services/analytics.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Verification.name, schema: VerificationSchema },
      { name: ProviderExecution.name, schema: ProviderExecutionSchema },
      { name: WhatsAppMessage.name, schema: WhatsAppMessageSchema },
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
