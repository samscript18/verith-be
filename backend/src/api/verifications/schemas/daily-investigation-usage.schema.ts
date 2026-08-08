import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { UsageReservationStatus } from '../enums/usage-reservation-status.enum';

@Schema({ _id: false })
export class DailyUsageReservation {
  @Prop({ type: Types.ObjectId, required: true })
  verificationId!: Types.ObjectId;

  @Prop({ default: 0, min: 0 })
  attempt!: number;

  @Prop({ required: true, min: 1 })
  cost!: number;

  @Prop({ enum: UsageReservationStatus, required: true })
  status!: UsageReservationStatus;

  @Prop({ required: true })
  reservedAt!: Date;

  @Prop()
  transitionedAt?: Date;
}

const DailyUsageReservationSchema = SchemaFactory.createForClass(
  DailyUsageReservation,
);

@Schema({
  timestamps: true,
  collection: 'daily_investigation_usage',
  versionKey: 'version',
})
export class DailyInvestigationUsage {
  @Prop({ type: Types.ObjectId, required: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, match: /^\d{4}-\d{2}-\d{2}$/ })
  dateKey!: string;

  @Prop({ required: true })
  timezone!: string;

  @Prop({ required: true, min: 1 })
  limit!: number;

  @Prop({ default: 0, min: 0 })
  used!: number;

  @Prop({ default: 0, min: 0 })
  reserved!: number;

  @Prop({ default: 0, min: 0 })
  released!: number;

  @Prop({ type: [DailyUsageReservationSchema], default: [] })
  reservations!: DailyUsageReservation[];

  createdAt!: Date;
  updatedAt!: Date;
}

export type DailyInvestigationUsageDocument =
  HydratedDocument<DailyInvestigationUsage>;
export const DailyInvestigationUsageSchema = SchemaFactory.createForClass(
  DailyInvestigationUsage,
);
DailyInvestigationUsageSchema.index(
  { userId: 1, dateKey: 1 },
  { unique: true },
);
DailyInvestigationUsageSchema.index({ userId: 1, updatedAt: -1 });
