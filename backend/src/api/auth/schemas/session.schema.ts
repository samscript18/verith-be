import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'sessions', versionKey: false })
export class Session {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, index: true })
  tokenFamilyId!: string;

  @Prop({ required: true, select: false })
  refreshTokenHash!: string;

  @Prop()
  deviceName?: string;

  @Prop()
  platform?: string;

  @Prop()
  browser?: string;

  @Prop()
  ipHash?: string;

  @Prop()
  userAgentSummary?: string;

  @Prop({ required: true })
  lastUsedAt!: Date;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop()
  revokedAt?: Date;

  @Prop()
  revokedReason?: string;

  @Prop({ type: Types.ObjectId })
  replacedBySessionId?: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}

export type SessionDocument = HydratedDocument<Session>;
export const SessionSchema = SchemaFactory.createForClass(Session);
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
SessionSchema.index({ userId: 1, createdAt: -1 });
SessionSchema.index({ tokenFamilyId: 1, revokedAt: 1 });
