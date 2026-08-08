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
import { LessonStatus } from '../../learning/enums/learning.enum';
import { Lesson } from '../../learning/schemas/lesson.schema';
import { LearningService } from '../../learning/services/learning.service';
import { RewardTransactionType } from '../../gamification/enums/gamification.enum';
import { GamificationService } from '../../gamification/services/gamification.service';
import type {
  CreateQuizDto,
  QuizAdminQueryDto,
  SubmitQuizDto,
  UpdateQuizDto,
} from '../dto/quiz.dto';
import { QuizQuestionType, QuizStatus } from '../enums/quiz.enum';
import { QuizAttempt } from '../schemas/quiz-attempt.schema';
import { Quiz, type QuizDocument } from '../schemas/quiz.schema';
import { searchPattern } from '../../../shared/utils/search-query';

@Injectable()
export class QuizzesService {
  constructor(
    @InjectModel(Quiz.name) private readonly quizModel: Model<Quiz>,
    @InjectModel(QuizAttempt.name)
    private readonly attemptModel: Model<QuizAttempt>,
    @InjectModel(Lesson.name) private readonly lessonModel: Model<Lesson>,
    private readonly learning: LearningService,
    private readonly gamification: GamificationService,
    private readonly audit: AuditService,
  ) {}

  async listAdmin(query: QuizAdminQueryDto) {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.courseId) filter.courseId = new Types.ObjectId(query.courseId);
    if (query.lessonId) filter.lessonId = new Types.ObjectId(query.lessonId);
    if (query.search) {
      const pattern = searchPattern(query.search);
      filter.$or = [{ title: pattern }, { description: pattern }];
    }
    if (query.cursor) filter._id = { $lt: new Types.ObjectId(query.cursor) };
    const records = await this.quizModel
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
    const quiz = await this.quizModel.findById(id).exec();
    if (!quiz) throw this.notFound();
    return this.adminProjection(quiz);
  }

  async update(userId: string, id: string, dto: UpdateQuizDto) {
    const quiz = await this.quizModel.findById(id).exec();
    if (!quiz) throw this.notFound();
    if (
      (dto.lessonId && !quiz.lessonId.equals(dto.lessonId)) ||
      (dto.courseId && !quiz.courseId.equals(dto.courseId))
    )
      throw new ValidationException(
        'A quiz cannot be moved to another course or lesson',
      );
    if (dto.questions)
      this.validateQuestions({
        courseId: quiz.courseId.toString(),
        lessonId: quiz.lessonId.toString(),
        title: dto.title ?? quiz.title,
        description: dto.description ?? quiz.description,
        passingScore: dto.passingScore ?? quiz.passingScore,
        maxAttempts: dto.maxAttempts ?? quiz.attemptPolicy.maxAttempts,
        rewardPolicy: dto.rewardPolicy ?? quiz.rewardPolicy,
        questions: dto.questions,
      });
    const {
      courseId: _courseId,
      lessonId: _lessonId,
      maxAttempts,
      ...values
    } = dto;
    void _courseId;
    void _lessonId;
    quiz.set({
      ...values,
      ...(maxAttempts !== undefined ? { attemptPolicy: { maxAttempts } } : {}),
      updatedBy: new Types.ObjectId(userId),
    });
    await quiz.save();
    return this.adminProjection(quiz);
  }

  async archive(
    actor: AuthUser,
    id: string,
    reason: string,
    requestId: string,
  ) {
    const quiz = await this.quizModel.findById(id).exec();
    if (!quiz) throw this.notFound();
    const before = quiz.status;
    quiz.status = QuizStatus.ARCHIVED;
    quiz.updatedBy = new Types.ObjectId(actor.userId);
    await quiz.save();
    await this.audit.record({
      actor,
      action: 'QUIZ_ARCHIVED',
      resourceType: 'QUIZ',
      resourceId: id,
      requestId,
      reason,
      safeBefore: { status: before },
      safeAfter: { status: quiz.status },
    });
    return this.adminProjection(quiz);
  }

  async create(userId: string, dto: CreateQuizDto) {
    const lesson = await this.lessonModel.findById(dto.lessonId).exec();
    if (!lesson || !lesson.courseId.equals(dto.courseId)) throw this.notFound();
    this.validateQuestions(dto);
    try {
      return await this.quizModel.create({
        courseId: new Types.ObjectId(dto.courseId),
        lessonId: new Types.ObjectId(dto.lessonId),
        title: dto.title,
        description: dto.description,
        passingScore: dto.passingScore,
        attemptPolicy: { maxAttempts: dto.maxAttempts },
        rewardPolicy: dto.rewardPolicy,
        status: QuizStatus.DRAFT,
        questions: dto.questions,
        createdBy: new Types.ObjectId(userId),
        updatedBy: new Types.ObjectId(userId),
      });
    } catch (error) {
      if (this.isDuplicate(error))
        throw new ConflictException(
          'This lesson already has a quiz',
          'QUIZ_LESSON_CONFLICT',
        );
      throw error;
    }
  }

  async setStatus(userId: string, id: string, status: QuizStatus) {
    const quiz = await this.quizModel.findById(id).exec();
    if (!quiz) throw this.notFound();
    if (status === QuizStatus.PUBLISHED) {
      const lesson = await this.lessonModel.findOne({
        _id: quiz.lessonId,
        status: LessonStatus.PUBLISHED,
      });
      if (!lesson)
        throw new ConflictException(
          'The lesson must be published first',
          'QUIZ_PUBLISHING_INCOMPLETE',
        );
      quiz.publishedAt = new Date();
    }
    quiz.status = status;
    quiz.updatedBy = new Types.ObjectId(userId);
    await quiz.save();
    return this.adminProjection(quiz);
  }

  async getPublished(id: string) {
    const quiz = await this.quizModel
      .findOne({ _id: id, status: QuizStatus.PUBLISHED })
      .exec();
    if (!quiz) throw this.notFound();
    return this.publicProjection(quiz);
  }

  async getPublishedByLesson(lessonId: string) {
    const quiz = await this.quizModel
      .findOne({
        lessonId: new Types.ObjectId(lessonId),
        status: QuizStatus.PUBLISHED,
      })
      .exec();
    if (!quiz) throw this.notFound();
    return this.publicProjection(quiz);
  }

  async myAttempts(userId: string, quizId: string) {
    const published = await this.quizModel.exists({
      _id: new Types.ObjectId(quizId),
      status: QuizStatus.PUBLISHED,
    });
    if (!published) throw this.notFound();
    return this.attemptModel
      .find({
        userId: new Types.ObjectId(userId),
        quizId: new Types.ObjectId(quizId),
      })
      .select('-answers')
      .sort({ attemptNumber: -1 })
      .lean()
      .exec();
  }

  async submit(userId: string, id: string, dto: SubmitQuizDto) {
    const quiz = await this.quizModel
      .findOne({ _id: id, status: QuizStatus.PUBLISHED })
      .exec();
    if (!quiz) throw this.notFound();
    const priorAttempts = await this.attemptModel.countDocuments({
      userId: new Types.ObjectId(userId),
      quizId: quiz._id,
    });
    if (priorAttempts >= quiz.attemptPolicy.maxAttempts)
      throw new ConflictException(
        'The maximum number of quiz attempts has been reached',
        'QUIZ_ATTEMPT_LIMIT_REACHED',
      );
    const answers = new Map(
      dto.answers.map((answer) => [
        answer.questionId,
        [...new Set(answer.selectedOptionIds)].sort(),
      ]),
    );
    if (
      answers.size !== quiz.questions.length ||
      quiz.questions.some((question) => !answers.has(question.id))
    )
      throw new ValidationException(
        'Every quiz question must be answered exactly once',
      );
    const results = quiz.questions.map((question) => {
      const selected = answers.get(question.id) ?? [];
      const validOptions = new Set(question.options.map((option) => option.id));
      if (selected.some((option) => !validOptions.has(option)))
        throw new ValidationException('A selected quiz option is invalid');
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
    const passed = score >= quiz.passingScore;
    let attempt;
    try {
      attempt = await this.attemptModel.create({
        userId: new Types.ObjectId(userId),
        quizId: quiz._id,
        courseId: quiz.courseId,
        lessonId: quiz.lessonId,
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
          'A concurrent quiz attempt already used this attempt number',
          'QUIZ_ATTEMPT_CONFLICT',
        );
      throw error;
    }
    let rewardState = attempt.rewardState;
    if (passed) {
      await this.learning.updateProgress(userId, quiz.lessonId.toString(), {
        progress: 100,
      });
      const xp = Number(quiz.rewardPolicy.xp ?? 0);
      const truthPoints = Number(quiz.rewardPolicy.truthPoints ?? 0);
      const reward = await this.gamification.award(userId, {
        type: RewardTransactionType.QUIZ_PASSED,
        idempotencyReference: `quiz:${quiz._id.toString()}:passed`,
        xp: Number.isInteger(xp) && xp >= 0 ? xp : 0,
        truthPoints:
          Number.isInteger(truthPoints) && truthPoints >= 0 ? truthPoints : 0,
        metadata: { quizId: quiz._id.toString(), score },
      });
      rewardState = reward.awarded ? 'AWARDED' : 'ALREADY_AWARDED';
      await this.attemptModel.updateOne(
        { _id: attempt._id },
        { $set: { rewardState } },
      );
    }
    return {
      id: attempt.id,
      attemptNumber: attempt.attemptNumber,
      score,
      passed,
      passingScore: quiz.passingScore,
      results,
      rewardState,
    };
  }

  private validateQuestions(dto: CreateQuizDto): void {
    const ids = new Set<string>();
    for (const question of dto.questions) {
      if (ids.has(question.id))
        throw new ValidationException('Quiz question IDs must be unique');
      ids.add(question.id);
      const optionIds = new Set(question.options.map((option) => option.id));
      if (
        optionIds.size !== question.options.length ||
        question.correctOptionIds.some((id) => !optionIds.has(id))
      )
        throw new ValidationException(
          'Quiz option IDs and correct answers must be valid and unique',
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

  private publicProjection(quiz: QuizDocument) {
    return {
      id: quiz.id,
      courseId: quiz.courseId,
      lessonId: quiz.lessonId,
      title: quiz.title,
      description: quiz.description,
      passingScore: quiz.passingScore,
      maxAttempts: quiz.attemptPolicy.maxAttempts,
      questions: quiz.questions.map((question) => ({
        id: question.id,
        type: question.type,
        prompt: question.prompt,
        options: question.options,
      })),
    };
  }

  private adminProjection(quiz: QuizDocument) {
    return {
      ...this.publicProjection(quiz),
      status: quiz.status,
      questions: quiz.questions,
      rewardPolicy: quiz.rewardPolicy,
    };
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
      'The quiz could not be found',
      'QUIZ_NOT_FOUND',
    );
  }
}
