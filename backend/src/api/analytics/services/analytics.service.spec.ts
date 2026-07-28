import type { Model } from 'mongoose';
import type { ProviderExecution } from '../../ai/schemas/provider-execution.schema';
import type { User } from '../../users/schemas/user.schema';
import type { Verification } from '../../verifications/schemas/verification.schema';
import type { WhatsAppMessage } from '../../whatsapp/schemas/whatsapp-message.schema';
import { VerificationStatus } from '../../verifications/enums/verification-status.enum';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  it('calculates real rates from persisted aggregation results', async () => {
    const users = {
      countDocuments: jest
        .fn()
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(40),
    };
    const verifications = {
      aggregate: jest.fn().mockResolvedValue([
        {
          _id: VerificationStatus.COMPLETED,
          count: 8,
          averageDurationMs: 1200,
        },
        { _id: VerificationStatus.FAILED, count: 2, averageDurationMs: null },
      ]),
    };
    const providers = {
      aggregate: jest.fn().mockResolvedValue([
        {
          _id: 'GEMINI',
          count: 4,
          successful: 3,
          averageLatencyMs: 250,
          totalInputTokens: 100,
          totalOutputTokens: 20,
        },
      ]),
    };
    const whatsapp = { countDocuments: jest.fn().mockResolvedValue(6) };
    const service = new AnalyticsService(
      users as unknown as Model<User>,
      verifications as unknown as Model<Verification>,
      providers as unknown as Model<ProviderExecution>,
      whatsapp as unknown as Model<WhatsAppMessage>,
    );

    await expect(service.overview()).resolves.toMatchObject({
      users: { total: 100, active: 40 },
      verifications: {
        volume: 10,
        completed: 8,
        failed: 2,
        completionRate: 0.8,
        failureRate: 0.2,
      },
      providers: [{ provider: 'GEMINI', successRate: 0.75 }],
      whatsapp: { messages: 6 },
    });
  });
});
