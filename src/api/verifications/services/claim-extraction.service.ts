import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import Joi from 'joi';
import { Model, Types } from 'mongoose';
import { ValidationException } from '../../../core/exceptions';
import type { ProcessingConfig } from '../../../shared/config';
import { AiCapability } from '../../ai/enums/ai-capability.enum';
import { AiRouterService } from '../../ai/services/ai-router.service';
import {
  ClaimImportance,
  ClaimTimeSensitivity,
  ClaimType,
  ClaimVerifiability,
  SearchQueryCategory,
} from '../enums/claim.enum';
import { Claim, ClaimQuerySource } from '../schemas/claim.schema';
import { TextNormalizationService } from './text-normalization.service';
import { SupportedLanguage } from '../../../shared/language/supported-language';

interface ExtractedClaim {
  text: string;
  canonicalText: string;
  claimType: ClaimType;
  importance: ClaimImportance;
  verifiability: ClaimVerifiability;
  timeSensitivity: ClaimTimeSensitivity;
  entities: string[];
  dates: string[];
  locations: string[];
  quantities: string[];
  sourceSpan: { start: number; end: number };
  requiresCurrentInformation: boolean;
  searchHints: string[];
}

interface ClaimExtractionOutput {
  claims: ExtractedClaim[];
}

interface QueryGenerationOutput {
  claims: Array<{
    sequence: number;
    queries: Array<{
      query: string;
      category: SearchQueryCategory;
      language: string;
      source: ClaimQuerySource;
    }>;
  }>;
}

@Injectable()
export class ClaimExtractionService {
  private readonly config: ProcessingConfig;

  constructor(
    private readonly ai: AiRouterService,
    private readonly normalization: TextNormalizationService,
    @InjectModel(Claim.name) private readonly claimModel: Model<Claim>,
    configService: ConfigService,
  ) {
    this.config = configService.getOrThrow<ProcessingConfig>('processing');
  }

  async extractAndPersist(
    verificationId: string,
    content: string,
    sourceLanguage: string,
    requestedLanguage: SupportedLanguage,
    requestId: string,
  ): Promise<number> {
    const extraction = await this.ai.execute({
      capability: AiCapability.CLAIM_EXTRACTION,
      promptKey: 'verification.claim-extraction',
      variables: { content, sourceLanguage, requestedLanguage },
      outputSchemaName: 'claim_extraction',
      outputSchemaVersion: 'claim-extraction.v2',
      outputJsonSchema: this.claimJsonSchema(),
      outputValidator: this.claimJoiSchema(),
      requestId,
      verificationId,
      temperature: 0.1,
      maxOutputTokens: 6000,
      reasoningEffort: 'low',
    });
    const claims = extraction.output.claims.flatMap((claim) => {
      const sourceSpan = this.resolveSourceSpan(content, claim);
      return sourceSpan ? [{ ...claim, sourceSpan }] : [];
    });
    if (!claims.length) {
      throw new ValidationException(
        'No claims with valid source spans were extracted',
      );
    }
    const queryInput = claims
      .map((claim, index) => ({ claim, sequence: index + 1 }))
      .filter(({ claim }) =>
        [
          ClaimVerifiability.VERIFIABLE,
          ClaimVerifiability.PARTIALLY_VERIFIABLE,
        ].includes(claim.verifiability),
      )
      .map(({ claim, sequence }) => ({
        sequence,
        text: claim.text,
        canonicalText: claim.canonicalText,
        entities: claim.entities,
        dates: claim.dates,
        searchHints: claim.searchHints,
        verifiability: claim.verifiability,
      }));
    const queriesBySequence = new Map<
      number,
      QueryGenerationOutput['claims'][number]['queries']
    >();
    let queryPromptVersion: number | undefined;
    if (queryInput.length) {
      const expectedSequences = queryInput.map((item) => item.sequence);
      const queryResult = await this.ai.execute({
        capability: AiCapability.STRUCTURED_EXTRACTION,
        promptKey: 'verification.search-query-generation',
        variables: {
          sourceLanguage,
          requestedLanguage,
          claims: JSON.stringify(queryInput),
        },
        outputSchemaName: 'search_query_generation',
        outputSchemaVersion: 'search-query-generation.v2',
        outputJsonSchema: this.queryJsonSchema(expectedSequences),
        outputValidator: this.queryJoiSchema(expectedSequences),
        requestId,
        verificationId,
        temperature: 0.1,
        maxOutputTokens: 4000,
        reasoningEffort: 'minimal',
      });
      queryPromptVersion = queryResult.promptVersion;
      for (const item of queryResult.output.claims) {
        queriesBySequence.set(
          item.sequence,
          this.multilingualQueries(
            claims[item.sequence - 1]!,
            sourceLanguage,
            item.queries,
          ),
        );
      }
    }
    await this.claimModel.deleteMany({
      verificationId: new Types.ObjectId(verificationId),
    });
    await this.claimModel.insertMany(
      claims.map((claim, index) => ({
        verificationId: new Types.ObjectId(verificationId),
        sequence: index + 1,
        text: claim.text,
        originalLanguage: sourceLanguage,
        canonicalText: claim.canonicalText,
        canonicalLanguage: SupportedLanguage.ENGLISH,
        normalizedText: this.normalization.normalizeClaim(claim.text),
        claimType: claim.claimType,
        importance: claim.importance,
        verifiability: claim.verifiability,
        timeSensitivity: claim.timeSensitivity,
        entities: claim.entities,
        dates: claim.dates,
        locations: claim.locations,
        quantities: claim.quantities,
        sourceSpan: claim.sourceSpan,
        requiresCurrentInformation: claim.requiresCurrentInformation,
        searchHints: claim.searchHints,
        searchQueries: queriesBySequence.get(index + 1) ?? [],
        extractionPromptVersion: extraction.promptVersion,
        ...(queryPromptVersion ? { queryPromptVersion } : {}),
      })),
    );
    return claims.length;
  }

  async list(verificationId: string): Promise<Record<string, unknown>[]> {
    const claims = await this.claimModel
      .find({ verificationId: new Types.ObjectId(verificationId) })
      .sort({ sequence: 1 })
      .exec();
    return claims.map((claim) => ({
      id: claim.id,
      sequence: claim.sequence,
      text: claim.text,
      originalLanguage: claim.originalLanguage,
      canonicalText: claim.canonicalText,
      canonicalLanguage: claim.canonicalLanguage,
      normalizedText: claim.normalizedText,
      claimType: claim.claimType,
      importance: claim.importance,
      verifiability: claim.verifiability,
      timeSensitivity: claim.timeSensitivity,
      entities: claim.entities,
      dates: claim.dates,
      locations: claim.locations,
      quantities: claim.quantities,
      sourceSpan: claim.sourceSpan,
      requiresCurrentInformation: claim.requiresCurrentInformation,
      searchHints: claim.searchHints,
      searchQueries: claim.searchQueries,
    }));
  }

  private resolveSourceSpan(
    content: string,
    claim: ExtractedClaim,
  ): { start: number; end: number } | null {
    const { start, end } = claim.sourceSpan;
    if (start >= 0 && end > start && end <= content.length) {
      const source = content.slice(start, end);
      if (this.tokenOverlap(source, claim.text) >= 0.65) return { start, end };
    }

    const exactIndex = content
      .toLocaleLowerCase()
      .indexOf(claim.text.trim().toLocaleLowerCase());
    if (exactIndex >= 0) {
      return { start: exactIndex, end: exactIndex + claim.text.trim().length };
    }

    const tokens = claim.text.match(/[\p{L}\p{N}]+/gu) ?? [];
    if (tokens.length < 2) return null;
    const pattern = tokens
      .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('[\\s\\p{P}\\p{S}]*');
    const match = new RegExp(pattern, 'iu').exec(content);
    return match?.index !== undefined
      ? { start: match.index, end: match.index + match[0].length }
      : null;
  }

  private tokenOverlap(left: string, right: string): number {
    const tokens = (value: string) =>
      new Set(
        (value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
          (token) => token.length > 1,
        ),
      );
    const leftTokens = tokens(left);
    const rightTokens = tokens(right);
    if (!leftTokens.size || !rightTokens.size) return 0;
    const shared = [...rightTokens].filter((token) => leftTokens.has(token));
    return shared.length / rightTokens.size;
  }

  private deduplicateQueries(
    queries: QueryGenerationOutput['claims'][number]['queries'],
  ): QueryGenerationOutput['claims'][number]['queries'] {
    const seen = new Set<string>();
    return queries.filter((item) => {
      const key = item.query.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private multilingualQueries(
    claim: ExtractedClaim,
    sourceLanguage: string,
    generated: QueryGenerationOutput['claims'][number]['queries'],
  ): QueryGenerationOutput['claims'][number]['queries'] {
    const normalized = this.deduplicateQueries(generated).filter((item) =>
      [sourceLanguage, SupportedLanguage.ENGLISH].includes(item.language),
    );
    if (sourceLanguage === String(SupportedLanguage.ENGLISH)) {
      return normalized
        .map((item) => ({
          ...item,
          language: SupportedLanguage.ENGLISH,
          source: ClaimQuerySource.ORIGINAL_CLAIM,
        }))
        .slice(0, this.config.maxQueriesPerClaim);
    }

    const original = normalized.find(
      (item) =>
        item.language === sourceLanguage &&
        item.source === ClaimQuerySource.ORIGINAL_CLAIM,
    ) ?? {
      query: claim.text.slice(0, 300),
      category: SearchQueryCategory.ORIGINAL_SOURCE,
      language: sourceLanguage,
      source: ClaimQuerySource.ORIGINAL_CLAIM,
    };
    const canonical = normalized.find(
      (item) =>
        item.language === String(SupportedLanguage.ENGLISH) &&
        item.source === ClaimQuerySource.CANONICAL_CLAIM,
    ) ?? {
      query: claim.canonicalText.slice(0, 300),
      category: SearchQueryCategory.CONTEXTUAL,
      language: SupportedLanguage.ENGLISH,
      source: ClaimQuerySource.CANONICAL_CLAIM,
    };
    return this.deduplicateQueries([original, canonical]).slice(
      0,
      this.config.maxQueriesPerClaim,
    );
  }

  private claimJoiSchema(): Joi.ObjectSchema<ClaimExtractionOutput> {
    return Joi.object<ClaimExtractionOutput>({
      claims: Joi.array()
        .items(
          Joi.object({
            text: Joi.string().trim().min(3).max(1000).required(),
            canonicalText: Joi.string().trim().min(3).max(1000).required(),
            claimType: Joi.string()
              .valid(...Object.values(ClaimType))
              .required(),
            importance: Joi.string()
              .valid(...Object.values(ClaimImportance))
              .required(),
            verifiability: Joi.string()
              .valid(...Object.values(ClaimVerifiability))
              .required(),
            timeSensitivity: Joi.string()
              .valid(...Object.values(ClaimTimeSensitivity))
              .required(),
            entities: Joi.array()
              .items(Joi.string().max(200))
              .max(30)
              .required(),
            dates: Joi.array().items(Joi.string().max(100)).max(20).required(),
            locations: Joi.array()
              .items(Joi.string().max(200))
              .max(20)
              .required(),
            quantities: Joi.array()
              .items(Joi.string().max(100))
              .max(20)
              .required(),
            sourceSpan: Joi.object({
              start: Joi.number().integer().min(0).required(),
              end: Joi.number().integer().min(1).required(),
            }).required(),
            requiresCurrentInformation: Joi.boolean().required(),
            searchHints: Joi.array()
              .items(Joi.string().max(200))
              .max(20)
              .required(),
          }),
        )
        .min(1)
        .max(this.config.maxClaims)
        .required(),
    }).required();
  }

  private queryJoiSchema(
    expectedSequences: number[],
  ): Joi.ObjectSchema<QueryGenerationOutput> {
    return Joi.object<QueryGenerationOutput>({
      claims: Joi.array()
        .items(
          Joi.object({
            sequence: Joi.number()
              .integer()
              .valid(...expectedSequences)
              .required(),
            queries: Joi.array()
              .items(
                Joi.object({
                  query: Joi.string().trim().min(3).max(300).required(),
                  category: Joi.string()
                    .valid(...Object.values(SearchQueryCategory))
                    .required(),
                  language: Joi.string().trim().min(2).max(20).required(),
                  source: Joi.string()
                    .valid(...Object.values(ClaimQuerySource))
                    .required(),
                }),
              )
              .min(1)
              .max(this.config.maxQueriesPerClaim)
              .required(),
          }),
        )
        .length(expectedSequences.length)
        .unique('sequence')
        .required(),
    }).required();
  }

  private claimJsonSchema(): Record<string, unknown> {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['claims'],
      properties: {
        claims: {
          type: 'array',
          minItems: 1,
          maxItems: this.config.maxClaims,
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'text',
              'canonicalText',
              'claimType',
              'importance',
              'verifiability',
              'timeSensitivity',
              'entities',
              'dates',
              'locations',
              'quantities',
              'sourceSpan',
              'requiresCurrentInformation',
              'searchHints',
            ],
            properties: {
              text: { type: 'string' },
              canonicalText: { type: 'string' },
              claimType: { type: 'string', enum: Object.values(ClaimType) },
              importance: {
                type: 'string',
                enum: Object.values(ClaimImportance),
              },
              verifiability: {
                type: 'string',
                enum: Object.values(ClaimVerifiability),
              },
              timeSensitivity: {
                type: 'string',
                enum: Object.values(ClaimTimeSensitivity),
              },
              entities: { type: 'array', items: { type: 'string' } },
              dates: { type: 'array', items: { type: 'string' } },
              locations: { type: 'array', items: { type: 'string' } },
              quantities: { type: 'array', items: { type: 'string' } },
              sourceSpan: {
                type: 'object',
                additionalProperties: false,
                required: ['start', 'end'],
                properties: {
                  start: { type: 'integer', minimum: 0 },
                  end: { type: 'integer', minimum: 1 },
                },
              },
              requiresCurrentInformation: { type: 'boolean' },
              searchHints: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    };
  }

  private queryJsonSchema(
    expectedSequences: number[],
  ): Record<string, unknown> {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['claims'],
      properties: {
        claims: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['sequence', 'queries'],
            properties: {
              sequence: { type: 'integer', enum: expectedSequences },
              queries: {
                type: 'array',
                minItems: 1,
                maxItems: this.config.maxQueriesPerClaim,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['query', 'category', 'language', 'source'],
                  properties: {
                    query: { type: 'string' },
                    category: {
                      type: 'string',
                      enum: Object.values(SearchQueryCategory),
                    },
                    language: { type: 'string' },
                    source: {
                      type: 'string',
                      enum: Object.values(ClaimQuerySource),
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
  }
}
