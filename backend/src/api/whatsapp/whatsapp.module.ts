import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UploadsModule } from '../uploads/uploads.module';
import {
  MediaAsset,
  MediaAssetSchema,
} from '../uploads/schemas/media-asset.schema';
import { VerificationsModule } from '../verifications/verifications.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { WhatsAppController } from './controllers/whatsapp.controller';
import {
  WhatsAppLink,
  WhatsAppLinkSchema,
} from './schemas/whatsapp-link.schema';
import {
  WhatsAppMessage,
  WhatsAppMessageSchema,
} from './schemas/whatsapp-message.schema';
import { MetaWhatsAppService } from './services/meta-whatsapp.service';
import { WhatsAppLinkService } from './services/whatsapp-link.service';
import { WhatsAppService } from './services/whatsapp.service';
import { WHATSAPP_QUEUE } from './whatsapp.constants';
import { WhatsAppWorker } from './workers/whatsapp.worker';
import { runsWorkers } from '../../shared/utils/process-role';
import { VerificationCompletedWhatsAppHandler } from './handlers/verification-completed.handler';

const runsWhatsAppWorker =
  runsWorkers() && process.env.WHATSAPP_ENABLED === 'true';

@Module({
  imports: [
    UploadsModule,
    VerificationsModule,
    MongooseModule.forFeature([
      { name: WhatsAppLink.name, schema: WhatsAppLinkSchema },
      { name: WhatsAppMessage.name, schema: WhatsAppMessageSchema },
      { name: MediaAsset.name, schema: MediaAssetSchema },
      { name: User.name, schema: UserSchema },
    ]),
    BullModule.registerQueue({ name: WHATSAPP_QUEUE }),
  ],
  controllers: [WhatsAppController],
  providers: [
    MetaWhatsAppService,
    WhatsAppLinkService,
    WhatsAppService,
    VerificationCompletedWhatsAppHandler,
    ...(runsWhatsAppWorker ? [WhatsAppWorker] : []),
  ],
  exports: [WhatsAppService, WhatsAppLinkService],
})
export class WhatsAppModule {}
