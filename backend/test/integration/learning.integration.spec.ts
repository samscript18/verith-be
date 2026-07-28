import { Test, type TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Types, type Connection } from 'mongoose';
import { AppModule } from '../../src/app.module';
import {
  CourseStatus,
  LearningDifficulty,
  LessonStatus,
} from '../../src/api/learning/enums/learning.enum';
import { LearningService } from '../../src/api/learning/services/learning.service';
import {
  QuizQuestionType,
  QuizStatus,
} from '../../src/api/quizzes/enums/quiz.enum';
import { QuizzesService } from '../../src/api/quizzes/services/quizzes.service';

describe('Learning and quiz persistence (integration)', () => {
  jest.setTimeout(30000);
  let moduleRef: TestingModule;
  let connection: Connection;
  let learning: LearningService;
  let quizzes: QuizzesService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    await moduleRef.init();
    connection = moduleRef.get<Connection>(getConnectionToken());
    learning = moduleRef.get(LearningService);
    quizzes = moduleRef.get(QuizzesService);
  });

  afterAll(async () => {
    for (const collection of [
      'quiz_attempts',
      'quizzes',
      'lesson_progress',
      'lessons',
      'courses',
    ])
      await connection.collection(collection).deleteMany({});
    await moduleRef.close();
  });

  it('sanitizes lessons, protects answers, scores server-side, and completes progress once', async () => {
    const editorId = new Types.ObjectId().toString();
    const learnerId = new Types.ObjectId().toString();
    const course = await learning.createCourse(editorId, {
      title: 'Reading Evidence',
      slug: 'reading-evidence',
      description: 'Learn how to inspect evidence and source quality.',
      difficulty: LearningDifficulty.BEGINNER,
      estimatedDuration: 30,
      learningObjectives: ['Evaluate sources'],
      tags: ['science'],
    });
    const lesson = await learning.createLesson(editorId, {
      courseId: course.id,
      title: 'Source checks',
      slug: 'source-checks',
      summary: 'A practical source evaluation lesson.',
      contentHtml:
        '<h2>Check the source</h2><script>alert(1)</script><a href="javascript:alert(1)">bad</a><a href="https://example.org">safe</a>',
      estimatedDuration: 10,
      sequence: 1,
      tags: ['science'],
    });
    expect(lesson.sanitizedHtml).not.toContain('<script');
    expect(lesson.sanitizedHtml).not.toContain('javascript:');
    expect(lesson.sanitizedHtml).toContain('https://example.org');

    await learning.setLessonStatus(editorId, lesson.id, LessonStatus.PUBLISHED);
    await learning.setCourseStatus(editorId, course.id, CourseStatus.PUBLISHED);
    const published = await learning.getPublished('reading-evidence');
    expect(published.lessons).toHaveLength(1);

    const quiz = await quizzes.create(editorId, {
      courseId: lesson.courseId.toString(),
      lessonId: lesson._id.toString(),
      title: 'Source checks quiz',
      description: 'Test source evaluation skills.',
      passingScore: 100,
      maxAttempts: 1,
      rewardPolicy: { xp: 10 },
      questions: [
        {
          id: 'q1',
          type: QuizQuestionType.SINGLE_CHOICE,
          prompt: 'Which source is strongest?',
          options: [
            { id: 'official', text: 'A relevant primary record' },
            { id: 'anonymous', text: 'An anonymous repost' },
          ],
          correctOptionIds: ['official'],
          explanation: 'Relevant primary records provide direct evidence.',
        },
      ],
    });
    await quizzes.setStatus(editorId, quiz.id, QuizStatus.PUBLISHED);
    const publicQuiz = await quizzes.getPublished(quiz.id);
    expect(publicQuiz.questions[0]).not.toHaveProperty('correctOptionIds');
    expect(publicQuiz.questions[0]).not.toHaveProperty('explanation');

    const result = await quizzes.submit(learnerId, quiz.id, {
      answers: [{ questionId: 'q1', selectedOptionIds: ['official'] }],
    });
    expect(result).toMatchObject({
      score: 100,
      passed: true,
      rewardState: 'DEFERRED_TO_GAMIFICATION_PHASE',
    });
    expect(result.results[0]?.explanation).toContain('primary records');
    const progress = await learning.myProgress(learnerId, course.id);
    expect(progress[0]).toMatchObject({
      progress: 100,
      status: 'COMPLETED',
      attemptCount: 0,
    });
    await expect(
      quizzes.submit(learnerId, quiz.id, {
        answers: [{ questionId: 'q1', selectedOptionIds: ['official'] }],
      }),
    ).rejects.toMatchObject({ code: 'QUIZ_ATTEMPT_LIMIT_REACHED' });
  });
});
