import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditService } from '../../admin/services/audit.service';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface';
import {
  ConflictException,
  NotFoundException,
  ValidationException,
} from '../../../core/exceptions';
import { GamificationService } from '../../gamification/services/gamification.service';
import { RewardTransactionType } from '../../gamification/enums/gamification.enum';
import { QuizQuestionType } from '../../quizzes/enums/quiz.enum';
import type {
  CreateChallengeDto,
  ChallengeCatalogQueryDto,
  ChallengeAdminQueryDto,
  SubmitChallengeDto,
  UpdateChallengeDto,
} from '../dto/challenge.dto';
import { searchPattern } from '../../../shared/utils/search-query';
import { ChallengeStatus } from '../enums/challenge.enum';
import { ChallengeAttempt } from '../schemas/challenge-attempt.schema';
import { Challenge, type ChallengeDocument } from '../schemas/challenge.schema';

@Injectable()
export class ChallengesService {
  constructor(
    @InjectModel(Challenge.name) private readonly challenges: Model<Challenge>,
    @InjectModel(ChallengeAttempt.name)
    private readonly attempts: Model<ChallengeAttempt>,
    private readonly gamification: GamificationService,
    private readonly audit: AuditService,
  ) {}

  async listAdmin(query: ChallengeAdminQueryDto) {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.difficulty) filter.difficulty = query.difficulty;
    if (query.tag) filter.tags = query.tag.trim().toLowerCase();
    if (query.search) {
      const pattern = searchPattern(query.search);
      filter.$or = [
        { title: pattern },
        { slug: pattern },
        { scenario: pattern },
      ];
    }
    if (query.cursor) filter._id = { $lt: new Types.ObjectId(query.cursor) };
    const records = await this.challenges
      .find(filter)
      .sort({ _id: -1 })
      .limit(query.limit + 1)
      .lean()
      .exec();
    const hasNextPage = records.length > query.limit;
    const items = records.slice(0, query.limit);
    return {
      items,
      pagination: {
        nextCursor: hasNextPage ? items.at(-1)?._id.toString() : null,
        previousCursor: null,
        hasNextPage,
        limit: query.limit,
      },
    };
  }

  async getAdmin(id: string) {
    const challenge = await this.challenges.findById(id).exec();
    if (!challenge) throw this.notFound();
    return {
      ...this.adminProjection(challenge),
      questions: challenge.questions,
      rewardPolicy: challenge.rewardPolicy,
    };
  }

  async update(userId: string, id: string, dto: UpdateChallengeDto) {
    const challenge = await this.challenges.findById(id).exec();
    if (!challenge) throw this.notFound();
    const next = {
      title: dto.title ?? challenge.title,
      slug: dto.slug ?? challenge.slug,
      scenario: dto.scenario ?? challenge.scenario,
      content: dto.content ?? challenge.content,
      tags: dto.tags ?? challenge.tags,
      ...(dto.mediaAssetId || challenge.mediaAssetId
        ? {
            mediaAssetId:
              dto.mediaAssetId ?? challenge.mediaAssetId!.toString(),
          }
        : {}),
      questions: dto.questions ?? challenge.questions,
      difficulty: dto.difficulty ?? challenge.difficulty,
      rewardPolicy: dto.rewardPolicy ?? challenge.rewardPolicy,
      maxAttempts: dto.maxAttempts ?? challenge.maxAttempts,
      passingScore: dto.passingScore ?? challenge.passingScore,
      publishAt: dto.publishAt ?? challenge.publishAt.toISOString(),
      expiresAt: dto.expiresAt ?? challenge.expiresAt.toISOString(),
    };
    this.validate(next);
    const publishAt = new Date(next.publishAt);
    const expiresAt = new Date(next.expiresAt);
    if (expiresAt <= publishAt)
      throw new ValidationException('Challenge expiration must follow publish');
    challenge.set({
      ...dto,
      ...(dto.tags ? { tags: this.tags(dto.tags) } : {}),
      ...(dto.mediaAssetId
        ? { mediaAssetId: new Types.ObjectId(dto.mediaAssetId) }
        : {}),
      publishAt,
      expiresAt,
      updatedBy: new Types.ObjectId(userId),
    });
    await challenge.save();
    return this.getAdmin(id);
  }

  async archive(
    actor: AuthUser,
    id: string,
    reason: string,
    requestId: string,
  ) {
    const challenge = await this.challenges.findById(id).exec();
    if (!challenge) throw this.notFound();
    const before = challenge.status;
    challenge.status = ChallengeStatus.ARCHIVED;
    await challenge.save();
    await this.audit.record({
      actor,
      action: 'CHALLENGE_ARCHIVED',
      resourceType: 'CHALLENGE',
      resourceId: id,
      requestId,
      reason,
      safeBefore: { status: before },
      safeAfter: { status: challenge.status },
    });
    return this.adminProjection(challenge);
  }

  async create(userId: string, dto: CreateChallengeDto) {
    this.validate(dto);
    const publishAt = new Date(dto.publishAt);
    const expiresAt = new Date(dto.expiresAt);
    if (expiresAt <= publishAt)
      throw new ValidationException('Challenge expiration must follow publish');
    try {
      return await this.challenges.create({
        ...dto,
        tags: this.tags(dto.tags ?? []),
        ...(dto.mediaAssetId
          ? { mediaAssetId: new Types.ObjectId(dto.mediaAssetId) }
          : {}),
        publishAt,
        expiresAt,
        status:
          publishAt > new Date()
            ? ChallengeStatus.SCHEDULED
            : ChallengeStatus.DRAFT,
        createdBy: new Types.ObjectId(userId),
      });
    } catch (error) {
      if (this.isDuplicate(error))
        throw new ConflictException(
          'The challenge slug already exists',
          'CHALLENGE_SLUG_CONFLICT',
        );
      throw error;
    }
  }

  async setStatus(id: string, status: ChallengeStatus) {
    const challenge = await this.challenges.findById(id).exec();
    if (!challenge) throw this.notFound();
    if (
      status === ChallengeStatus.PUBLISHED &&
      (challenge.publishAt > new Date() || challenge.expiresAt <= new Date())
    )
      throw new ConflictException(
        'The challenge is outside its publication window',
        'CHALLENGE_PUBLISH_WINDOW_INVALID',
      );
    challenge.status = status;
    await challenge.save();
    return this.adminProjection(challenge);
  }

  async listAvailable(query: ChallengeCatalogQueryDto) {
    await this.refreshStatuses();
    const filter: Record<string, unknown> = {
      ...this.availableQuery(),
      ...(query.cursor
        ? { _id: { $lt: new Types.ObjectId(query.cursor) } }
        : {}),
    };
    if (query.difficulty) filter.difficulty = query.difficulty;
    if (query.tag) filter.tags = query.tag.trim().toLowerCase();
    if (query.search) {
      const pattern = searchPattern(query.search);
      filter.$or = [
        { title: pattern },
        { scenario: pattern },
        { tags: pattern },
      ];
    }
    const records = await this.challenges
      .find(filter)
      .select('-questions.correctOptionIds -questions.explanation -createdBy')
      .sort({ _id: -1 })
      .limit(query.limit + 1)
      .lean()
      .exec();
    const hasNextPage = records.length > query.limit;
    const items = records.slice(0, query.limit);
    return {
      items,
      pagination: {
        nextCursor: hasNextPage ? items.at(-1)?._id.toString() : null,
        previousCursor: null,
        hasNextPage,
        limit: query.limit,
      },
    };
  }

  async today() {
    await this.refreshStatuses();
    const challenge = await this.challenges
      .findOne(this.availableQuery())
      .sort({ publishAt: -1 })
      .exec();
    if (!challenge) throw this.notFound();
    return this.publicProjection(challenge);
  }

  async getBySlug(slug: string) {
    await this.refreshStatuses();
    const challenge = await this.challenges
      .findOne({ ...this.availableQuery(), slug })
      .exec();
    if (!challenge) throw this.notFound();
    return this.publicProjection(challenge);
  }

  async submit(userId: string, id: string, dto: SubmitChallengeDto) {
    await this.refreshStatuses();
    const challenge = await this.challenges
      .findOne({ ...this.availableQuery(), _id: id })
      .exec();
    if (!challenge) throw this.notFound();
    const userObjectId = new Types.ObjectId(userId);
    const priorAttempts = await this.attempts.countDocuments({
      userId: userObjectId,
      challengeId: challenge._id,
    });
    if (priorAttempts >= challenge.maxAttempts)
      throw new ConflictException(
        'The maximum number of challenge attempts has been reached',
        'CHALLENGE_ATTEMPT_LIMIT_REACHED',
      );
    const answers = new Map(
      dto.answers.map((answer) => [
        answer.questionId,
        [...new Set(answer.selectedOptionIds)].sort(),
      ]),
    );
    if (
      answers.size !== challenge.questions.length ||
      challenge.questions.some((question) => !answers.has(question.id))
    )
      throw new ValidationException(
        'Every challenge question must be answered exactly once',
      );
    const results = challenge.questions.map((question) => {
      const selected = answers.get(question.id) ?? [];
      const options = new Set(question.options.map((option) => option.id));
      if (selected.some((option) => !options.has(option)))
        throw new ValidationException('A selected challenge option is invalid');
      const expected = [...question.correctOptionIds].sort();
      return {
        questionId: question.id,
        correct:
          selected.length === expected.length &&
          selected.every((value, index) => value === expected[index]),
        explanation: question.explanation,
      };
    });
    const score =
      Math.round(
        (results.filter((result) => result.correct).length / results.length) *
          10000,
      ) / 100;
    const passed = score >= challenge.passingScore;
    let attempt;
    try {
      attempt = await this.attempts.create({
        userId: userObjectId,
        challengeId: challenge._id,
        attemptNumber: priorAttempts + 1,
        answers: dto.answers,
        score,
        passed,
        results,
        rewardState: passed ? 'PENDING' : 'NOT_ELIGIBLE',
      });
    } catch (error) {
      if (this.isDuplicate(error))
        throw new ConflictException(
          'A concurrent challenge attempt used this attempt number',
          'CHALLENGE_ATTEMPT_CONFLICT',
        );
      throw error;
    }
    let rewardState = attempt.rewardState;
    if (passed) {
      const reward = await this.gamification.award(userId, {
        type: RewardTransactionType.CHALLENGE_COMPLETED,
        idempotencyReference: `challenge:${challenge._id.toString()}:completed`,
        xp: challenge.rewardPolicy.xp,
        truthPoints: challenge.rewardPolicy.truthPoints,
        metadata: {
          challengeId: challenge._id.toString(),
          score,
          tags: challenge.tags,
        },
      });
      rewardState = reward.awarded ? 'AWARDED' : 'ALREADY_AWARDED';
      await this.attempts.updateOne(
        { _id: attempt._id },
        { $set: { rewardState } },
      );
    }
    return {
      id: attempt.id,
      attemptNumber: attempt.attemptNumber,
      score,
      passed,
      results,
      rewardState,
    };
  }

  async myAttempts(userId: string, challengeId: string) {
    return this.attempts
      .find({
        userId: new Types.ObjectId(userId),
        challengeId: new Types.ObjectId(challengeId),
      })
      .select('-answers')
      .sort({ attemptNumber: -1 })
      .lean()
      .exec();
  }

  private async refreshStatuses() {
    const now = new Date();
    await Promise.all([
      this.challenges.updateMany(
        {
          status: ChallengeStatus.SCHEDULED,
          publishAt: { $lte: now },
          expiresAt: { $gt: now },
        },
        { $set: { status: ChallengeStatus.PUBLISHED } },
      ),
      this.challenges.updateMany(
        {
          status: {
            $in: [ChallengeStatus.SCHEDULED, ChallengeStatus.PUBLISHED],
          },
          expiresAt: { $lte: now },
        },
        { $set: { status: ChallengeStatus.EXPIRED } },
      ),
    ]);
  }

  private availableQuery() {
    const now = new Date();
    return {
      status: ChallengeStatus.PUBLISHED,
      publishAt: { $lte: now },
      expiresAt: { $gt: now },
    };
  }

  private publicProjection(challenge: ChallengeDocument) {
    return {
      id: challenge.id,
      title: challenge.title,
      slug: challenge.slug,
      scenario: challenge.scenario,
      content: challenge.content,
      tags: challenge.tags,
      mediaAssetId: challenge.mediaAssetId,
      difficulty: challenge.difficulty,
      passingScore: challenge.passingScore,
      maxAttempts: challenge.maxAttempts,
      publishAt: challenge.publishAt,
      expiresAt: challenge.expiresAt,
      questions: challenge.questions.map((question) => ({
        id: question.id,
        type: question.type,
        prompt: question.prompt,
        options: question.options,
      })),
    };
  }

  private adminProjection(challenge: ChallengeDocument) {
    return { ...this.publicProjection(challenge), status: challenge.status };
  }

  private validate(dto: CreateChallengeDto) {
    if (
      !Number.isInteger(dto.rewardPolicy.xp) ||
      dto.rewardPolicy.xp < 0 ||
      !Number.isInteger(dto.rewardPolicy.truthPoints) ||
      dto.rewardPolicy.truthPoints < 0
    )
      throw new ValidationException(
        'Challenge rewards must be non-negative integers',
      );
    const questionIds = new Set<string>();
    for (const question of dto.questions) {
      if (questionIds.has(question.id))
        throw new ValidationException('Challenge question IDs must be unique');
      questionIds.add(question.id);
      const optionIds = new Set(question.options.map((option) => option.id));
      if (
        optionIds.size !== question.options.length ||
        question.correctOptionIds.some((id) => !optionIds.has(id))
      )
        throw new ValidationException(
          'Challenge options and correct answers must be valid and unique',
        );
      if (
        question.type !== QuizQuestionType.MULTIPLE_CHOICE &&
        question.correctOptionIds.length !== 1
      )
        throw new ValidationException(
          'Only multiple-choice questions may have multiple correct options',
        );
    }
  }

  private tags(values: string[]): string[] {
    return [
      ...new Set(
        values.map((value) => value.trim().toLowerCase()).filter(Boolean),
      ),
    ];
  }

  private isDuplicate(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }

  private notFound() {
    return new NotFoundException(
      'The challenge could not be found',
      'CHALLENGE_NOT_FOUND',
    );
  }
}
