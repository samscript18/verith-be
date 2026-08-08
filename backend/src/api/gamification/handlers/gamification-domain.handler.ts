import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  DomainEventName,
  type DomainEventEnvelope,
} from '../../../core/events/domain-event.contracts';
import { Verification } from '../../verifications/schemas/verification.schema';
import { RewardTransactionType } from '../enums/gamification.enum';
import { GamificationService } from '../services/gamification.service';

@Injectable()
export class GamificationDomainHandler {
  constructor(
    private readonly gamification: GamificationService,
    @InjectModel(Verification.name)
    private readonly verifications: Model<Verification>,
  ) {}

  @OnEvent(DomainEventName.VERIFICATION_COMPLETED)
  async verificationCompleted(
    event: DomainEventEnvelope<DomainEventName.VERIFICATION_COMPLETED>,
  ) {
    const verification = await this.verifications
      .findOne({
        _id: event.payload.verificationId,
        userId: event.payload.userId,
      })
      .select('mode sourceType')
      .lean()
      .exec();
    if (!verification) return;
    await this.gamification.award(event.payload.userId, {
      type: RewardTransactionType.VERIFICATION_COMPLETED,
      idempotencyReference: `verification:${event.payload.verificationId}:completed`,
      xp: 25,
      truthPoints: 10,
      metadata: {
        verificationId: event.payload.verificationId,
        reportId: event.payload.reportId,
        mode: verification.mode,
        sourceType: verification.sourceType,
      },
    });
    await this.gamification.recordEligibleActivity(event.payload.userId);
  }
}
