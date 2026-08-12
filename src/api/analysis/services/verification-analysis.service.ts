import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import Joi from 'joi';
import { Model, Types } from 'mongoose';
import { AiCapability } from '../../ai/enums/ai-capability.enum';
import { AiRouterService } from '../../ai/services/ai-router.service';
import {
  EvidenceAccessStatus,
  EvidenceAuthority,
  EvidenceLineageType,
  EvidenceRelationship,
} from '../../evidence/enums/evidence.enum';
import {
  Evidence,
  type EvidenceDocument,
} from '../../evidence/schemas/evidence.schema';
import {
  ClaimImportance,
  ClaimVerifiability,
} from '../../verifications/enums/claim.enum';
import {
  Claim,
  type ClaimDocument,
} from '../../verifications/schemas/claim.schema';
import { ExtractedContent } from '../../verifications/schemas/extracted-content.schema';
import { Verification } from '../../verifications/schemas/verification.schema';
import { PublishersService } from '../../publishers/services/publishers.service';
import {
  AnalysisSeverity,
  BiasMetricName,
  ClaimVerdict,
  ManipulationCategory,
  MissingContextType,
  OverallVerdict,
  RiskLevel,
} from '../enums/analysis.enum';
import { ClaimEvaluation } from '../schemas/claim-evaluation.schema';
import { VerificationAnalysis } from '../schemas/verification-analysis.schema';

interface AnalysisOutput {
  claims: Array<{
    claimId: string;
    evidence: Array<{
      evidenceId: string;
      relationship: EvidenceRelationship;
    }>;
    explanation: string;
    evidenceSummary: string;
    uncertainties: string[];
    limitations: string[];
  }>;
  manipulation: Array<{
    category: ManipulationCategory;
    severity: AnalysisSeverity;
    phrase: string;
    startOffset: number;
    endOffset: number;
    explanation: string;
    limitations: string[];
  }>;
  bias: Array<{
    metric: BiasMetricName;
    score: number;
    label: string;
    explanation: string;
    textEvidence: string[];
    limitations: string[];
  }>;
  missingContext: Array<{
    type: MissingContextType;
    severity: AnalysisSeverity;
    omittedContext: string;
    whyItMatters: string;
    correctedContext: string;
    evidenceIds: string[];
    limitations: string[];
  }>;
}

@Injectable()
export class VerificationAnalysisService {
  static readonly METHOD_VERSION = 'verification-analysis.v1';

  constructor(
    private readonly ai: AiRouterService,
    @InjectModel(Claim.name) private readonly claimModel: Model<Claim>,
    @InjectModel(Evidence.name) private readonly evidenceModel: Model<Evidence>,
    @InjectModel(ExtractedContent.name)
    private readonly contentModel: Model<ExtractedContent>,
    @InjectModel(Verification.name)
    private readonly verificationModel: Model<Verification>,
    @InjectModel(ClaimEvaluation.name)
    private readonly evaluationModel: Model<ClaimEvaluation>,
    @InjectModel(VerificationAnalysis.name)
    private readonly analysisModel: Model<VerificationAnalysis>,
    private readonly publishers: PublishersService,
  ) {}

  async analyze(
    verificationId: string,
    requestId: string,
  ): Promise<VerificationAnalysis> {
    const id = new Types.ObjectId(verificationId);
    const [claims, content, verification] = await Promise.all([
      this.claimModel.find({ verificationId: id }).sort({ sequence: 1 }).exec(),
      this.contentModel.findOne({ verificationId: id }).lean().exec(),
      this.verificationModel.findById(id).lean().exec(),
    ]);
    const evidence = await this.evidenceModel
      .find({
        verificationId: id,
        claimId: { $in: claims.map((claim) => claim._id) },
      })
      .exec();
    const output = await this.ai.execute({
      capability: AiCapability.EVIDENCE_SYNTHESIS,
      promptKey: 'verification.analysis',
      variables: {
        sourceLanguage: verification?.detectedLanguage ?? 'und',
        requestedLanguage: verification?.requestedLanguage ?? 'en',
        content: content?.normalizedText ?? '',
        claims: JSON.stringify(
          claims.map((claim) => ({
            id: claim.id,
            originalText: claim.text,
            originalLanguage: claim.originalLanguage,
            canonicalText: claim.canonicalText,
            canonicalLanguage: claim.canonicalLanguage,
            importance: claim.importance,
            verifiability: claim.verifiability,
            timeSensitivity: claim.timeSensitivity,
          })),
        ),
        evidence: JSON.stringify(
          evidence.map((item) => ({
            id: item.id,
            claimId: item.claimId.toString(),
            title: item.title,
            domain: item.domain,
            publishedAt: item.publishedAt ?? null,
            excerpt: item.relevantExcerpt ?? null,
            originalExcerpt:
              item.originalExcerpt ?? item.relevantExcerpt ?? null,
            language: item.language ?? null,
            accessStatus: item.accessStatus,
            authority: item.authority,
            relevanceScore: item.relevanceScore,
            directnessScore: item.directnessScore,
            lineageType: item.lineageType,
          })),
        ),
      },
      outputSchemaName: 'verification_analysis',
      outputSchemaVersion: 'verification-analysis.v2',
      outputJsonSchema: this.jsonSchema(),
      outputValidator: this.joiSchema(),
      requestId,
      verificationId,
      temperature: 0.1,
      maxOutputTokens: 10000,
    });
    const safe = this.validateReferences(
      output.output,
      claims,
      evidence,
      content?.normalizedText ?? '',
    );
    await this.evaluationModel.deleteMany({ verificationId: id }).exec();
    const evaluations = await Promise.all(
      claims.map((claim) =>
        this.evaluateClaim(
          id,
          claim,
          evidence.filter((item) => item.claimId.equals(claim._id)),
          safe.claims.find((item) => item.claimId === claim.id),
          output.promptVersion,
        ),
      ),
    );
    await this.applyRelationships(evidence, safe);
    const manipulation = safe.manipulation.map((item) => ({
      ...item,
      confidence: this.spanConfidence(
        content?.normalizedText ?? '',
        item.phrase,
        item.startOffset,
        item.endOffset,
      ),
    }));
    const bias = safe.bias.map((item) => ({
      ...item,
      score: this.clamp(item.score),
      confidence: this.textEvidenceConfidence(
        content?.normalizedText ?? '',
        item.textEvidence,
      ),
    }));
    const missingContext = safe.missingContext.map((item) => ({
      ...item,
      evidenceIds: item.evidenceIds.map((value) => new Types.ObjectId(value)),
      confidence: this.contextConfidence(item.evidenceIds, evidence),
    }));
    const sourceAssessments = this.sourceAssessments(evidence);
    await Promise.all(
      sourceAssessments.map((item) =>
        this.publishers.ensureDiscovered(
          item.domain,
          evidence.find((value) => value.domain === item.domain)?.publisher,
        ),
      ),
    );
    const overall = this.overall(
      evaluations,
      claims,
      manipulation,
      missingContext,
    );
    return this.analysisModel
      .findOneAndUpdate(
        { verificationId: id },
        {
          $set: {
            verificationId: id,
            overallVerdict: overall.verdict,
            riskLevel: overall.risk,
            confidence: overall.confidence,
            confidenceFactors: overall.factors,
            manipulationFindings: manipulation,
            biasMetrics: bias,
            missingContextIssues: missingContext,
            sourceAssessments,
            limitations: this.analysisLimitations(evidence),
            methodVersion: VerificationAnalysisService.METHOD_VERSION,
            promptVersion: output.promptVersion,
            analyzedAt: new Date(),
          },
        },
        { upsert: true, returnDocument: 'after', runValidators: true },
      )
      .orFail()
      .exec();
  }

  async get(verificationId: string): Promise<Record<string, unknown> | null> {
    const id = new Types.ObjectId(verificationId);
    const [analysis, evaluations] = await Promise.all([
      this.analysisModel.findOne({ verificationId: id }).lean().exec(),
      this.evaluationModel.find({ verificationId: id }).lean().exec(),
    ]);
    if (!analysis) return null;
    return {
      ...analysis,
      _id: undefined,
      id: analysis._id.toString(),
      verificationId,
      claimEvaluations: evaluations.map((item) => ({
        ...item,
        _id: undefined,
        id: item._id.toString(),
        verificationId: undefined,
        claimId: item.claimId.toString(),
      })),
    };
  }

  private async evaluateClaim(
    verificationId: Types.ObjectId,
    claim: ClaimDocument,
    evidence: EvidenceDocument[],
    comparison: AnalysisOutput['claims'][number] | undefined,
    promptVersion: number,
  ): Promise<ClaimEvaluation> {
    const relations = new Map(
      comparison?.evidence.map((item) => [
        item.evidenceId,
        item.relationship,
      ]) ?? [],
    );
    const available = evidence.filter(
      (item) =>
        [
          EvidenceAccessStatus.AVAILABLE,
          EvidenceAccessStatus.PARTIALLY_AVAILABLE,
        ].includes(item.accessStatus) &&
        item.lineageType === EvidenceLineageType.UNIQUE,
    );
    const supporting = available.filter(
      (item) => relations.get(item.id) === EvidenceRelationship.SUPPORTS,
    );
    const contradicting = available.filter(
      (item) => relations.get(item.id) === EvidenceRelationship.CONTRADICTS,
    );
    const context = available.filter(
      (item) =>
        relations.get(item.id) === EvidenceRelationship.PROVIDES_CONTEXT,
    );
    const factors = this.confidenceFactors(
      available,
      supporting,
      contradicting,
    );
    const confidence = this.confidence(factors);
    const verdict = this.verdict(
      claim,
      supporting,
      contradicting,
      context,
      confidence,
    );
    return this.evaluationModel.create({
      verificationId,
      claimId: claim._id,
      verdict,
      confidence,
      explanation:
        comparison?.explanation ??
        'No schema-valid evidence comparison was available.',
      supportingEvidenceIds: supporting.map((item) => item._id),
      contradictingEvidenceIds: contradicting.map((item) => item._id),
      contextEvidenceIds: context.map((item) => item._id),
      evidenceSummary:
        comparison?.evidenceSummary ?? 'No accessible evidence was available.',
      uncertainties: comparison?.uncertainties ?? [
        'The evidence relationship could not be established.',
      ],
      limitations: [
        ...(comparison?.limitations ?? []),
        ...(available.length
          ? []
          : ['No independent accessible source was available.']),
      ],
      confidenceFactors: factors,
      evaluatedAt: new Date(),
      methodVersion: VerificationAnalysisService.METHOD_VERSION,
      promptVersion,
    });
  }

  private confidenceFactors(
    available: EvidenceDocument[],
    supporting: EvidenceDocument[],
    contradicting: EvidenceDocument[],
  ): Record<string, number | boolean> {
    const quality = (item: EvidenceDocument) =>
      item.accessStatus === EvidenceAccessStatus.AVAILABLE ? 1 : 0.5;
    const independent = available.reduce((sum, item) => sum + quality(item), 0);
    const authority =
      independent === 0
        ? 0
        : available.reduce(
            (sum, item) =>
              sum +
              quality(item) *
                (item.authority === EvidenceAuthority.HIGH
                  ? 1
                  : item.authority === EvidenceAuthority.MODERATE
                    ? 0.7
                    : item.authority === EvidenceAuthority.UNKNOWN
                      ? 0.5
                      : 0),
            0,
          ) / independent;
    const directness =
      independent === 0
        ? 0
        : available.reduce(
            (sum, item) => sum + item.directnessScore * quality(item),
            0,
          ) / independent;
    const recency =
      independent === 0
        ? 0
        : available.reduce(
            (sum, item) => sum + item.recencyScore * quality(item),
            0,
          ) / independent;
    const supportingWeight = supporting.reduce(
      (sum, item) => sum + quality(item),
      0,
    );
    const contradictingWeight = contradicting.reduce(
      (sum, item) => sum + quality(item),
      0,
    );
    const related = supportingWeight + contradictingWeight;
    const agreement =
      related === 0
        ? 0
        : Math.max(supportingWeight, contradictingWeight) / related;
    return {
      independentSourceCount: Math.min(independent, 5) / 5,
      authority,
      directness,
      recency,
      sourceAgreement: agreement,
      primarySourceAvailable: available.some(
        (item) =>
          item.accessStatus === EvidenceAccessStatus.AVAILABLE &&
          item.authority === EvidenceAuthority.HIGH,
      ),
      contradictoryEvidencePresent: contradicting.length > 0,
      structuredOutputValid: true,
    };
  }

  private confidence(factors: Record<string, number | boolean>): number {
    const number = (key: string) =>
      typeof factors[key] === 'number' ? factors[key] : 0;
    return this.round(
      number('independentSourceCount') * 0.25 +
        number('authority') * 0.2 +
        number('directness') * 0.2 +
        number('sourceAgreement') * 0.2 +
        number('recency') * 0.05 +
        (factors.primarySourceAvailable ? 0.05 : 0) +
        (factors.structuredOutputValid ? 0.05 : 0),
    );
  }

  private verdict(
    claim: ClaimDocument,
    supports: EvidenceDocument[],
    contradicts: EvidenceDocument[],
    context: EvidenceDocument[],
    confidence: number,
  ): ClaimVerdict {
    if (
      ![
        ClaimVerifiability.VERIFIABLE,
        ClaimVerifiability.PARTIALLY_VERIFIABLE,
      ].includes(claim.verifiability)
    )
      return ClaimVerdict.UNVERIFIABLE;
    if (!supports.length && !contradicts.length)
      return ClaimVerdict.INSUFFICIENT_EVIDENCE;
    if (confidence < 0.35) return ClaimVerdict.INSUFFICIENT_EVIDENCE;
    if (supports.length && contradicts.length) return ClaimVerdict.MIXED;
    if (contradicts.length)
      return context.length
        ? ClaimVerdict.MISLEADING
        : ClaimVerdict.CONTRADICTED;
    return context.length
      ? ClaimVerdict.MOSTLY_SUPPORTED
      : ClaimVerdict.SUPPORTED;
  }

  private overall(
    evaluations: ClaimEvaluation[],
    claims: ClaimDocument[],
    manipulation: Array<{ severity: AnalysisSeverity }>,
    missing: Array<{ severity: AnalysisSeverity }>,
  ): {
    verdict: OverallVerdict;
    risk: RiskLevel;
    confidence: number;
    factors: Record<string, number | boolean>;
  } {
    const weighted = evaluations.flatMap((item) => {
      const claim = claims.find((value) => value._id.equals(item.claimId));
      if (
        !claim ||
        ![
          ClaimVerifiability.VERIFIABLE,
          ClaimVerifiability.PARTIALLY_VERIFIABLE,
        ].includes(claim.verifiability)
      )
        return [];
      return [
        {
          item,
          weight:
            claim.importance === ClaimImportance.HIGH
              ? 3
              : claim.importance === ClaimImportance.MEDIUM
                ? 2
                : 1,
        },
      ];
    });
    const total = weighted.reduce((sum, item) => sum + item.weight, 0);
    const scores: Record<ClaimVerdict, number> = {
      [ClaimVerdict.SUPPORTED]: 1,
      [ClaimVerdict.MOSTLY_SUPPORTED]: 0.75,
      [ClaimVerdict.MIXED]: 0.5,
      [ClaimVerdict.MISLEADING]: 0.3,
      [ClaimVerdict.CONTRADICTED]: 0.1,
      [ClaimVerdict.UNSUPPORTED]: 0.2,
      [ClaimVerdict.OUTDATED]: 0.25,
      [ClaimVerdict.INSUFFICIENT_EVIDENCE]: 0.5,
      [ClaimVerdict.UNVERIFIABLE]: 0.5,
    };
    const evidenceScore =
      total === 0
        ? 0.5
        : weighted.reduce(
            (sum, value) => sum + scores[value.item.verdict] * value.weight,
            0,
          ) / total;
    const confidence =
      total === 0
        ? 0
        : this.round(
            weighted.reduce(
              (sum, value) => sum + value.item.confidence * value.weight,
              0,
            ) / total,
          );
    const insufficient = weighted.every((value) =>
      [ClaimVerdict.INSUFFICIENT_EVIDENCE, ClaimVerdict.UNVERIFIABLE].includes(
        value.item.verdict,
      ),
    );
    const highSeverity =
      manipulation.filter((item) => item.severity === AnalysisSeverity.HIGH)
        .length +
      missing.filter((item) => item.severity === AnalysisSeverity.HIGH).length;
    const verdict = insufficient
      ? OverallVerdict.INSUFFICIENT_EVIDENCE
      : evidenceScore >= 0.85
        ? OverallVerdict.SUPPORTED
        : evidenceScore >= 0.65
          ? OverallVerdict.MOSTLY_SUPPORTED
          : evidenceScore >= 0.45
            ? OverallVerdict.MIXED
            : highSeverity
              ? OverallVerdict.MISLEADING
              : evidenceScore >= 0.2
                ? OverallVerdict.UNSUPPORTED
                : OverallVerdict.CONTRADICTED;
    const highImportanceAdverse = weighted.some(
      ({ item, weight }) =>
        weight === 3 &&
        [
          ClaimVerdict.MISLEADING,
          ClaimVerdict.CONTRADICTED,
          ClaimVerdict.UNSUPPORTED,
        ].includes(item.verdict),
    );
    const risk =
      verdict === OverallVerdict.INSUFFICIENT_EVIDENCE
        ? RiskLevel.UNKNOWN
        : highImportanceAdverse && highSeverity >= 2
          ? RiskLevel.CRITICAL
          : highImportanceAdverse || highSeverity >= 2
            ? RiskLevel.HIGH
            : highSeverity === 1 || evidenceScore < 0.5
              ? RiskLevel.MODERATE
              : RiskLevel.LOW;
    return {
      verdict,
      risk,
      confidence,
      factors: {
        weightedEvidenceScore: this.round(evidenceScore),
        weightedClaimConfidence: confidence,
        highSeverityFindingCount: highSeverity,
        highImportanceAdverseClaim: highImportanceAdverse,
        insufficientEvidence: insufficient,
      },
    };
  }

  private validateReferences(
    output: AnalysisOutput,
    claims: ClaimDocument[],
    evidence: EvidenceDocument[],
    content: string,
  ): AnalysisOutput {
    const claimIds = new Set(claims.map((item) => item.id));
    const evidenceById = new Map(evidence.map((item) => [item.id, item]));
    return {
      ...output,
      claims: output.claims
        .filter((item) => claimIds.has(item.claimId))
        .map((item) => ({
          ...item,
          evidence: item.evidence.filter(
            (link) =>
              evidenceById.has(link.evidenceId) &&
              evidenceById.get(link.evidenceId)!.claimId.toString() ===
                item.claimId,
          ),
        })),
      manipulation: output.manipulation.filter(
        (item) =>
          item.endOffset > item.startOffset &&
          item.endOffset <= content.length &&
          content.slice(item.startOffset, item.endOffset) === item.phrase,
      ),
      bias: output.bias,
      missingContext: output.missingContext.map((item) => ({
        ...item,
        evidenceIds: item.evidenceIds.filter((id) => evidenceById.has(id)),
      })),
    };
  }

  private async applyRelationships(
    evidence: EvidenceDocument[],
    output: AnalysisOutput,
  ): Promise<void> {
    const relationships = new Map<string, EvidenceRelationship>();
    for (const claim of output.claims)
      for (const item of claim.evidence)
        relationships.set(item.evidenceId, item.relationship);
    await Promise.all(
      evidence.map((item) =>
        this.evidenceModel
          .updateOne(
            { _id: item._id },
            {
              $set: {
                relationship:
                  relationships.get(item.id) ??
                  EvidenceRelationship.INCONCLUSIVE,
              },
            },
          )
          .exec(),
      ),
    );
  }

  private sourceAssessments(evidence: EvidenceDocument[]) {
    const domains = new Map<string, EvidenceDocument[]>();
    for (const item of evidence)
      domains.set(item.domain, [...(domains.get(item.domain) ?? []), item]);
    return [...domains.entries()].map(([domain, items]) => {
      const accessible = items.filter(
        (item) => item.accessStatus === EvidenceAccessStatus.AVAILABLE,
      );
      const level = accessible.some(
        (item) => item.authority === EvidenceAuthority.HIGH,
      )
        ? 'HIGH'
        : accessible.some(
              (item) => item.authority === EvidenceAuthority.MODERATE,
            )
          ? 'MODERATE'
          : accessible.length
            ? 'UNKNOWN'
            : 'INSUFFICIENT_INFORMATION';
      return {
        domain,
        credibilityLevel: level,
        explanation:
          level === 'UNKNOWN'
            ? 'The source is accessible, but the available metadata is insufficient for a stronger credibility classification.'
            : level === 'INSUFFICIENT_INFORMATION'
              ? 'The source content was unavailable for assessment.'
              : 'The category reflects domain authority signals and accessible source metadata, not permanent ideological labeling.',
        evidenceIds: items.map((item) => item._id),
        limitations: [
          'This assessment applies to the retrieved source material and available metadata.',
        ],
      };
    });
  }

  private spanConfidence(
    content: string,
    phrase: string,
    start: number,
    end: number,
  ): number {
    return content.slice(start, end) === phrase ? 0.9 : 0;
  }

  private textEvidenceConfidence(content: string, evidence: string[]): number {
    if (!evidence.length) return 0.25;
    const matches = evidence.filter((phrase) =>
      content.includes(phrase),
    ).length;
    return this.round(0.4 + 0.5 * (matches / evidence.length));
  }

  private contextConfidence(
    ids: string[],
    evidence: EvidenceDocument[],
  ): number {
    if (!ids.length) return 0.3;
    const known = new Set(evidence.map((item) => item.id));
    return this.round(
      0.4 + 0.5 * (ids.filter((id) => known.has(id)).length / ids.length),
    );
  }

  private analysisLimitations(evidence: EvidenceDocument[]): string[] {
    const limitations = [
      'AI-assisted text classifications are model inferences and not verified facts.',
      'Confidence is calculated from documented evidence factors, not supplied by the model.',
    ];
    if (
      evidence.some(
        (item) =>
          ![
            EvidenceAccessStatus.AVAILABLE,
            EvidenceAccessStatus.PARTIALLY_AVAILABLE,
          ].includes(item.accessStatus),
      )
    )
      limitations.push(
        'One or more discovered sources could not be retrieved.',
      );
    if (
      evidence.some(
        (item) =>
          item.accessStatus === EvidenceAccessStatus.PARTIALLY_AVAILABLE,
      )
    )
      limitations.push(
        'Partially extracted sources contributed less confidence than fully retrieved sources.',
      );
    return limitations;
  }

  private clamp(value: number): number {
    return Math.min(1, Math.max(0, value));
  }

  private round(value: number): number {
    return Math.round(this.clamp(value) * 1000) / 1000;
  }

  private joiSchema(): Joi.ObjectSchema<AnalysisOutput> {
    const strings = Joi.array()
      .items(Joi.string().max(1000))
      .max(20)
      .required();
    return Joi.object<AnalysisOutput>({
      claims: Joi.array()
        .items(
          Joi.object({
            claimId: Joi.string().hex().length(24).required(),
            evidence: Joi.array()
              .items(
                Joi.object({
                  evidenceId: Joi.string().hex().length(24).required(),
                  relationship: Joi.string()
                    .valid(...Object.values(EvidenceRelationship))
                    .required(),
                }),
              )
              .max(50)
              .required(),
            explanation: Joi.string().max(3000).required(),
            evidenceSummary: Joi.string().max(3000).required(),
            uncertainties: strings,
            limitations: strings,
          }),
        )
        .max(50)
        .required(),
      manipulation: Joi.array()
        .items(
          Joi.object({
            category: Joi.string()
              .valid(...Object.values(ManipulationCategory))
              .required(),
            severity: Joi.string()
              .valid(...Object.values(AnalysisSeverity))
              .required(),
            phrase: Joi.string().max(500).required(),
            startOffset: Joi.number().integer().min(0).required(),
            endOffset: Joi.number().integer().min(1).required(),
            explanation: Joi.string().max(2000).required(),
            limitations: strings,
          }),
        )
        .max(30)
        .required(),
      bias: Joi.array()
        .items(
          Joi.object({
            metric: Joi.string()
              .valid(...Object.values(BiasMetricName))
              .required(),
            score: Joi.number().min(0).max(1).required(),
            label: Joi.string().max(100).required(),
            explanation: Joi.string().max(2000).required(),
            textEvidence: Joi.array()
              .items(Joi.string().max(500))
              .max(20)
              .required(),
            limitations: strings,
          }),
        )
        .length(Object.values(BiasMetricName).length)
        .unique('metric')
        .required(),
      missingContext: Joi.array()
        .items(
          Joi.object({
            type: Joi.string()
              .valid(...Object.values(MissingContextType))
              .required(),
            severity: Joi.string()
              .valid(...Object.values(AnalysisSeverity))
              .required(),
            omittedContext: Joi.string().max(2000).required(),
            whyItMatters: Joi.string().max(2000).required(),
            correctedContext: Joi.string().max(3000).required(),
            evidenceIds: Joi.array()
              .items(Joi.string().hex().length(24))
              .max(50)
              .required(),
            limitations: strings,
          }),
        )
        .max(30)
        .required(),
    }).required();
  }

  private jsonSchema(): Record<string, unknown> {
    const stringArray = { type: 'array', items: { type: 'string' } };
    return {
      type: 'object',
      additionalProperties: false,
      required: ['claims', 'manipulation', 'bias', 'missingContext'],
      properties: {
        claims: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'claimId',
              'evidence',
              'explanation',
              'evidenceSummary',
              'uncertainties',
              'limitations',
            ],
            properties: {
              claimId: { type: 'string' },
              evidence: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['evidenceId', 'relationship'],
                  properties: {
                    evidenceId: { type: 'string' },
                    relationship: {
                      type: 'string',
                      enum: Object.values(EvidenceRelationship),
                    },
                  },
                },
              },
              explanation: { type: 'string' },
              evidenceSummary: { type: 'string' },
              uncertainties: stringArray,
              limitations: stringArray,
            },
          },
        },
        manipulation: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'category',
              'severity',
              'phrase',
              'startOffset',
              'endOffset',
              'explanation',
              'limitations',
            ],
            properties: {
              category: {
                type: 'string',
                enum: Object.values(ManipulationCategory),
              },
              severity: {
                type: 'string',
                enum: Object.values(AnalysisSeverity),
              },
              phrase: { type: 'string' },
              startOffset: { type: 'integer' },
              endOffset: { type: 'integer' },
              explanation: { type: 'string' },
              limitations: stringArray,
            },
          },
        },
        bias: {
          type: 'array',
          minItems: Object.values(BiasMetricName).length,
          maxItems: Object.values(BiasMetricName).length,
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'metric',
              'score',
              'label',
              'explanation',
              'textEvidence',
              'limitations',
            ],
            properties: {
              metric: { type: 'string', enum: Object.values(BiasMetricName) },
              score: { type: 'number', minimum: 0, maximum: 1 },
              label: { type: 'string' },
              explanation: { type: 'string' },
              textEvidence: stringArray,
              limitations: stringArray,
            },
          },
        },
        missingContext: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'type',
              'severity',
              'omittedContext',
              'whyItMatters',
              'correctedContext',
              'evidenceIds',
              'limitations',
            ],
            properties: {
              type: {
                type: 'string',
                enum: Object.values(MissingContextType),
              },
              severity: {
                type: 'string',
                enum: Object.values(AnalysisSeverity),
              },
              omittedContext: { type: 'string' },
              whyItMatters: { type: 'string' },
              correctedContext: { type: 'string' },
              evidenceIds: stringArray,
              limitations: stringArray,
            },
          },
        },
      },
    };
  }
}
