import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LearningModule } from '../learning/learning.module';
import { Lesson, LessonSchema } from '../learning/schemas/lesson.schema';
import { QuizzesAdminController } from './controllers/quizzes-admin.controller';
import { QuizzesController } from './controllers/quizzes.controller';
import { QuizAttempt, QuizAttemptSchema } from './schemas/quiz-attempt.schema';
import { Quiz, QuizSchema } from './schemas/quiz.schema';
import { QuizzesService } from './services/quizzes.service';

@Module({
  imports: [
    LearningModule,
    MongooseModule.forFeature([
      { name: Quiz.name, schema: QuizSchema },
      { name: QuizAttempt.name, schema: QuizAttemptSchema },
      { name: Lesson.name, schema: LessonSchema },
    ]),
  ],
  controllers: [QuizzesController, QuizzesAdminController],
  providers: [QuizzesService],
})
export class QuizzesModule {}
