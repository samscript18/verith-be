/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Types } from 'mongoose';
import { RewardTransactionType } from '../../gamification/enums/gamification.enum';
import { QuizQuestionType, QuizStatus } from '../enums/quiz.enum';

jest.mock('sanitize-html', () => ({
  __esModule: true,
  default: (value: string) => value,
}));

import { QuizzesService } from './quizzes.service';

describe('QuizzesService gamification ordering', () => {
  it('awards the live quiz before lesson completion can start historical backfill', async () => {
    const quizId = new Types.ObjectId();
    const lessonId = new Types.ObjectId();
    const courseId = new Types.ObjectId();
    const quiz = {
      _id: quizId,
      id: quizId.toString(),
      lessonId,
      courseId,
      status: QuizStatus.PUBLISHED,
      passingScore: 50,
      attemptPolicy: { maxAttempts: 3 },
      rewardPolicy: { xp: 20, truthPoints: 5 },
      questions: [
        {
          id: 'question-1',
          type: QuizQuestionType.SINGLE_CHOICE,
          prompt: 'Which action verifies the source?',
          options: [
            { id: 'a', text: 'Open the source' },
            { id: 'b', text: 'Forward immediately' },
          ],
          correctOptionIds: ['a'],
          explanation: 'Opening the source exposes its evidence and context.',
        },
      ],
    };
    const quizModel = {
      findOne: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue(quiz) }),
    };
    const attempt = {
      _id: new Types.ObjectId(),
      id: new Types.ObjectId().toString(),
      rewardState: 'PENDING',
      attemptNumber: 1,
    };
    const attempts = {
      countDocuments: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue(attempt),
      updateOne: jest.fn().mockResolvedValue({}),
    };
    const lessons = {
      findById: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({ tags: ['context'] }),
          }),
        }),
      }),
    };
    const learning = { updateProgress: jest.fn().mockResolvedValue({}) };
    const gamification = {
      award: jest.fn().mockResolvedValue({ awarded: true }),
      recordEligibleActivity: jest.fn().mockResolvedValue({ awarded: true }),
    };
    const service = new QuizzesService(
      quizModel as never,
      attempts as never,
      lessons as never,
      learning as never,
      gamification as never,
      {} as never,
    );

    await service.submit(new Types.ObjectId().toString(), quizId.toString(), {
      answers: [{ questionId: 'question-1', selectedOptionIds: ['a'] }],
    });

    expect(gamification.award).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        type: RewardTransactionType.QUIZ_PASSED,
        idempotencyReference: `quiz:${quizId.toString()}:passed`,
        metadata: expect.objectContaining({ tags: ['context'] }),
      }),
    );
    expect(gamification.award.mock.invocationCallOrder[0]).toBeLessThan(
      learning.updateProgress.mock.invocationCallOrder[0] ?? Infinity,
    );
    // The primary award now persists the idempotent daily activity itself, so
    // the producer must not issue a second gamification award.
    expect(gamification.recordEligibleActivity).not.toHaveBeenCalled();
  });
});
