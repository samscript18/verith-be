import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProviderExecution } from '../../ai/schemas/provider-execution.schema';
import { User } from '../../users/schemas/user.schema';
import { Verification } from '../../verifications/schemas/verification.schema';
import { VerificationStatus } from '../../verifications/enums/verification-status.enum';
import { WhatsAppMessage } from '../../whatsapp/schemas/whatsapp-message.schema';
import type { RecordAnalyticsEventDto } from '../dto/analytics-event.dto';
import { AnalyticsEvent } from '../schemas/analytics-event.schema';
import { Mission } from '../../missions/schemas/mission.schema';
import { MissionParticipant } from '../../missions/schemas/mission-participant.schema';
import { MissionAssessmentAttempt } from '../../missions/schemas/mission-assessment-attempt.schema';
import { ReportFeedback } from '../../reports/schemas/report-feedback.schema';
import {
  AssessmentPhase,
  MissionParticipantStatus,
} from '../../missions/enums/mission.enum';

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
    @InjectModel(AnalyticsEvent.name)
    private readonly events: Model<AnalyticsEvent>,
    @InjectModel(Mission.name) private readonly missions: Model<Mission>,
    @InjectModel(MissionParticipant.name)
    private readonly missionParticipants: Model<MissionParticipant>,
    @InjectModel(MissionAssessmentAttempt.name)
    private readonly missionAttempts: Model<MissionAssessmentAttempt>,
    @InjectModel(ReportFeedback.name)
    private readonly reportFeedback: Model<ReportFeedback>,
  ) {}

  async recordEvent(userId: string, dto: RecordAnalyticsEventDto) {
    await this.events.create({
      userId: new Types.ObjectId(userId),
      event: dto.event,
      ...(dto.verificationId
        ? { verificationId: new Types.ObjectId(dto.verificationId) }
        : {}),
      ...(dto.reportId ? { reportId: new Types.ObjectId(dto.reportId) } : {}),
      ...(dto.missionId
        ? { missionId: new Types.ObjectId(dto.missionId) }
        : {}),
      ...(dto.sourceType ? { sourceType: dto.sourceType } : {}),
      ...(dto.mode ? { mode: dto.mode } : {}),
      ...(dto.feature ? { feature: dto.feature } : {}),
    });
  }

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
          reason: 'Provider cost is not stored',
        },
      })),
      whatsapp: { messages: whatsapp },
    };
  }

  async pilots() {
    const missions = await this.missions
      .find()
      .select('title slug status startsAt endsAt organization')
      .sort({ startsAt: -1 })
      .lean()
      .exec();
    const records = await Promise.all(
      missions.map(async (mission) => {
        const missionId = mission._id;
        const [
          participants,
          completed,
          baselineParticipants,
          followUpParticipants,
          scoreGroups,
          competencyGroups,
        ] = await Promise.all([
          this.missionParticipants.countDocuments({ missionId }),
          this.missionParticipants.countDocuments({
            missionId,
            status: MissionParticipantStatus.COMPLETED,
          }),
          this.missionParticipants.countDocuments({
            missionId,
            baselineScore: { $exists: true },
          }),
          this.missionParticipants.countDocuments({
            missionId,
            followUpScore: { $exists: true },
          }),
          this.missionParticipants.aggregate<{
            _id: null;
            baseline: number | null;
            followUp: number | null;
          }>([
            { $match: { missionId } },
            {
              $group: {
                _id: null,
                baseline: { $avg: '$baselineScore' },
                followUp: { $avg: '$followUpScore' },
              },
            },
          ]),
          this.missionAttempts.aggregate<{
            _id: { phase: AssessmentPhase; competency: string };
            averageScore: number;
            responses: number;
          }>([
            { $match: { missionId } },
            { $unwind: '$competencyScores' },
            {
              $group: {
                _id: {
                  phase: '$phase',
                  competency: '$competencyScores.competency',
                },
                averageScore: { $avg: '$competencyScores.score' },
                responses: { $sum: 1 },
              },
            },
          ]),
        ]);
        const minimumGroupSize = 5;
        const thresholdMet = followUpParticipants >= minimumGroupSize;
        const scores = scoreGroups[0];
        const competencies = new Map<
          string,
          { baseline: number | null; followUp: number | null }
        >();
        for (const group of competencyGroups) {
          const entry = competencies.get(group._id.competency) ?? {
            baseline: null,
            followUp: null,
          };
          if (group._id.phase === AssessmentPhase.BASELINE)
            entry.baseline = group.averageScore;
          else entry.followUp = group.averageScore;
          competencies.set(group._id.competency, entry);
        }
        return {
          id: missionId.toString(),
          title: mission.title,
          slug: mission.slug,
          status: mission.status,
          organization: mission.organization,
          startsAt: mission.startsAt,
          endsAt: mission.endsAt,
          participation: {
            joined: participants,
            completed,
            baselineCompleted: baselineParticipants,
            followUpCompleted: followUpParticipants,
            completionRate: participants ? completed / participants : 0,
          },
          impact: thresholdMet
            ? {
                state: 'AVAILABLE',
                baselineAverage: scores?.baseline ?? null,
                followUpAverage: scores?.followUp ?? null,
                averageChange:
                  scores?.baseline != null && scores.followUp != null
                    ? scores.followUp - scores.baseline
                    : null,
                competencies: [...competencies.entries()]
                  .map(([competency, values]) => ({
                    competency,
                    ...values,
                    change:
                      values.baseline != null && values.followUp != null
                        ? values.followUp - values.baseline
                        : null,
                  }))
                  .filter((item) => {
                    const followUp = competencyGroups.find(
                      (group) =>
                        group._id.competency === item.competency &&
                        group._id.phase === AssessmentPhase.FOLLOW_UP,
                    );
                    return (followUp?.responses ?? 0) >= minimumGroupSize;
                  }),
              }
            : {
                state: 'WITHHELD_FOR_PRIVACY',
                minimumGroupSize,
                currentGroupSize: followUpParticipants,
              },
          limitation:
            'Mission comparisons describe performance in this pilot group. They do not establish that Verith caused broader media-literacy improvement.',
        };
      }),
    );
    const [eventGroups, feedbackGroups] = await Promise.all([
      this.events.aggregate<{ _id: string; count: number }>([
        { $group: { _id: '$event', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      this.reportFeedback.aggregate<{ _id: string; count: number }>([
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]),
    ]);
    return {
      privacy: {
        minimumGroupSize: 5,
        individualResponsesIncluded: false,
        privateInvestigationsIncluded: false,
      },
      missions: records,
      interactions: eventGroups.map((item) => ({
        event: item._id,
        count: item.count,
      })),
      reportFeedback: feedbackGroups.map((item) => ({
        type: item._id,
        count: item.count,
      })),
    };
  }
}
