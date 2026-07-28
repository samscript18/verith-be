import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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
  UpdateLessonProgressDto,
} from '../dto/learning.dto';
import {
  CourseStatus,
  LessonProgressStatus,
  LessonStatus,
} from '../enums/learning.enum';
import { Course } from '../schemas/course.schema';
import { LessonProgress } from '../schemas/lesson-progress.schema';
import { Lesson } from '../schemas/lesson.schema';

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
  ) {}

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

  async listPublished() {
    return this.courseModel
      .find({ status: CourseStatus.PUBLISHED })
      .select('-createdBy -updatedBy')
      .sort({ publishedAt: -1 })
      .lean()
      .exec();
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
    return this.progressModel.findOneAndUpdate(
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
