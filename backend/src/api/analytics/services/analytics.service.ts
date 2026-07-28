import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProviderExecution } from '../../ai/schemas/provider-execution.schema';
import { User } from '../../users/schemas/user.schema';
import { Verification } from '../../verifications/schemas/verification.schema';
import { VerificationStatus } from '../../verifications/enums/verification-status.enum';
import { WhatsAppMessage } from '../../whatsapp/schemas/whatsapp-message.schema';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Verification.name)
    private readonly verifications: Model<Verification>,
    @InjectModel(ProviderExecution.name)
    private readonly providerExecutions: Model<ProviderExecution>,
    @InjectModel(WhatsAppMessage.name)
    private readonly whatsappMessages: Model<WhatsAppMessage>,
  ) {}

  async overview() {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [users, activeUsers, verificationGroups, providerGroups, whatsapp] =
      await Promise.all([
        this.users.countDocuments({ deletedAt: { $exists: false } }),
        this.users.countDocuments({ lastActiveAt: { $gte: since } }),
        this.verifications.aggregate<{
          _id: VerificationStatus;
          count: number;
          averageDurationMs: number | null;
        }>([
          { $match: { createdAt: { $gte: since } } },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
              averageDurationMs: {
                $avg: {
                  $cond: [
                    {
                      $and: [
                        { $ne: ['$processingStartedAt', null] },
                        { $ne: ['$processingCompletedAt', null] },
                      ],
                    },
                    {
                      $subtract: [
                        '$processingCompletedAt',
                        '$processingStartedAt',
                      ],
                    },
                    null,
                  ],
                },
              },
            },
          },
        ]),
        this.providerExecutions.aggregate<{
          _id: string;
          count: number;
          successful: number;
          averageLatencyMs: number | null;
          totalInputTokens: number;
          totalOutputTokens: number;
        }>([
          { $match: { createdAt: { $gte: since } } },
          {
            $group: {
              _id: '$provider',
              count: { $sum: 1 },
              successful: {
                $sum: { $cond: ['$success', 1, 0] },
              },
              averageLatencyMs: { $avg: '$latencyMs' },
              totalInputTokens: { $sum: { $ifNull: ['$inputTokens', 0] } },
              totalOutputTokens: { $sum: { $ifNull: ['$outputTokens', 0] } },
            },
          },
        ]),
        this.whatsappMessages.countDocuments({ createdAt: { $gte: since } }),
      ]);

    const volume = verificationGroups.reduce(
      (sum, group) => sum + group.count,
      0,
    );
    const completed =
      verificationGroups.find(
        (group) => group._id === VerificationStatus.COMPLETED,
      )?.count ?? 0;
    const failed =
      verificationGroups.find(
        (group) => group._id === VerificationStatus.FAILED,
      )?.count ?? 0;
    return {
      period: { days: 30, since },
      users: { total: users, active: activeUsers },
      verifications: {
        volume,
        completed,
        failed,
        completionRate: volume ? completed / volume : 0,
        failureRate: volume ? failed / volume : 0,
        byStatus: verificationGroups.map((group) => ({
          status: group._id,
          count: group.count,
          averageDurationMs: group.averageDurationMs,
        })),
      },
      providers: providerGroups.map((group) => ({
        provider: group._id,
        executions: group.count,
        successRate: group.count ? group.successful / group.count : 0,
        averageLatencyMs: group.averageLatencyMs,
        inputTokens: group.totalInputTokens,
        outputTokens: group.totalOutputTokens,
        cost: {
          state: 'UNAVAILABLE',
          reason: 'Provider cost is not persisted',
        },
      })),
      whatsapp: { messages: whatsapp },
    };
  }
}
