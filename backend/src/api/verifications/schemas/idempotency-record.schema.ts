import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({
  timestamps: true,
  collection: 'idempotency_records',
  versionKey: false,
})
export class IdempotencyRecord {
  @Prop({ type: Types.ObjectId, required: true })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  key!: string;

  @Prop({ required: true })
  requestFingerprint!: string;

  @Prop({ type: Types.ObjectId, required: true })
  resourceId!: Types.ObjectId;

  @Prop({ required: true })
  expiresAt!: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export type IdempotencyRecordDocument = HydratedDocument<IdempotencyRecord>;
export const IdempotencyRecordSchema =
  SchemaFactory.createForClass(IdempotencyRecord);
IdempotencyRecordSchema.index({ userId: 1, key: 1 }, { unique: true });
IdempotencyRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
