import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiModule } from '../ai/ai.module';
import {
  MediaAsset,
  MediaAssetSchema,
} from '../uploads/schemas/media-asset.schema';
import {
  MediaAnalysis,
  MediaAnalysisSchema,
} from './schemas/media-analysis.schema';
import { Transcript, TranscriptSchema } from './schemas/transcript.schema';
import { GroqTranscriptionService } from './services/groq-transcription.service';
import { MediaProcessingService } from './services/media-processing.service';
import { TrustedMediaService } from './services/trusted-media.service';

@Module({
  imports: [
    AiModule,
    MongooseModule.forFeature([
      { name: MediaAsset.name, schema: MediaAssetSchema },
      { name: MediaAnalysis.name, schema: MediaAnalysisSchema },
      { name: Transcript.name, schema: TranscriptSchema },
    ]),
  ],
  providers: [
    TrustedMediaService,
    GroqTranscriptionService,
    MediaProcessingService,
  ],
  exports: [MediaProcessingService, MongooseModule],
})
export class MediaModule {}
