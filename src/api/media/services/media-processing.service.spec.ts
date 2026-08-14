import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import { ExternalProviderException } from '../../../core/exceptions';
import { AiCapability } from '../../ai/enums/ai-capability.enum';
import { AiProviderName } from '../../ai/enums/ai-provider-name.enum';
import type { AiRouterService } from '../../ai/services/ai-router.service';
import type { MediaAsset } from '../../uploads/schemas/media-asset.schema';
import { VerificationSourceType } from '../../verifications/enums/verification-source-type.enum';
import type { VerificationDocument } from '../../verifications/schemas/verification.schema';
import type { MediaAnalysis } from '../schemas/media-analysis.schema';
import type { Transcript } from '../schemas/transcript.schema';
import type { GroqTranscriptionService } from './groq-transcription.service';
import { MediaProcessingService } from './media-processing.service';
import type { TrustedMediaService } from './trusted-media.service';

describe('MediaProcessingService audio reliability', () => {
  it('uses one Gemini audio fallback when Groq transcription is unavailable', async () => {
    const verificationId = new Types.ObjectId();
    const assetId = new Types.ObjectId();
    const execute = jest.fn().mockResolvedValue({
      output: {
        text: 'A verified transcript',
        language: 'en',
        segments: [],
      },
      provider: AiProviderName.GEMINI,
      primaryProvider: AiProviderName.GEMINI,
      fallbackUsed: false,
      model: 'gemini-model',
      promptVersion: 1,
      usage: {},
    });
    const updateExec = jest.fn().mockResolvedValue({});
    const findOneAndUpdate = jest.fn(
      (
        filter: unknown,
        update: { $set: { provider: string } },
        options: unknown,
      ) => {
        void filter;
        void update;
        void options;
        return { exec: updateExec };
      },
    );
    const service = new MediaProcessingService(
      { execute } as unknown as AiRouterService,
      {
        assertTrustedUrl: jest.fn(),
        audioBytes: jest.fn().mockResolvedValue({
          mimeType: 'audio/mpeg',
          base64Data: 'YXVkaW8=',
        }),
      } as unknown as TrustedMediaService,
      {
        transcribe: jest
          .fn()
          .mockRejectedValue(
            new ExternalProviderException(
              'Groq unavailable',
              'TRANSCRIPTION_UNAVAILABLE',
            ),
          ),
      } as unknown as GroqTranscriptionService,
      {
        findOne: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            _id: assetId,
            secureUrl: 'https://res.cloudinary.com/verith/audio.mp3',
          }),
        }),
      } as unknown as Model<MediaAsset>,
      {} as Model<MediaAnalysis>,
      { findOneAndUpdate } as unknown as Model<Transcript>,
    );

    await expect(
      service.process(
        {
          _id: verificationId,
          id: verificationId.toString(),
          sourceType: VerificationSourceType.AUDIO,
          mediaAssetIds: [assetId],
        } as VerificationDocument,
        'req-audio',
      ),
    ).resolves.toEqual({ text: 'A verified transcript', language: 'en' });
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: AiCapability.AUDIO_REASONING,
        maxProviderCalls: 1,
      }),
    );
    expect(findOneAndUpdate).toHaveBeenCalled();
    const update = findOneAndUpdate.mock.calls[0]?.[1] as unknown as {
      $set: { provider: string };
    };
    expect(update.$set.provider).toBe(AiProviderName.GEMINI);
  });
});
