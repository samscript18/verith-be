import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ConflictException,
  NotFoundException,
  ValidationException,
} from '../../../core/exceptions';
import { LessonStatus } from '../../learning/enums/learning.enum';
import { Lesson } from '../../learning/schemas/lesson.schema';
import { LearningService } from '../../learning/services/learning.service';
import type { CreateQuizDto, SubmitQuizDto } from '../dto/quiz.dto';
import { QuizQuestionType, QuizStatus } from '../enums/quiz.enum';
import { QuizAttempt } from '../schemas/quiz-attempt.schema';
import { Quiz, type QuizDocument } from '../schemas/quiz.schema';

@Injectable()
export class QuizzesService {
  constructor(
    @InjectModel(Quiz.name) private readonly quizModel: Model<Quiz>,
    @InjectModel(QuizAttempt.name)
    private readonly attemptModel: Model<QuizAttempt>,
    @InjectModel(Lesson.name) private readonly lessonModel: Model<Lesson>,
    private readonly learning: LearningService,
  ) {}

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
        rewardState: passed ? 'DEFERRED_TO_GAMIFICATION_PHASE' : 'NOT_ELIGIBLE',
      });
    } catch (error) {
      if (this.isDuplicate(error))
        throw new ConflictException(
          'A concurrent quiz attempt already used this attempt number',
          'QUIZ_ATTEMPT_CONFLICT',
        );
      throw error;
    }
    if (passed)
      await this.learning.updateProgress(userId, quiz.lessonId.toString(), {
        progress: 100,
      });
    return {
      id: attempt.id,
      attemptNumber: attempt.attemptNumber,
      score,
      passed,
      passingScore: quiz.passingScore,
      results,
      rewardState: attempt.rewardState,
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
