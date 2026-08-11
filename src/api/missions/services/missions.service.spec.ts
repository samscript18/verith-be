import type { Model } from 'mongoose';
import type { Challenge } from '../../challenges/schemas/challenge.schema';
import type { ChallengeAttempt } from '../../challenges/schemas/challenge-attempt.schema';
import type { GamificationService } from '../../gamification/services/gamification.service';
import type { LessonProgress } from '../../learning/schemas/lesson-progress.schema';
import type { Lesson } from '../../learning/schemas/lesson.schema';
import type { CompetencyService } from '../../mil/services/competency.service';
import { MediaLiteracyCompetency } from '../../verifications/enums/guided-investigation.enum';
import type { MissionAssessmentAttempt } from '../schemas/mission-assessment-attempt.schema';
import type { MissionAssessmentDocument } from '../schemas/mission-assessment.schema';
import type { MissionParticipant } from '../schemas/mission-participant.schema';
import type { Mission } from '../schemas/mission.schema';
import { MissionsService } from './missions.service';

describe('MissionsService scoring', () => {
  const service = new MissionsService(
    {} as Model<Mission>,
    {} as never,
    {} as Model<MissionParticipant>,
    {} as Model<MissionAssessmentAttempt>,
    {} as CompetencyService,
    {} as GamificationService,
    {} as Model<Lesson>,
    {} as Model<LessonProgress>,
    {} as Model<Challenge>,
    {} as Model<ChallengeAttempt>,
  );

  it('scores answers only against server-side option IDs', () => {
    const assessment = {
      questions: [
        {
          id: 'q1',
          options: [
            { id: 'a', text: 'Inspect the source' },
            { id: 'b', text: 'Forward it' },
          ],
          correctOptionIds: ['a'],
          explanation: 'Inspecting the source preserves uncertainty.',
          competency: MediaLiteracyCompetency.RESPONSIBLE_SHARING,
        },
      ],
    } as MissionAssessmentDocument;

    expect(
      service['score'](assessment, {
        answers: [{ questionId: 'q1', selectedOptionIds: ['a'] }],
      }),
    ).toEqual([expect.objectContaining({ questionId: 'q1', correct: true })]);
  });
});
