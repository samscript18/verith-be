import { buildDailyChallengeBlueprint } from '../data/daily-challenge-blueprint';
import { DailyChallengeDuplicateService } from './daily-challenge-duplicate.service';
import {
  DailyChallengeContentError,
  DailyChallengeValidator,
} from './daily-challenge-validator.service';
import { TemplateDailyChallengeGenerator } from './template-daily-challenge.generator';
import {
  normalizeQuestionPrompt,
  questionSignature,
  questionSimilarity,
} from '../utils/question-similarity';

describe('hybrid daily challenge generation', () => {
  it('builds a deterministic ten-slot blueprint without consecutive primary topics', () => {
    const dates = Array.from({ length: 18 }, (_, index) =>
      new Date(Date.UTC(2026, 7, 1 + index)).toISOString().slice(0, 10),
    );
    const blueprints = dates.map(buildDailyChallengeBlueprint);

    expect(new Set(blueprints.map((item) => item.topicFocus[0])).size).toBe(18);
    expect(
      blueprints.every(
        (item, index) =>
          index === 0 ||
          item.topicFocus[0] !== blueprints[index - 1]!.topicFocus[0],
      ),
    ).toBe(true);
    expect(blueprints.every((item) => item.questionCount === 10)).toBe(true);
    expect(
      blueprints.every((item) => item.competencyTargets.length === 10),
    ).toBe(true);
  });

  it('normalizes case and punctuation and catches a replaced topic noun', () => {
    expect(questionSignature('CHECK the source!')).toBe(
      questionSignature(' check, the source '),
    );
    expect(
      questionSimilarity(
        'What should you verify first before sharing a scholarship post?',
        'What should you verify first before sharing a recruitment post?',
      ),
    ).toBe(1);
    expect(normalizeQuestionPrompt('A scholarship closes in 2026.')).toContain(
      'topic',
    );
  });

  it('validates the template fallback and assigns authoritative IDs', async () => {
    const blueprint = buildDailyChallengeBlueprint('2026-08-11');
    const generated = await new TemplateDailyChallengeGenerator().generate(
      blueprint,
    );
    const challenge = new DailyChallengeValidator().validate(
      generated.challenge,
      blueprint,
    );

    expect(challenge.questions).toHaveLength(10);
    expect(challenge.questions[0]?.id).toBe('2026-08-11-q01');
    expect(challenge.questions[9]?.id).toBe('2026-08-11-q10');
  });

  it('rejects malformed answer options before publication', async () => {
    const blueprint = buildDailyChallengeBlueprint('2026-08-11');
    const generated = await new TemplateDailyChallengeGenerator().generate(
      blueprint,
    );
    generated.challenge.questions[0]!.options[1]!.id =
      generated.challenge.questions[0]!.options[0]!.id;

    expect(() =>
      new DailyChallengeValidator().validate(generated.challenge, blueprint),
    ).toThrow(DailyChallengeContentError);
  });

  it('rejects recent exact questions inside the configured window', async () => {
    const blueprint = buildDailyChallengeBlueprint('2026-08-11');
    const generated = await new TemplateDailyChallengeGenerator().generate(
      blueprint,
    );
    const model = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([
              {
                questions: [
                  { prompt: generated.challenge.questions[0]!.prompt },
                ],
              },
            ]),
          }),
        }),
      }),
    };
    const duplicates = new DailyChallengeDuplicateService(
      model as never,
      {
        getOrThrow: jest.fn().mockReturnValue({
          duplicateWindowDays: 90,
          similarityThreshold: 0.85,
        }),
      } as never,
    );

    await expect(
      duplicates.assertFresh(
        generated.challenge,
        new Date('2026-08-11T00:00:00.000Z'),
      ),
    ).rejects.toMatchObject({ safeCode: 'RECENT_EXACT_DUPLICATE' });
  });
});
