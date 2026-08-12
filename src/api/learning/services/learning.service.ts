import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditService } from '../../admin/services/audit.service';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface';
import sanitizeHtml from 'sanitize-html';
import {
  ConflictException,
  NotFoundException,
  ValidationException,
} from '../../../core/exceptions';
import { Report } from '../../reports/schemas/report.schema';
import { Verification } from '../../verifications/schemas/verification.schema';
import type {
  CreateCourseDto,
  CreateLessonDto,
  LearningAdminQueryDto,
  PublishedCourseQueryDto,
  UpdateCourseDto,
  UpdateLessonDto,
  UpdateLessonProgressDto,
} from '../dto/learning.dto';
import { searchPattern } from '../../../shared/utils/search-query';
import {
  CourseStatus,
  LessonProgressStatus,
  LessonStatus,
} from '../enums/learning.enum';
import { Course } from '../schemas/course.schema';
import { LessonProgress } from '../schemas/lesson-progress.schema';
import { Lesson } from '../schemas/lesson.schema';
import { GamificationService } from '../../gamification/services/gamification.service';
import { RewardTransactionType } from '../../gamification/enums/gamification.enum';

@Injectable()
export class LearningService {
  constructor(
    @InjectModel(Course.name) private readonly courseModel: Model<Course>,
    @InjectModel(Lesson.name) private readonly lessonModel: Model<Lesson>,
    @InjectModel(LessonProgress.name)
    private readonly progressModel: Model<LessonProgress>,
    @InjectModel(Report.name) private readonly reportModel: Model<Report>,
    @InjectModel(Verification.name)
    private readonly verificationModel: Model<Verification>,
    private readonly audit: AuditService,
    private readonly gamification: GamificationService,
  ) {}

  async listCoursesAdmin(query: LearningAdminQueryDto) {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.difficulty) filter.difficulty = query.difficulty;
    if (query.tag) filter.tags = query.tag.trim().toLowerCase();
    if (query.search) {
      const pattern = searchPattern(query.search);
      filter.$or = [
        { title: pattern },
        { slug: pattern },
        { description: pattern },
      ];
    }
    return this.page(this.courseModel, query, filter);
  }

  async getCourseAdmin(id: string) {
    const course = await this.courseModel.findById(id).lean().exec();
    if (!course) throw this.notFound('COURSE_NOT_FOUND');
    const lessons = await this.lessonModel
      .find({ courseId: course._id })
      .sort({ sequence: 1 })
      .lean()
      .exec();
    return { ...course, lessons };
  }

  async listLessonsAdmin(query: LearningAdminQueryDto) {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.courseId) filter.courseId = new Types.ObjectId(query.courseId);
    if (query.tag) filter.tags = query.tag.trim().toLowerCase();
    if (query.search) {
      const pattern = searchPattern(query.search);
      filter.$or = [
        { title: pattern },
        { slug: pattern },
        { summary: pattern },
      ];
    }
    return this.page(this.lessonModel, query, filter);
  }

  async getLessonAdmin(id: string) {
    const lesson = await this.lessonModel.findById(id).lean().exec();
    if (!lesson) throw this.notFound('LESSON_NOT_FOUND');
    return lesson;
  }

  async updateCourse(userId: string, id: string, dto: UpdateCourseDto) {
    const course = await this.courseModel.findById(id).exec();
    if (!course) throw this.notFound('COURSE_NOT_FOUND');
    course.set({
      ...dto,
      ...(dto.tags ? { tags: this.tags(dto.tags) } : {}),
      ...(dto.prerequisiteCourseIds
        ? {
            prerequisiteCourseIds: dto.prerequisiteCourseIds.map(
              (value) => new Types.ObjectId(value),
            ),
          }
        : {}),
      updatedBy: new Types.ObjectId(userId),
    });
    try {
      await course.save();
      return course;
    } catch (error) {
      if (this.isDuplicate(error))
        throw new ConflictException(
          'The course slug already exists',
          'COURSE_SLUG_CONFLICT',
        );
      throw error;
    }
  }

  async updateLesson(userId: string, id: string, dto: UpdateLessonDto) {
    const lesson = await this.lessonModel.findById(id).exec();
    if (!lesson) throw this.notFound('LESSON_NOT_FOUND');
    if (dto.courseId && !lesson.courseId.equals(dto.courseId))
      throw new ValidationException(
        'A lesson cannot be moved to another course',
      );
    const { courseId: _courseId, contentHtml, ...values } = dto;
    void _courseId;
    const sanitizedHtml = contentHtml ? this.sanitize(contentHtml) : undefined;
    if (
      sanitizedHtml !== undefined &&
      !sanitizeHtml(sanitizedHtml, { allowedTags: [] }).trim()
    )
      throw new ValidationException(
        'Lesson content is empty after sanitization',
      );
    lesson.set({
      ...values,
      ...(sanitizedHtml !== undefined ? { sanitizedHtml } : {}),
      ...(dto.tags ? { tags: this.tags(dto.tags) } : {}),
      updatedBy: new Types.ObjectId(userId),
    });
    try {
      await lesson.save();
      return lesson;
    } catch (error) {
      if (this.isDuplicate(error))
        throw new ConflictException(
          'The lesson slug or sequence already exists in this course',
          'LESSON_CONFLICT',
        );
      throw error;
    }
  }

  async archiveCourse(
    actor: AuthUser,
    id: string,
    reason: string,
    requestId: string,
  ) {
    const course = await this.courseModel.findById(id).exec();
    if (!course) throw this.notFound('COURSE_NOT_FOUND');
    const before = course.status;
    course.status = CourseStatus.ARCHIVED;
    course.updatedBy = new Types.ObjectId(actor.userId);
    await course.save();
    await this.audit.record({
      actor,
      action: 'COURSE_ARCHIVED',
      resourceType: 'COURSE',
      resourceId: id,
      requestId,
      reason,
      safeBefore: { status: before },
      safeAfter: { status: course.status },
    });
    return course;
  }

  async archiveLesson(
    actor: AuthUser,
    id: string,
    reason: string,
    requestId: string,
  ) {
    const lesson = await this.lessonModel.findById(id).exec();
    if (!lesson) throw this.notFound('LESSON_NOT_FOUND');
    const before = lesson.status;
    lesson.status = LessonStatus.ARCHIVED;
    lesson.updatedBy = new Types.ObjectId(actor.userId);
    await lesson.save();
    await this.audit.record({
      actor,
      action: 'LESSON_ARCHIVED',
      resourceType: 'LESSON',
      resourceId: id,
      requestId,
      reason,
      safeBefore: { status: before },
      safeAfter: { status: lesson.status },
    });
    return lesson;
  }

  async createCourse(userId: string, dto: CreateCourseDto) {
    try {
      return await this.courseModel.create({
        ...dto,
        prerequisiteCourseIds:
          dto.prerequisiteCourseIds?.map((id) => new Types.ObjectId(id)) ?? [],
        lessonIds: [],
        status: CourseStatus.DRAFT,
        createdBy: new Types.ObjectId(userId),
        updatedBy: new Types.ObjectId(userId),
      });
    } catch (error) {
      if (this.isDuplicate(error))
        throw new ConflictException(
          'The course slug already exists',
          'COURSE_SLUG_CONFLICT',
        );
      throw error;
    }
  }

  async createLesson(userId: string, dto: CreateLessonDto) {
    const course = await this.courseModel.findById(dto.courseId).exec();
    if (!course) throw this.notFound('COURSE_NOT_FOUND');
    const sanitizedHtml = this.sanitize(dto.contentHtml);
    if (!sanitizeHtml(sanitizedHtml, { allowedTags: [] }).trim())
      throw new ValidationException(
        'Lesson content is empty after sanitization',
      );
    try {
      const lesson = await this.lessonModel.create({
        courseId: course._id,
        title: dto.title,
        slug: dto.slug,
        summary: dto.summary,
        sanitizedHtml,
        estimatedDuration: dto.estimatedDuration,
        sequence: dto.sequence,
        tags: this.tags(dto.tags),
        status: LessonStatus.DRAFT,
        createdBy: new Types.ObjectId(userId),
        updatedBy: new Types.ObjectId(userId),
      });
      await this.courseModel.updateOne(
        { _id: course._id },
        {
          $addToSet: { lessonIds: lesson._id },
          $set: { updatedBy: new Types.ObjectId(userId) },
        },
      );
      return lesson;
    } catch (error) {
      if (this.isDuplicate(error))
        throw new ConflictException(
          'The lesson slug or sequence already exists in this course',
          'LESSON_CONFLICT',
        );
      throw error;
    }
  }

  async setCourseStatus(userId: string, id: string, status: CourseStatus) {
    const course = await this.courseModel.findById(id).exec();
    if (!course) throw this.notFound('COURSE_NOT_FOUND');
    if (status === CourseStatus.PUBLISHED) {
      const publishedLessons = await this.lessonModel.countDocuments({
        _id: { $in: course.lessonIds },
        status: LessonStatus.PUBLISHED,
      });
      if (
        !course.lessonIds.length ||
        publishedLessons !== course.lessonIds.length
      )
        throw new ConflictException(
          'Every course lesson must be published first',
          'COURSE_PUBLISHING_INCOMPLETE',
        );
      course.publishedAt = new Date();
    }
    course.status = status;
    course.updatedBy = new Types.ObjectId(userId);
    await course.save();
    return course;
  }

  async setLessonStatus(userId: string, id: string, status: LessonStatus) {
    const lesson = await this.lessonModel.findById(id).exec();
    if (!lesson) throw this.notFound('LESSON_NOT_FOUND');
    lesson.status = status;
    lesson.updatedBy = new Types.ObjectId(userId);
    if (status === LessonStatus.PUBLISHED) lesson.publishedAt = new Date();
    await lesson.save();
    return lesson;
  }

  async listPublished(query: PublishedCourseQueryDto) {
    const filter: Record<string, unknown> = {
      status: CourseStatus.PUBLISHED,
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
        { description: pattern },
        { tags: pattern },
      ];
    }
    const records = await this.courseModel
      .find(filter)
      .select('-createdBy -updatedBy')
      .sort({ _id: -1 })
      .limit(query.limit + 1)
      .lean()
      .exec();
    return this.pageResult(records, query.limit);
  }

  async getPublished(slug: string) {
    const course = await this.courseModel
      .findOne({ slug, status: CourseStatus.PUBLISHED })
      .select('-createdBy -updatedBy')
      .lean()
      .exec();
    if (!course) throw this.notFound('COURSE_NOT_FOUND');
    const lessons = await this.lessonModel
      .find({
        _id: { $in: course.lessonIds },
        status: LessonStatus.PUBLISHED,
      })
      .select('-createdBy -updatedBy')
      .sort({ sequence: 1 })
      .lean()
      .exec();
    return { ...course, lessons };
  }

  async getPublishedLesson(slug: string) {
    const lesson = await this.lessonModel
      .findOne({ slug, status: LessonStatus.PUBLISHED })
      .select('-createdBy -updatedBy')
      .lean()
      .exec();
    if (!lesson) throw this.notFound('LESSON_NOT_FOUND');
    const course = await this.courseModel
      .findOne({
        _id: lesson.courseId,
        lessonIds: lesson._id,
        status: CourseStatus.PUBLISHED,
      })
      .select(
        'title slug description difficulty estimatedDuration learningObjectives',
      )
      .lean()
      .exec();
    if (!course) throw this.notFound('LESSON_NOT_FOUND');
    return { ...lesson, course };
  }

  async updateProgress(
    userId: string,
    lessonId: string,
    dto: UpdateLessonProgressDto,
  ) {
    const lesson = await this.lessonModel
      .findOne({ _id: lessonId, status: LessonStatus.PUBLISHED })
      .exec();
    if (!lesson) throw this.notFound('LESSON_NOT_FOUND');
    const now = new Date();
    const current = await this.progressModel
      .findOne({ userId: new Types.ObjectId(userId), lessonId: lesson._id })
      .exec();
    const wasComplete = current?.status === LessonProgressStatus.COMPLETED;
    const nextProgress = Math.max(current?.progress ?? 0, dto.progress);
    const status =
      nextProgress >= 100
        ? LessonProgressStatus.COMPLETED
        : nextProgress > 0
          ? LessonProgressStatus.IN_PROGRESS
          : LessonProgressStatus.NOT_STARTED;
    const progress = await this.progressModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId), lessonId: lesson._id },
      {
        $set: {
          courseId: lesson.courseId,
          progress: nextProgress,
          status,
          ...(dto.lastPosition !== undefined
            ? { lastPosition: dto.lastPosition }
            : {}),
          ...(status === LessonProgressStatus.COMPLETED && !wasComplete
            ? { completedAt: now }
            : {}),
        },
        $setOnInsert: {
          startedAt: now,
          attemptCount: 0,
        },
      },
      { upsert: true, returnDocument: 'after', runValidators: true },
    );
    if (status === LessonProgressStatus.COMPLETED && !wasComplete) {
      await this.gamification.award(userId, {
        type: RewardTransactionType.LESSON_COMPLETED,
        idempotencyReference: `lesson:${lesson._id.toString()}:completed`,
        xp: 15,
        truthPoints: 5,
        metadata: {
          lessonId: lesson._id.toString(),
          courseId: lesson.courseId.toString(),
          tags: lesson.tags,
        },
      });
    }
    return progress;
  }

  async myProgress(userId: string, courseId: string) {
    return this.progressModel
      .find({
        userId: new Types.ObjectId(userId),
        courseId: new Types.ObjectId(courseId),
      })
      .lean()
      .exec();
  }

  async recommendations(userId: string, reportId: string) {
    const report = await this.reportModel.findById(reportId).lean().exec();
    if (!report) throw this.notFound('REPORT_NOT_FOUND');
    const owned = await this.verificationModel.exists({
      _id: report.verificationId,
      userId: new Types.ObjectId(userId),
    });
    if (!owned) throw this.notFound('REPORT_NOT_FOUND');
    const tags = report.learningRecommendations.flatMap((item) =>
      typeof item.tag === 'string' ? [item.tag] : [],
    );
    if (!tags.length) return [];
    return this.courseModel
      .find({ status: CourseStatus.PUBLISHED, tags: { $in: tags } })
      .select('title slug description difficulty estimatedDuration tags')
      .limit(10)
      .lean()
      .exec();
  }

  private sanitize(value: string): string {
    return sanitizeHtml(value, {
      allowedTags: [
        'p',
        'h2',
        'h3',
        'h4',
        'strong',
        'em',
        'ul',
        'ol',
        'li',
        'blockquote',
        'code',
        'pre',
        'a',
      ],
      allowedAttributes: { a: ['href', 'title'] },
      allowedSchemes: ['https'],
      allowProtocolRelative: false,
      enforceHtmlBoundary: true,
    });
  }

  private tags(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim().toLowerCase()))];
  }

  private async page<T extends Course | Lesson>(
    model: Model<T>,
    query: LearningAdminQueryDto,
    baseFilter: Record<string, unknown> = {},
  ) {
    const filter = {
      ...baseFilter,
      ...(query.cursor
        ? { _id: { $lt: new Types.ObjectId(query.cursor) } }
        : {}),
    };
    const records = await model
      .find(filter)
      .sort({ _id: -1 })
      .limit(query.limit + 1)
      .lean()
      .exec();
    return this.pageResult(records, query.limit);
  }

  private pageResult<T extends { _id: Types.ObjectId }>(
    records: T[],
    limit: number,
  ) {
    const hasNextPage = records.length > limit;
    const items = records.slice(0, limit);
    return {
      items,
      pagination: {
        nextCursor: hasNextPage ? items.at(-1)?._id.toString() : null,
        previousCursor: null,
        hasNextPage,
        limit,
      },
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

  private notFound(code: string) {
    return new NotFoundException(
      code === 'COURSE_NOT_FOUND'
        ? 'The course could not be found'
        : code === 'LESSON_NOT_FOUND'
          ? 'The lesson could not be found'
          : 'The report could not be found',
      code,
    );
  }
}
