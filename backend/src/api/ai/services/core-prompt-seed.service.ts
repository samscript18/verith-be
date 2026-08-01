import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AiProviderName } from '../enums/ai-provider-name.enum';
import { PromptStatus } from '../enums/prompt-status.enum';
import { AiPrompt } from '../schemas/prompt.schema';

const providers = Object.values(AiProviderName);

@Injectable()
export class CorePromptSeedService implements OnModuleInit {
  constructor(
    @InjectModel(AiPrompt.name) private readonly model: Model<AiPrompt>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.OPENAPI_EXPORT === 'true') return;
    await Promise.all([
      this.model
        .updateOne(
          { key: 'verification.claim-extraction', version: 1 },
          {
            $setOnInsert: {
              key: 'verification.claim-extraction',
              task: 'CLAIM_EXTRACTION',
              version: 1,
              status: PromptStatus.PUBLISHED,
              systemPrompt:
                'Extract factual claims without deciding whether they are true. Preserve exact source spans. Classify opinions and predictions honestly. Return only schema-valid JSON.',
              userPromptTemplate:
                'Language: {{language}}\n\nContent:\n{{content}}',
              supportedProviders: providers,
              supportedModels: [],
              outputSchemaVersion: 'claim-extraction.v1',
              createdBy: 'SYSTEM',
              publishedBy: 'SYSTEM',
              publishedAt: new Date(),
              changeSummary: 'Initial production claim extraction prompt',
            },
          },
          { upsert: true },
        )
        .exec(),
      this.model
        .updateOne(
          { key: 'verification.image-analysis', version: 1 },
          {
            $setOnInsert: {
              key: 'verification.image-analysis',
              task: 'IMAGE_UNDERSTANDING',
              version: 1,
              status: PromptStatus.PUBLISHED,
              systemPrompt:
                'Analyze the supplied image or screenshot. Extract visible text cautiously, preserve uncertain regions, and identify visible dates, URLs, publisher marks, likely content type, and possible cropping. Observations about synthetic generation are non-forensic clues only. Do not claim reverse-image search or definitive AI generation. Return only schema-valid JSON.',
              userPromptTemplate:
                'Inspect this verification image. Report only what is visibly supported.',
              supportedProviders: [
                AiProviderName.GEMINI,
                AiProviderName.OPENROUTER,
              ],
              supportedModels: [],
              outputSchemaVersion: 'image-analysis.v1',
              createdBy: 'SYSTEM',
              publishedBy: 'SYSTEM',
              publishedAt: new Date(),
              changeSummary: 'Initial cautious image and OCR analysis',
            },
          },
          { upsert: true },
        )
        .exec(),
      this.model
        .updateOne(
          { key: 'verification.video-analysis', version: 1 },
          {
            $setOnInsert: {
              key: 'verification.video-analysis',
              task: 'VIDEO_UNDERSTANDING',
              version: 1,
              status: PromptStatus.PUBLISHED,
              systemPrompt:
                'Analyze the supplied short video using both its visual and audio streams. Put only a verbatim rendering of audible speech in spokenText and only faithfully transcribed visible text in onScreenText; do not summarize either field. Preserve timestamps for key moments and separate direct observations from interpretation. Identify dates, URLs, publisher marks, edits, missing context, and uncertainty only when visibly or audibly supported. Do not claim forensic authenticity, identity certainty, or definitive AI generation. Return only schema-valid JSON.',
              userPromptTemplate:
                'Inspect this verification video. Return a cautious timestamped account of what is visibly and audibly supported.',
              supportedProviders: [AiProviderName.GEMINI],
              supportedModels: [],
              outputSchemaVersion: 'video-analysis.v1',
              createdBy: 'SYSTEM',
              publishedBy: 'SYSTEM',
              publishedAt: new Date(),
              changeSummary: 'Initial short-video understanding prompt',
            },
          },
          { upsert: true },
        )
        .exec(),
      this.model
        .updateOne(
          { key: 'verification.analysis', version: 1 },
          {
            $setOnInsert: {
              key: 'verification.analysis',
              task: 'EVIDENCE_SYNTHESIS',
              version: 1,
              status: PromptStatus.PUBLISHED,
              systemPrompt:
                'Compare only the supplied claims, retrieved evidence excerpts, and submitted content. Classify evidence relationships and identify bounded manipulation, item-level bias, and materially missing context. Never invent evidence IDs or source facts. Do not output verdicts, risk, or confidence; deterministic application code calculates them. Preserve exact text offsets and return only schema-valid JSON.',
              userPromptTemplate:
                'Submitted content:\n{{content}}\n\nClaims:\n{{claims}}\n\nEvidence:\n{{evidence}}',
              supportedProviders: providers,
              supportedModels: [],
              outputSchemaVersion: 'verification-analysis.v1',
              createdBy: 'SYSTEM',
              publishedBy: 'SYSTEM',
              publishedAt: new Date(),
              changeSummary: 'Initial evidence-grounded verification analysis',
            },
          },
          { upsert: true },
        )
        .exec(),
      this.model
        .updateOne(
          { key: 'verification.search-query-generation', version: 1 },
          {
            $setOnInsert: {
              key: 'verification.search-query-generation',
              task: 'SEARCH_QUERY_GENERATION',
              version: 1,
              status: PromptStatus.PUBLISHED,
              systemPrompt:
                'Generate focused evidence-search queries for externally verifiable claims. Include official, supporting, contradicting, contextual, recency, original, or quote-source intent as appropriate. Do not invent evidence. Return only schema-valid JSON.',
              userPromptTemplate:
                'Language: {{language}}\n\nClaims:\n{{claims}}',
              supportedProviders: providers,
              supportedModels: [],
              outputSchemaVersion: 'search-query-generation.v1',
              createdBy: 'SYSTEM',
              publishedBy: 'SYSTEM',
              publishedAt: new Date(),
              changeSummary: 'Initial production search query prompt',
            },
          },
          { upsert: true },
        )
        .exec(),
    ]);
  }
}
