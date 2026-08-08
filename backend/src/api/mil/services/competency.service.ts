import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MediaLiteracyCompetency } from '../../verifications/enums/guided-investigation.enum';
import {
  CompetencyEvidenceSource,
  CompetencyLevel,
} from '../enums/competency-level.enum';
import { CompetencyEvidence } from '../schemas/competency-evidence.schema';
import { MilGrowthProfile } from '../schemas/mil-growth-profile.schema';

export interface RecordCompetencyEvidenceInput {
  competency: MediaLiteracyCompetency;
  sourceType: CompetencyEvidenceSource;
  sourceActivityId: string;
  score?: number;
  occurredAt: Date;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class CompetencyService {
  static readonly RULE_VERSION = 'mil-competency.v1';

  constructor(
    @InjectModel(CompetencyEvidence.name)
    private readonly evidence: Model<CompetencyEvidence>,
    @InjectModel(MilGrowthProfile.name)
    private readonly profiles: Model<MilGrowthProfile>,
  ) {}

  async recordBatch(
    userId: string,
    inputs: RecordCompetencyEvidenceInput[],
  ): Promise<void> {
    if (!inputs.length) return;
    const userObjectId = new Types.ObjectId(userId);
    await this.evidence.bulkWrite(
      inputs.map((input) => ({
        updateOne: {
          filter: {
            userId: userObjectId,
            competency: input.competency,
            sourceType: input.sourceType,
            sourceActivityId: input.sourceActivityId,
          },
          update: {
            $setOnInsert: {
              userId: userObjectId,
              competency: input.competency,
              sourceType: input.sourceType,
              sourceActivityId: input.sourceActivityId,
              ...(input.score !== undefined ? { score: input.score } : {}),
              scoringRuleVersion: CompetencyService.RULE_VERSION,
              metadata: input.metadata ?? {},
              occurredAt: input.occurredAt,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
    await this.rebuild(userId);
  }

  async profile(userId: string): Promise<Record<string, unknown>> {
    const profile = await this.rebuild(userId);
    const competencies = Object.values(MediaLiteracyCompetency).map(
      (competency) => {
        const existing = profile.competencies.find(
          (item) => item.competency === competency,
        );
        return (
          existing ?? {
            competency,
            level: CompetencyLevel.BEGINNING,
            evidenceCount: 0,
            scoredEvidenceCount: 0,
            notEnoughEvidence: true,
            lastEvaluatedAt: profile.lastEvaluatedAt ?? profile.createdAt,
            scoreHistory: [],
          }
        );
      },
    );
    return {
      id: profile.id,
      scoringRuleVersion: profile.scoringRuleVersion,
      lastEvaluatedAt: profile.lastEvaluatedAt ?? null,
      evidenceBasedCompetencies: profile.competencies.length,
      competencies,
      recommendedNextActivity: this.recommendation(competencies),
    };
  }

  async evidenceFor(userId: string, competency?: MediaLiteracyCompetency) {
    return this.evidence
      .find({
        userId: new Types.ObjectId(userId),
        ...(competency ? { competency } : {}),
      })
      .select('-userId -metadata')
      .sort({ occurredAt: -1 })
      .limit(100)
      .lean()
      .exec();
  }

  private async rebuild(userId: string) {
    const userObjectId = new Types.ObjectId(userId);
    const records = await this.evidence
      .find({ userId: userObjectId })
      .sort({ occurredAt: 1 })
      .lean()
      .exec();
    const now = new Date();
    const competencies = Object.values(MediaLiteracyCompetency).flatMap(
      (competency) => {
        const items = records.filter((item) => item.competency === competency);
        if (!items.length) return [];
        const scored = items.filter(
          (item): item is typeof item & { score: number } =>
            typeof item.score === 'number',
        );
        const averageScore = scored.length
          ? scored.reduce((sum, item) => sum + item.score, 0) / scored.length
          : undefined;
        return [
          {
            competency,
            level: this.level(scored.length, averageScore),
            evidenceCount: items.length,
            scoredEvidenceCount: scored.length,
            ...(averageScore !== undefined ? { averageScore } : {}),
            notEnoughEvidence: scored.length < 2,
            lastEvaluatedAt: now,
            scoreHistory: scored.slice(-20).map((item) => ({
              score: item.score,
              sourceType: item.sourceType,
              sourceActivityId: item.sourceActivityId,
              occurredAt: item.occurredAt,
            })),
          },
        ];
      },
    );
    const profile = await this.profiles
      .findOneAndUpdate(
        { userId: userObjectId },
        {
          $set: {
            scoringRuleVersion: CompetencyService.RULE_VERSION,
            competencies,
            lastEvaluatedAt: now,
          },
          $setOnInsert: { userId: userObjectId },
        },
        { upsert: true, returnDocument: 'after', runValidators: true },
      )
      .exec();
    if (!profile)
      throw new Error('Media literacy profile could not be evaluated');
    return profile;
  }

  private level(count: number, average?: number): CompetencyLevel {
    if (average === undefined || count < 2 || average < 0.5)
      return CompetencyLevel.BEGINNING;
    if (count >= 8 && average >= 0.85) return CompetencyLevel.ADVANCED;
    if (count >= 4 && average >= 0.7) return CompetencyLevel.PROFICIENT;
    return CompetencyLevel.DEVELOPING;
  }

  private recommendation(
    competencies: Array<{
      competency: MediaLiteracyCompetency;
      scoredEvidenceCount: number;
      averageScore?: number;
    }>,
  ) {
    const target = [...competencies].sort(
      (left, right) =>
        left.scoredEvidenceCount - right.scoredEvidenceCount ||
        (left.averageScore ?? 0) - (right.averageScore ?? 0),
    )[0];
    return {
      competency:
        target?.competency ?? MediaLiteracyCompetency.EVIDENCE_EVALUATION,
      title: 'Complete a guided investigation',
      description:
        'Record your reasoning before opening the report so Verith can add real scored evidence to this profile.',
      href: '/app/verify',
    };
  }
}
