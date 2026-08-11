import { Types } from 'mongoose';
import { QuizQuestionType, QuizStatus } from '../enums/quiz.enum';
import { QuizzesService } from './quizzes.service';

describe('QuizzesService published reads', () => {
  const courseId = new Types.ObjectId();
  const lessonId = new Types.ObjectId();
  const quizId = new Types.ObjectId();
  const userId = new Types.ObjectId();

  const quiz = {
    id: quizId.toString(),
    _id: quizId,
    courseId,
    lessonId,
    title: 'Source comparison',
    description: 'Check how evidence changes a conclusion.',
    passingScore: 70,
    attemptPolicy: { maxAttempts: 3 },
    rewardPolicy: { xp: 20 },
    status: QuizStatus.PUBLISHED,
    questions: [
      {
        id: 'question-1',
        type: QuizQuestionType.SINGLE_CHOICE,
        prompt: 'Which source best supports the claim?',
        options: [
          { id: 'primary', text: 'A primary source' },
          { id: 'anonymous', text: 'An anonymous repost' },
        ],
        correctOptionIds: ['primary'],
        explanation: 'Primary evidence is directly inspectable.',
      },
    ],
  };

  it('discovers a published lesson quiz without exposing answers', async () => {
    const exec = jest.fn().mockResolvedValue(quiz);
    const quizModel = {
      findOne: jest.fn().mockReturnValue({ exec }),
    };
    const service = new QuizzesService(
      quizModel as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.getPublishedByLesson(lessonId.toString());

    expect(quizModel.findOne).toHaveBeenCalledWith({
      lessonId,
      status: QuizStatus.PUBLISHED,
    });
    expect(result.questions[0]).toEqual({
      id: 'question-1',
      type: QuizQuestionType.SINGLE_CHOICE,
      prompt: 'Which source best supports the claim?',
      options: quiz.questions[0]!.options,
    });
    expect(result.questions[0]).not.toHaveProperty('correctOptionIds');
    expect(result.questions[0]).not.toHaveProperty('explanation');
  });

  it('returns only the authenticated user attempt history without answers', async () => {
    const attempts = [
      {
        id: new Types.ObjectId().toString(),
        attemptNumber: 2,
        score: 80,
        passed: true,
        rewardState: 'AWARDED',
      },
    ];
    const exec = jest.fn().mockResolvedValue(attempts);
    const lean = jest.fn().mockReturnValue({ exec });
    const sort = jest.fn().mockReturnValue({ lean });
    const select = jest.fn().mockReturnValue({ sort });
    const attemptModel = {
      find: jest.fn().mockReturnValue({ select }),
    };
    const quizModel = {
      exists: jest.fn().mockResolvedValue({ _id: quizId }),
    };
    const service = new QuizzesService(
      quizModel as never,
      attemptModel as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.myAttempts(
      userId.toString(),
      quizId.toString(),
    );

    expect(quizModel.exists).toHaveBeenCalledWith({
      _id: quizId,
      status: QuizStatus.PUBLISHED,
    });
    expect(attemptModel.find).toHaveBeenCalledWith({
      userId,
      quizId,
    });
    expect(select).toHaveBeenCalledWith('-answers');
    expect(sort).toHaveBeenCalledWith({ attemptNumber: -1 });
    expect(result).toEqual(attempts);
  });
});
