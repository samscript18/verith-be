import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import Joi from 'joi';
import { Model, Types } from 'mongoose';
import { ExternalProviderException } from '../../../core/exceptions';
import { AiCapability } from '../../ai/enums/ai-capability.enum';
import { AiRouterService } from '../../ai/services/ai-router.service';
import {
  MediaAsset,
  type MediaAssetDocument,
} from '../../uploads/schemas/media-asset.schema';
import { VerificationSourceType } from '../../verifications/enums/verification-source-type.enum';
import type { VerificationDocument } from '../../verifications/schemas/verification.schema';
import {
  AiContentIndicator,
  MediaAnalysisStatus,
  ReverseImageStatus,
  TranscriptStatus,
} from '../enums/media.enum';
import { MediaAnalysis } from '../schemas/media-analysis.schema';
import { Transcript } from '../schemas/transcript.schema';
import { GroqTranscriptionService } from './groq-transcription.service';
import { TrustedMediaService } from './trusted-media.service';

interface ImageOutput {
  fullText: string;
  lines: string[];
  language: string;
  uncertainRegions: string[];
  visibleDates: string[];
  visibleUrls: string[];
  visiblePublisherNames: string[];
  likelyContentType: string;
  potentialCropping: boolean;
  observations: string[];
  limitations: string[];
}

@Injectable()
export class MediaProcessingService {
  constructor(
    private readonly ai: AiRouterService,
    private readonly trusted: TrustedMediaService,
    private readonly transcription: GroqTranscriptionService,
    @InjectModel(MediaAsset.name)
    private readonly assetModel: Model<MediaAsset>,
    @InjectModel(MediaAnalysis.name)
    private readonly analysisModel: Model<MediaAnalysis>,
    @InjectModel(Transcript.name)
    private readonly transcriptModel: Model<Transcript>,
  ) {}

  async process(
    verification: VerificationDocument,
    requestId: string,
  ): Promise<{ text: string; language: string }> {
    const asset = await this.assetModel
      .findOne({
        _id: verification.mediaAssetIds[0],
        attachedResourceId: verification._id,
      })
      .exec();
    if (!asset?.secureUrl)
      throw new ExternalProviderException(
        'The attached media asset is unavailable',
        'MEDIA_ASSET_UNAVAILABLE',
      );
    this.trusted.assertTrustedUrl(asset.secureUrl);
    if (verification.sourceType === VerificationSourceType.AUDIO)
      return this.processAudio(verification, asset, asset.secureUrl);
    return this.processImage(verification, asset, asset.secureUrl, requestId);
  }

  async get(verificationId: string) {
    const id = new Types.ObjectId(verificationId);
    const [analysis, transcript] = await Promise.all([
      this.analysisModel.findOne({ verificationId: id }).lean().exec(),
      this.transcriptModel.findOne({ verificationId: id }).lean().exec(),
    ]);
    return { analysis, transcript };
  }

  private async processImage(
    verification: VerificationDocument,
    asset: MediaAssetDocument,
    url: string,
    requestId: string,
  ): Promise<{ text: string; language: string }> {
    const media = await this.trusted.imageBytes(url);
    const result = await this.ai.execute({
      capability: AiCapability.IMAGE_UNDERSTANDING,
      promptKey: 'verification.image-analysis',
      variables: {},
      outputSchemaName: 'image_analysis',
      outputSchemaVersion: 'image-analysis.v1',
      outputJsonSchema: this.imageJsonSchema(),
      outputValidator: this.imageJoiSchema(),
      requestId,
      verificationId: verification.id,
      temperature: 0.1,
      maxOutputTokens: 5000,
      media,
    });
    const output = result.output;
    const limitation =
      'AI-generated content detection is probabilistic and must not be treated as definitive proof by itself.';
    await this.analysisModel.findOneAndUpdate(
      { verificationId: verification._id },
      {
        $set: {
          verificationId: verification._id,
          mediaAssetId: asset._id,
          status: MediaAnalysisStatus.COMPLETE,
          provider: result.provider,
          fullText: output.fullText,
          blocks: [],
          lines: output.lines,
          language: output.language,
          confidence: this.ocrConfidence(output),
          uncertainRegions: output.uncertainRegions,
          visibleDates: output.visibleDates,
          visibleUrls: output.visibleUrls,
          visiblePublisherNames: output.visiblePublisherNames,
          likelyContentType: output.likelyContentType,
          potentialCropping: output.potentialCropping,
          aiIndicator: AiContentIndicator.INCONCLUSIVE,
          aiIndicatorConfidence: 0,
          aiObservations: output.observations,
          aiLimitations: [limitation, ...output.limitations],
          specializedDetectorUsed: false,
          reverseImageStatus: ReverseImageStatus.NOT_CONFIGURED,
          reverseImageMatches: [],
          limitations: [
            ...output.limitations,
            'No reverse-image provider is configured.',
            limitation,
          ],
          promptVersion: result.promptVersion,
        },
      },
      { upsert: true, returnDocument: 'after', runValidators: true },
    );
    return { text: output.fullText, language: output.language };
  }

  private async processAudio(
    verification: VerificationDocument,
    asset: MediaAssetDocument,
    url: string,
  ): Promise<{ text: string; language: string }> {
    const result = await this.transcription.transcribe(url);
    const confidences = result.segments.flatMap((item) =>
      item.confidence === undefined ? [] : [item.confidence],
    );
    await this.transcriptModel.findOneAndUpdate(
      { verificationId: verification._id },
      {
        $set: {
          verificationId: verification._id,
          mediaAssetId: asset._id,
          provider: 'GROQ',
          language: result.language,
          ...(result.duration !== undefined
            ? { duration: result.duration }
            : {}),
          fullText: result.text,
          segments: result.segments,
          ...(confidences.length
            ? {
                averageConfidence:
                  confidences.reduce((sum, value) => sum + value, 0) /
                  confidences.length,
              }
            : {}),
          status: TranscriptStatus.COMPLETE,
          limitations: confidences.length
            ? []
            : ['The provider did not return segment confidence metadata.'],
        },
      },
      { upsert: true, returnDocument: 'after', runValidators: true },
    );
    return { text: result.text, language: result.language };
  }

  private imageJoiSchema(): Joi.ObjectSchema<ImageOutput> {
    const strings = Joi.array()
      .items(Joi.string().max(1000))
      .max(100)
      .required();
    return Joi.object<ImageOutput>({
      fullText: Joi.string().allow('').max(50000).required(),
      lines: strings,
      language: Joi.string().max(20).required(),
      uncertainRegions: strings,
      visibleDates: strings,
      visibleUrls: strings,
      visiblePublisherNames: strings,
      likelyContentType: Joi.string().max(100).required(),
      potentialCropping: Joi.boolean().required(),
      observations: strings,
      limitations: strings,
    }).required();
  }

  private imageJsonSchema(): Record<string, unknown> {
    const array = { type: 'array', items: { type: 'string' } };
    return {
      type: 'object',
      additionalProperties: false,
      required: [
        'fullText',
        'lines',
        'language',
        'uncertainRegions',
        'visibleDates',
        'visibleUrls',
        'visiblePublisherNames',
        'likelyContentType',
        'potentialCropping',
        'observations',
        'limitations',
      ],
      properties: {
        fullText: { type: 'string' },
        lines: array,
        language: { type: 'string' },
        uncertainRegions: array,
        visibleDates: array,
        visibleUrls: array,
        visiblePublisherNames: array,
        likelyContentType: { type: 'string' },
        potentialCropping: { type: 'boolean' },
        observations: array,
        limitations: array,
      },
    };
  }

  private ocrConfidence(output: ImageOutput): number {
    if (!output.fullText.trim()) return 0;
    const lineCount = Math.max(output.lines.length, 1);
    const uncertaintyPenalty = Math.min(
      0.6,
      output.uncertainRegions.length / lineCount / 2,
    );
    return Math.round(Math.max(0.2, 0.85 - uncertaintyPenalty) * 1000) / 1000;
  }
}
