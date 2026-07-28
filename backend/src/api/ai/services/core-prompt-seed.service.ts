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
