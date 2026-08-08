import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminModule } from '../admin/admin.module';
import { Report, ReportSchema } from '../reports/schemas/report.schema';
import {
  Verification,
  VerificationSchema,
} from '../verifications/schemas/verification.schema';
import { LearningAdminController } from './controllers/learning-admin.controller';
import { LearningController } from './controllers/learning.controller';
import { Course, CourseSchema } from './schemas/course.schema';
import {
  LessonProgress,
  LessonProgressSchema,
} from './schemas/lesson-progress.schema';
import { Lesson, LessonSchema } from './schemas/lesson.schema';
import { LearningService } from './services/learning.service';
import { GamificationModule } from '../gamification/gamification.module';

@Module({
  imports: [
    AdminModule,
    GamificationModule,
    MongooseModule.forFeature([
      { name: Course.name, schema: CourseSchema },
      { name: Lesson.name, schema: LessonSchema },
      { name: LessonProgress.name, schema: LessonProgressSchema },
      { name: Report.name, schema: ReportSchema },
      { name: Verification.name, schema: VerificationSchema },
    ]),
  ],
  controllers: [LearningController, LearningAdminController],
  providers: [LearningService],
  exports: [LearningService, MongooseModule],
})
export class LearningModule {}
