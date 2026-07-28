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
import { Claim } from '../schemas/claim.schema';
import { TextNormalizationService } from './text-normalization.service';

interface ExtractedClaim {
  text: string;
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
    queries: Array<{ query: string; category: SearchQueryCategory }>;
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
    language: string,
    requestId: string,
  ): Promise<number> {
    const extraction = await this.ai.execute({
      capability: AiCapability.CLAIM_EXTRACTION,
      promptKey: 'verification.claim-extraction',
      variables: { content, language },
      outputSchemaName: 'claim_extraction',
      outputSchemaVersion: 'claim-extraction.v1',
      outputJsonSchema: this.claimJsonSchema(),
      outputValidator: this.claimJoiSchema(),
      requestId,
      verificationId,
      temperature: 0.1,
      maxOutputTokens: 6000,
    });
    const claims = extraction.output.claims.filter((claim) =>
      this.hasValidSpan(content, claim),
    );
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
          language,
          claims: JSON.stringify(queryInput),
        },
        outputSchemaName: 'search_query_generation',
        outputSchemaVersion: 'search-query-generation.v1',
        outputJsonSchema: this.queryJsonSchema(expectedSequences),
        outputValidator: this.queryJoiSchema(expectedSequences),
        requestId,
        verificationId,
        temperature: 0.1,
        maxOutputTokens: 4000,
      });
      queryPromptVersion = queryResult.promptVersion;
      for (const item of queryResult.output.claims) {
        queriesBySequence.set(
          item.sequence,
          this.deduplicateQueries(item.queries),
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

  private hasValidSpan(content: string, claim: ExtractedClaim): boolean {
    const { start, end } = claim.sourceSpan;
    if (start < 0 || end <= start || end > content.length) return false;
    const source = this.normalization.normalizeClaim(content.slice(start, end));
    const normalizedClaim = this.normalization.normalizeClaim(claim.text);
    return source.includes(normalizedClaim) || normalizedClaim.includes(source);
  }

  private deduplicateQueries(
    queries: QueryGenerationOutput['claims'][number]['queries'],
  ) {
    const seen = new Set<string>();
    return queries.filter((item) => {
      const key = item.query.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private claimJoiSchema(): Joi.ObjectSchema<ClaimExtractionOutput> {
    return Joi.object<ClaimExtractionOutput>({
      claims: Joi.array()
        .items(
          Joi.object({
            text: Joi.string().trim().min(3).max(1000).required(),
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
                  required: ['query', 'category'],
                  properties: {
                    query: { type: 'string' },
                    category: {
                      type: 'string',
                      enum: Object.values(SearchQueryCategory),
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
