import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import { AvatarUploadsController } from './avatar-uploads.controller';
import { CloudinaryProviderAdapter } from './providers/cloudinary.provider';
import { CLOUDINARY_PROVIDER } from './interfaces/cloudinary-provider.interface';
import { MediaAsset, MediaAssetSchema } from './schemas/media-asset.schema';
import { UploadsCleanupService } from './uploads-cleanup.service';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { runsScheduler } from '../../shared/utils/process-role';

@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: MediaAsset.name, schema: MediaAssetSchema },
    ]),
  ],
  controllers: [UploadsController, AvatarUploadsController],
  providers: [
    UploadsService,
    ...(runsScheduler() ? [UploadsCleanupService] : []),
    {
      provide: CLOUDINARY_PROVIDER,
      useClass: CloudinaryProviderAdapter,
    },
  ],
  exports: [UploadsService, MongooseModule, CLOUDINARY_PROVIDER],
})
export class UploadsModule {}
