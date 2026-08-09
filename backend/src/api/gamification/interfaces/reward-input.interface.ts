import { RewardTransactionType } from '../enums/gamification.enum';

export interface RewardInput {
  type: RewardTransactionType;
  idempotencyReference: string;
  xp: number;
  truthPoints: number;
  metadata?: Record<string, unknown>;
  createdBy?: string;
  occurredAt?: Date;
}
