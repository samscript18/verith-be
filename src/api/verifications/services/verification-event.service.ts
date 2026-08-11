import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { VerificationEventStatus } from '../enums/verification-event-status.enum';
import { VerificationStage } from '../enums/verification-stage.enum';
import {
  VerificationEvent,
  type VerificationEventDocument,
} from '../schemas/verification-event.schema';
import { Verification } from '../schemas/verification.schema';

export interface AppendEventInput {
  verificationId: string;
  stage: VerificationStage;
  status: VerificationEventStatus;
  progress: number;
  messageCode: string;
  safeMessage: string;
  requestId: string;
  jobId?: string;
  metrics?: Record<string, number>;
}

@Injectable()
export class VerificationEventService {
  constructor(
    @InjectModel(VerificationEvent.name)
    private readonly eventModel: Model<VerificationEvent>,
    @InjectModel(Verification.name)
    private readonly verificationModel: Model<Verification>,
    private readonly emitter: EventEmitter2,
  ) {}

  async append(input: AppendEventInput): Promise<VerificationEventDocument> {
    const verification = await this.verificationModel
      .findByIdAndUpdate(
        input.verificationId,
        { $inc: { eventSequence: 1 } },
        { returnDocument: 'after', projection: { eventSequence: 1 } },
      )
      .lean<{ eventSequence: number }>()
      .exec();
    if (!verification)
      throw new Error('Verification disappeared during event append');
    const event = await this.eventModel.create({
      verificationId: new Types.ObjectId(input.verificationId),
      stage: input.stage,
      status: input.status,
      progress: input.progress,
      messageCode: input.messageCode,
      safeMessage: input.safeMessage,
      occurredAt: new Date(),
      sequence: verification.eventSequence,
      requestId: input.requestId,
      ...(input.jobId ? { jobId: input.jobId } : {}),
      ...(input.metrics ? { metrics: input.metrics } : {}),
    });
    this.emitter.emit(
      this.channel(input.verificationId),
      this.toResponse(event),
    );
    return event;
  }

  list(
    verificationId: string,
    after = 0,
  ): Promise<VerificationEventDocument[]> {
    return this.eventModel
      .find({
        verificationId: new Types.ObjectId(verificationId),
        sequence: { $gt: after },
      })
      .sort({ sequence: 1 })
      .limit(500)
      .exec();
  }

  channel(verificationId: string): string {
    return `verification.${verificationId}`;
  }

  toResponse(event: VerificationEventDocument): Record<string, unknown> {
    return {
      id: event.id,
      verificationId: event.verificationId.toString(),
      stage: event.stage,
      status: event.status,
      progress: event.progress,
      messageCode: event.messageCode,
      safeMessage: event.safeMessage,
      metrics: event.metrics,
      occurredAt: event.occurredAt,
      sequence: event.sequence,
    };
  }
}
