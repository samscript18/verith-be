import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ConflictException,
  NotFoundException,
  ValidationException,
} from '../../../core/exceptions';
import { CompetencyEvidenceSource } from '../../mil/enums/competency-level.enum';
import { CompetencyService } from '../../mil/services/competency.service';
import { RewardTransactionType } from '../../gamification/enums/gamification.enum';
import { GamificationService } from '../../gamification/services/gamification.service';
import type {
  CompleteMissionScenarioDto,
  SubmitMissionAssessmentDto,
} from '../dto/mission.dto';
import {
  AssessmentPhase,
  MissionParticipantStatus,
  MissionStatus,
} from '../enums/mission.enum';
import { MissionAssessmentAttempt } from '../schemas/mission-assessment-attempt.schema';
import {
  MissionAssessment,
  type MissionAssessmentDocument,
} from '../schemas/mission-assessment.schema';
import { MissionParticipant } from '../schemas/mission-participant.schema';
import { Mission } from '../schemas/mission.schema';
import { Lesson } from '../../learning/schemas/lesson.schema';
import { LessonProgress } from '../../learning/schemas/lesson-progress.schema';
import { LessonProgressStatus } from '../../learning/enums/learning.enum';
import { Challenge } from '../../challenges/schemas/challenge.schema';
import { ChallengeAttempt } from '../../challenges/schemas/challenge-attempt.schema';

@Injectable()
export class MissionsService {
  constructor(
    @InjectModel(Mission.name) private readonly missions: Model<Mission>,
    @InjectModel(MissionAssessment.name)
    private readonly assessments: Model<MissionAssessment>,
    @InjectModel(MissionParticipant.name)
    private readonly participants: Model<MissionParticipant>,
    @InjectModel(MissionAssessmentAttempt.name)
    private readonly attempts: Model<MissionAssessmentAttempt>,
    private readonly competencies: CompetencyService,
    private readonly gamification: GamificationService,
    @InjectModel(Lesson.name) private readonly lessons: Model<Lesson>,
    @InjectModel(LessonProgress.name)
    private readonly lessonProgress: Model<LessonProgress>,
    @InjectModel(Challenge.name) private readonly challenges: Model<Challenge>,
    @InjectModel(ChallengeAttempt.name)
    private readonly challengeAttempts: Model<ChallengeAttempt>,
  ) {}

  async list(userId: string) {
    const now = new Date();
    const records = await this.missions
      .find({
        status: MissionStatus.PUBLISHED,
        startsAt: { $lte: now },
        endsAt: { $gt: now },
      })
      .sort({ startsAt: -1 })
      .lean()
      .exec();
    const participations = await this.participants
      .find({
        userId: new Types.ObjectId(userId),
        missionId: { $in: records.map((item) => item._id) },
      })
      .lean()
      .exec();
    const byMission = new Map(
      participations.map((item) => [item.missionId.toString(), item]),
    );
    return Promise.all(
      records.map((mission) =>
        this.publicMission(
          mission,
          userId,
          byMission.get(mission._id.toString()),
        ),
      ),
    );
  }

  async get(userId: string, slug: string) {
    const mission = await this.available(slug);
    const participation = await this.participants
      .findOne({ missionId: mission._id, userId: new Types.ObjectId(userId) })
      .lean()
      .exec();
    return this.publicMission(mission, userId, participation);
  }

  async join(userId: string, slug: string, consent: boolean) {
    const mission = await this.available(slug);
    if (mission.consentRequired && !consent)
      throw new ValidationException('Consent is required to join this mission');
    return this.participants
      .findOneAndUpdate(
        { missionId: mission._id, userId: new Types.ObjectId(userId) },
        {
          $setOnInsert: {
            missionId: mission._id,
            userId: new Types.ObjectId(userId),
            status: MissionParticipantStatus.JOINED,
            ...(consent ? { consentedAt: new Date() } : {}),
          },
        },
        { upsert: true, returnDocument: 'after', runValidators: true },
      )
      .lean()
      .exec();
  }

  async assessment(userId: string, slug: string, phase: AssessmentPhase) {
    const { mission, participant } = await this.joined(userId, slug);
    if (
      phase === AssessmentPhase.FOLLOW_UP &&
      participant.baselineScore === undefined
    ) {
      throw new ConflictException(
        'Complete the baseline assessment first',
        'MISSION_BASELINE_REQUIRED',
      );
    }
    await this.assertFollowUpReady(mission, participant, phase);
    const assessment = await this.assessments
      .findOne({ missionId: mission._id, phase })
      .sort({ version: -1 })
      .exec();
    if (!assessment) throw this.notFound('MISSION_ASSESSMENT_NOT_FOUND');
    const attemptsUsed = await this.attempts.countDocuments({
      userId: new Types.ObjectId(userId),
      assessmentId: assessment._id,
    });
    return {
      id: assessment.id,
      phase,
      version: assessment.version,
      passingScore: assessment.passingScore,
      maxAttempts: assessment.maxAttempts,
      attemptsUsed,
      questions: assessment.questions.map((question) => ({
        id: question.id,
        type: question.type,
        prompt: question.prompt,
        competency: question.competency,
        options: question.options,
      })),
    };
  }

  async submit(
    userId: string,
    slug: string,
    phase: AssessmentPhase,
    dto: SubmitMissionAssessmentDto,
  ) {
    const { mission, participant } = await this.joined(userId, slug);
    if (
      phase === AssessmentPhase.FOLLOW_UP &&
      participant.baselineScore === undefined
    )
      throw new ConflictException(
        'Complete the baseline assessment first',
        'MISSION_BASELINE_REQUIRED',
      );
    await this.assertFollowUpReady(mission, participant, phase);
    const assessment = await this.assessments
      .findOne({ missionId: mission._id, phase })
      .sort({ version: -1 })
      .select('+questions.correctOptionIds +questions.explanation')
      .exec();
    if (!assessment) throw this.notFound('MISSION_ASSESSMENT_NOT_FOUND');
    const prior = await this.attempts.countDocuments({
      userId: new Types.ObjectId(userId),
      assessmentId: assessment._id,
    });
    if (prior >= assessment.maxAttempts)
      throw new ConflictException(
        'The assessment attempt limit has been reached',
        'MISSION_ASSESSMENT_LIMIT_REACHED',
      );
    const results = this.score(assessment, dto);
    const score =
      Math.round(
        (results.reduce((sum, item) => sum + (item.correct ? 1 : 0), 0) /
          results.length) *
          10000,
      ) / 100;
    const competencyScores = [
      ...new Set(assessment.questions.map((item) => item.competency)),
    ].map((competency) => {
      const matching = results.filter((item) => item.competency === competency);
      return {
        competency,
        score: matching.filter((item) => item.correct).length / matching.length,
      };
    });
    const attempt = await this.attempts.create({
      missionId: mission._id,
      assessmentId: assessment._id,
      userId: new Types.ObjectId(userId),
      phase,
      attemptNumber: prior + 1,
      answers: dto.answers,
      score,
      passed: score >= assessment.passingScore,
      competencyScores,
    });
    const scoreField =
      phase === AssessmentPhase.BASELINE ? 'baselineScore' : 'followUpScore';
    participant.set(scoreField, score);
    participant.status =
      phase === AssessmentPhase.FOLLOW_UP
        ? MissionParticipantStatus.COMPLETED
        : MissionParticipantStatus.IN_PROGRESS;
    if (phase === AssessmentPhase.FOLLOW_UP)
      participant.completedAt = new Date();
    await participant.save();
    await this.competencies.recordBatch(
      userId,
      competencyScores.map((item) => ({
        competency: item.competency,
        sourceType:
          phase === AssessmentPhase.BASELINE
            ? CompetencyEvidenceSource.BASELINE_ASSESSMENT
            : CompetencyEvidenceSource.FOLLOW_UP_ASSESSMENT,
        sourceActivityId: attempt.id,
        score: item.score,
        occurredAt: new Date(),
        metadata: { missionId: mission.id, assessmentId: assessment.id },
      })),
    );
    let rewardState: 'NOT_APPLICABLE' | 'AWARDED' | 'ALREADY_AWARDED' =
      'NOT_APPLICABLE';
    if (phase === AssessmentPhase.FOLLOW_UP) {
      const reward = await this.gamification.award(userId, {
        type: RewardTransactionType.MISSION_COMPLETED,
        idempotencyReference: `mission:${mission.id}:completed`,
        xp: Number(mission.rewardPolicy.xp ?? 0),
        truthPoints: Number(mission.rewardPolicy.truthPoints ?? 0),
        metadata: { missionId: mission.id, assessmentId: assessment.id },
      });
      rewardState = reward.awarded ? 'AWARDED' : 'ALREADY_AWARDED';
    }
    return {
      id: attempt.id,
      phase,
      attemptNumber: attempt.attemptNumber,
      score,
      passed: attempt.passed,
      competencyScores,
      rewardState,
      results: results.map((item) => ({
        questionId: item.questionId,
        correct: item.correct,
        explanation: item.explanation,
      })),
    };
  }

  async completeScenario(
    userId: string,
    slug: string,
    dto: CompleteMissionScenarioDto,
  ) {
    const { mission, participant } = await this.joined(userId, slug);
    if (!dto.reflection.trim())
      throw new ValidationException(
        'Add a short reflection before completing the scenario',
      );
    if (!mission.scenarios.some((item) => item.id === dto.scenarioId))
      throw new ValidationException('The mission scenario does not exist');
    participant.completedScenarioIds = [
      ...new Set([...participant.completedScenarioIds, dto.scenarioId]),
    ];
    const priorResponses = participant.scenarioResponses ?? [];
    participant.scenarioResponses = [
      ...priorResponses.filter((item) => item.scenarioId !== dto.scenarioId),
      {
        scenarioId: dto.scenarioId,
        reflection: dto.reflection.trim(),
        completedAt: new Date(),
      },
    ];
    participant.status = MissionParticipantStatus.IN_PROGRESS;
    await participant.save();
    return participant;
  }

  async impact(userId: string, slug: string) {
    const { participant } = await this.joined(userId, slug);
    return {
      baselineScore: participant.baselineScore ?? null,
      followUpScore: participant.followUpScore ?? null,
      change:
        participant.baselineScore !== undefined &&
        participant.followUpScore !== undefined
          ? participant.followUpScore - participant.baselineScore
          : null,
      completedScenarios: participant.completedScenarioIds.length,
      status: participant.status,
      limitation:
        'This comparison describes performance on one mission assessment. It does not establish broad causal impact or overall mastery.',
    };
  }

  private score(
    assessment: MissionAssessmentDocument,
    dto: SubmitMissionAssessmentDto,
  ) {
    const answers = new Map(
      dto.answers.map((item) => [
        item.questionId,
        [...new Set(item.selectedOptionIds)].sort(),
      ]),
    );
    if (
      answers.size !== assessment.questions.length ||
      assessment.questions.some((item) => !answers.has(item.id))
    )
      throw new ValidationException(
        'Answer every assessment question exactly once',
      );
    return assessment.questions.map((question) => {
      const selected = answers.get(question.id) ?? [];
      const allowed = new Set(question.options.map((item) => item.id));
      if (selected.some((item) => !allowed.has(item)))
        throw new ValidationException(
          'An assessment response contains an unknown option',
        );
      const correct = [...question.correctOptionIds].sort();
      return {
        questionId: question.id,
        competency: question.competency,
        correct:
          selected.length === correct.length &&
          selected.every((item, index) => item === correct[index]),
        explanation: question.explanation,
      };
    });
  }

  private async available(slug: string) {
    const now = new Date();
    const mission = await this.missions
      .findOne({
        slug,
        status: MissionStatus.PUBLISHED,
        startsAt: { $lte: now },
        endsAt: { $gt: now },
      })
      .exec();
    if (!mission) throw this.notFound('MISSION_NOT_FOUND');
    return mission;
  }

  private async joined(userId: string, slug: string) {
    const mission = await this.available(slug);
    const participant = await this.participants
      .findOne({ missionId: mission._id, userId: new Types.ObjectId(userId) })
      .select('+scenarioResponses')
      .exec();
    if (!participant)
      throw new ConflictException(
        'Join this mission before continuing',
        'MISSION_JOIN_REQUIRED',
      );
    return { mission, participant };
  }

  private async assertFollowUpReady(
    mission: Mission,
    participant: MissionParticipant,
    phase: AssessmentPhase,
  ): Promise<void> {
    if (phase !== AssessmentPhase.FOLLOW_UP) return;
    const required = Number(
      mission.completionCriteria.requiredScenarios ?? mission.scenarios.length,
    );
    if (participant.completedScenarioIds.length < required) {
      throw new ConflictException(
        'Complete the required mission scenarios before the follow-up assessment',
        'MISSION_SCENARIOS_REQUIRED',
      );
    }
    if (mission.completionCriteria.linkedLearningRequired === true) {
      const [completedLessons, passedChallenges] = await Promise.all([
        this.lessonProgress.countDocuments({
          userId: participant.userId,
          lessonId: { $in: mission.lessonIds },
          status: LessonProgressStatus.COMPLETED,
        }),
        this.challengeAttempts.distinct('challengeId', {
          userId: participant.userId,
          challengeId: { $in: mission.challengeIds },
          passed: true,
        }),
      ]);
      if (
        completedLessons < mission.lessonIds.length ||
        passedChallenges.length < mission.challengeIds.length
      )
        throw new ConflictException(
          'Complete the linked lesson and practice challenge before the follow-up assessment',
          'MISSION_LEARNING_REQUIRED',
        );
    }
  }

  private async publicMission(
    mission: Mission,
    userId: string,
    participation?: MissionParticipant | null,
  ) {
    const userObjectId = new Types.ObjectId(userId);
    const [lessons, challenges, completedLessons, passedChallenges] =
      await Promise.all([
        this.lessons
          .find({ _id: { $in: mission.lessonIds } })
          .select('title slug summary estimatedDuration')
          .lean()
          .exec(),
        this.challenges
          .find({ _id: { $in: mission.challengeIds } })
          .select('title slug scenario difficulty')
          .lean()
          .exec(),
        this.lessonProgress
          .find({
            userId: userObjectId,
            lessonId: { $in: mission.lessonIds },
            status: LessonProgressStatus.COMPLETED,
          })
          .distinct('lessonId')
          .exec(),
        this.challengeAttempts
          .find({
            userId: userObjectId,
            challengeId: { $in: mission.challengeIds },
            passed: true,
          })
          .distinct('challengeId')
          .exec(),
      ]);
    const completedLessonIds = new Set(completedLessons.map(String));
    const passedChallengeIds = new Set(passedChallenges.map(String));
    return {
      id: String((mission as Mission & { _id: Types.ObjectId })._id),
      title: mission.title,
      slug: mission.slug,
      summary: mission.summary,
      topic: mission.topic,
      audience: mission.audience,
      difficulty: mission.difficulty,
      startsAt: mission.startsAt,
      endsAt: mission.endsAt,
      scenarios: mission.scenarios,
      lessonIds: mission.lessonIds,
      challengeIds: mission.challengeIds,
      learning: {
        required: mission.completionCriteria.linkedLearningRequired === true,
        lessons: lessons.map((item) => ({
          id: item._id.toString(),
          title: item.title,
          slug: item.slug,
          summary: item.summary,
          estimatedDuration: item.estimatedDuration,
          completed: completedLessonIds.has(item._id.toString()),
        })),
        challenges: challenges.map((item) => ({
          id: item._id.toString(),
          title: item.title,
          slug: item.slug,
          scenario: item.scenario,
          difficulty: item.difficulty,
          completed: passedChallengeIds.has(item._id.toString()),
        })),
      },
      organization: mission.organization,
      privacyPolicy: mission.privacyPolicy,
      consentRequired: mission.consentRequired,
      participation: participation
        ? {
            status: participation.status,
            baselineScore: participation.baselineScore ?? null,
            followUpScore: participation.followUpScore ?? null,
            completedScenarioIds: participation.completedScenarioIds,
          }
        : null,
    };
  }

  private notFound(code: string) {
    return new NotFoundException(
      'The requested mission record could not be found',
      code,
    );
  }
}
