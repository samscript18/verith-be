import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { UserRole } from '../../users/enums/user-role.enum';

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'audit_logs',
  versionKey: false,
})
export class AuditLog {
  @Prop({ type: Types.ObjectId, required: true })
  actorId!: Types.ObjectId;

  @Prop({ enum: UserRole, required: true })
  actorRole!: UserRole;

  @Prop({ required: true, maxlength: 120 })
  action!: string;

  @Prop({ required: true, maxlength: 80 })
  resourceType!: string;

  @Prop({ required: true, maxlength: 120 })
  resourceId!: string;

  @Prop({ required: true, maxlength: 128 })
  requestId!: string;

  @Prop({ maxlength: 64 })
  ipHash?: string;

  @Prop({ maxlength: 200 })
  userAgentSummary?: string;

  @Prop({ type: Object })
  safeBefore?: Record<string, unknown>;

  @Prop({ type: Object })
  safeAfter?: Record<string, unknown>;

  @Prop({ required: true, maxlength: 1000 })
  reason!: string;

  createdAt!: Date;
}

export type AuditLogDocument = HydratedDocument<AuditLog>;
export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ actorId: 1, createdAt: -1, _id: -1 });
AuditLogSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
