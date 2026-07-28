import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { UserRole } from '../enums/user-role.enum';
import { UserStatus } from '../enums/user-status.enum';

@Schema({ timestamps: true, collection: 'users', versionKey: 'version' })
export class User {
  @Prop({ required: true, trim: true })
  email!: string;

  @Prop({ required: true, unique: true, index: true })
  emailNormalized!: string;

  @Prop({ required: true, trim: true })
  username!: string;

  @Prop({ required: true, unique: true, index: true })
  usernameNormalized!: string;

  @Prop({ required: true, select: false })
  passwordHash!: string;

  @Prop({ enum: UserRole, default: UserRole.USER })
  role!: UserRole;

  @Prop({ enum: UserStatus, default: UserStatus.PENDING_VERIFICATION })
  status!: UserStatus;

  @Prop()
  firstName?: string;

  @Prop()
  lastName?: string;

  @Prop()
  displayName?: string;

  @Prop({ maxlength: 500 })
  bio?: string;

  @Prop()
  avatar?: string;

  @Prop({ default: 'en' })
  preferredLanguage!: string;

  @Prop({ default: 'UTC' })
  timezone!: string;

  @Prop({ default: 'system' })
  theme!: string;

  @Prop({ type: Object, default: {} })
  notificationPreferences!: Record<string, boolean>;

  @Prop({ type: Object, default: { publicProfile: false, leaderboard: true } })
  privacyPreferences!: Record<string, boolean>;

  @Prop()
  emailVerifiedAt?: Date;

  @Prop()
  lastLoginAt?: Date;

  @Prop()
  lastActiveAt?: Date;

  @Prop()
  deletedAt?: Date;

  @Prop()
  deletionRequestedAt?: Date;

  @Prop()
  erasureProcessingAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ status: 1, createdAt: -1 });
UserSchema.index({ role: 1, status: 1 });
