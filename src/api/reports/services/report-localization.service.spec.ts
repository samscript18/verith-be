import { Types } from 'mongoose';
import { SupportedLanguage } from '../../../shared/language/supported-language';
import {
  ReportLocalizationStatus,
  type ReportLocalization,
} from '../schemas/report-localization.schema';
import { ReportLocalizationService } from './report-localization.service';

describe('ReportLocalizationService', () => {
  const report = {
    _id: new Types.ObjectId(),
    verificationId: new Types.ObjectId(),
  } as never;

  it('returns canonical English without spending a provider call', async () => {
    const ai = { execute: jest.fn() };
    const model = {};
    const service = new ReportLocalizationService(
      model as never,
      ai as never,
      {} as never,
    );

    await expect(
      service.present(
        report,
        { summary: 'Evidence remains incomplete.' },
        SupportedLanguage.ENGLISH,
      ),
    ).resolves.toMatchObject({
      summary: 'Evidence remains incomplete.',
      presentationLanguage: SupportedLanguage.ENGLISH,
      localizationStatus: ReportLocalizationStatus.COMPLETE,
    });
    expect(ai.execute).not.toHaveBeenCalled();
  });

  it('merges cached translations into the caller projection without leaking cached private fields', async () => {
    const cached: Partial<ReportLocalization> = {
      status: ReportLocalizationStatus.COMPLETE,
      content: {
        translations: [{ path: '/summary', text: 'Résumé traduit.' }],
        privateSecret: 'must-not-be-returned',
      },
      limitations: [],
    };
    const exec = jest.fn().mockResolvedValue(cached);
    const model = { findOne: jest.fn(() => ({ lean: () => ({ exec }) })) };
    const service = new ReportLocalizationService(
      model as never,
      { execute: jest.fn() } as never,
      {} as never,
    );

    const result = await service.present(
      report,
      { summary: 'Canonical.', publicField: true },
      SupportedLanguage.FRENCH,
    );

    expect(result).toMatchObject({
      summary: 'Résumé traduit.',
      publicField: true,
      presentationLanguage: SupportedLanguage.FRENCH,
      localizationLimitations: [],
    });
    expect(result).not.toHaveProperty('privateSecret');
  });

  it('never calls a provider merely because a translated report is read', async () => {
    const ai = { execute: jest.fn() };
    const exec = jest.fn().mockResolvedValue(null);
    const model = { findOne: jest.fn(() => ({ lean: () => ({ exec }) })) };
    const service = new ReportLocalizationService(
      model as never,
      ai as never,
      {} as never,
    );

    await expect(
      service.present(
        report,
        { summary: 'Canonical English.' },
        SupportedLanguage.SPANISH,
      ),
    ).resolves.toMatchObject({
      summary: 'Canonical English.',
      presentationLanguage: SupportedLanguage.ENGLISH,
      localizationStatus: ReportLocalizationStatus.FALLBACK,
      localizationRetryable: true,
    });
    expect(ai.execute).not.toHaveBeenCalled();
  });

  it('makes existing invalid-response fallbacks explicitly retryable', async () => {
    const exec = jest.fn().mockResolvedValue({
      status: ReportLocalizationStatus.FALLBACK,
      content: { translations: [] },
      limitations: ['Canonical English is shown.'],
      retryable: false,
      failureCode: 'OPENROUTER_INVALID_RESPONSE',
    });
    const service = new ReportLocalizationService(
      { findOne: jest.fn(() => ({ lean: () => ({ exec }) })) } as never,
      { execute: jest.fn() } as never,
      {} as never,
    );

    await expect(
      service.present(
        report,
        { summary: 'Canonical English.' },
        SupportedLanguage.YORUBA,
      ),
    ).resolves.toMatchObject({
      localizationStatus: ReportLocalizationStatus.FALLBACK,
      localizationRetryable: true,
      localizationFailureCode: 'OPENROUTER_INVALID_RESPONSE',
    });
  });

  it('performs one bounded repair when the first output uses the wrong language', async () => {
    const exec = jest.fn().mockResolvedValue(null);
    const findOneAndUpdate = jest.fn(
      (_filter: unknown, update: { $set: { leaseToken: string } }) => ({
        lean: () => ({
          exec: () => Promise.resolve({ leaseToken: update.$set.leaseToken }),
        }),
      }),
    );
    const model = {
      findOne: jest.fn(() => ({ lean: () => ({ exec }) })),
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
      findOneAndUpdate,
    };
    const ai = {
      execute: jest
        .fn()
        .mockResolvedValueOnce({
          output: {
            translations: [
              {
                path: '/summary',
                text: 'Evidence is limited and the conclusion must remain provisional until stronger independent primary sources can be reviewed.',
              },
            ],
          },
          provider: 'GEMINI',
          primaryProvider: 'GEMINI',
          fallbackUsed: false,
          model: 'model-a',
        })
        .mockResolvedValueOnce({
          output: {
            translations: [
              {
                path: '/summary',
                text: 'Les preuves restent limitées et la conclusion doit demeurer provisoire jusqu’à ce que des sources primaires indépendantes plus solides soient examinées.',
              },
            ],
          },
          provider: 'GROQ',
          primaryProvider: 'GROQ',
          fallbackUsed: false,
          model: 'model-b',
        }),
    };
    const languages = {
      detect: jest
        .fn()
        .mockReturnValueOnce({ language: 'en' })
        .mockReturnValueOnce({ language: 'fr' }),
    };
    const service = new ReportLocalizationService(
      model as never,
      ai as never,
      languages as never,
    );

    const result = await service.generate(
      report,
      {
        summary:
          'Evidence remains incomplete and the conclusion must stay provisional until a primary source is available.',
      },
      SupportedLanguage.FRENCH,
      'req-repair',
    );

    expect(ai.execute).toHaveBeenCalledTimes(2);
    expect(ai.execute).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        reasoningEffort: 'none',
        maxProviderCalls: 2,
      }),
    );
    expect(result).toMatchObject({
      summary:
        'Les preuves restent limitées et la conclusion doit demeurer provisoire jusqu’à ce que des sources primaires indépendantes plus solides soient examinées.',
      presentationLanguage: SupportedLanguage.FRENCH,
      localizationStatus: ReportLocalizationStatus.COMPLETE,
    });
    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(model.updateOne).toHaveBeenCalledTimes(2);
  });
});
