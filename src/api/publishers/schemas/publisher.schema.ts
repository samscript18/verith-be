import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  PublisherCredibilityLevel,
  PublisherReviewStatus,
} from '../enums/publisher.enum';

export type PublisherDocument = HydratedDocument<Publisher>;

@Schema({ timestamps: true, collection: 'publishers', versionKey: false })
export class Publisher {
  @Prop({ required: true })
  name!: string;
  @Prop({ required: true, unique: true, index: true })
  domain!: string;
  @Prop({ type: [String], default: [] })
  aliases!: string[];
  @Prop()
  country?: string;
  @Prop({ default: 'WEB_PUBLISHER' })
  sourceType!: string;
  @Prop()
  description?: string;
  @Prop()
  ownershipTransparency?: boolean;
  @Prop()
  editorialPolicyAvailable?: boolean;
  @Prop()
  correctionsPolicyAvailable?: boolean;
  @Prop()
  authorTransparency?: boolean;
  @Prop()
  contactTransparency?: boolean;
  @Prop()
  primarySourceUsage?: boolean;
  @Prop({ required: true, enum: PublisherReviewStatus })
  reviewStatus!: PublisherReviewStatus;
  @Prop({ required: true, enum: PublisherCredibilityLevel })
  credibilityLevel!: PublisherCredibilityLevel;
  @Prop({ required: true })
  methodologyVersion!: string;
  @Prop({ type: [Object], default: [] })
  manualOverrides!: Record<string, unknown>[];
  @Prop({ type: [String], default: [] })
  references!: string[];
  @Prop()
  lastReviewedAt?: Date;
}

export const PublisherSchema = SchemaFactory.createForClass(Publisher);
