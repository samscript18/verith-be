import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { SearchProviderName } from '../enums/search-provider-name.enum';

export type SearchExecutionDocument = HydratedDocument<SearchExecution>;

@Schema({ timestamps: true, versionKey: false })
export class SearchExecution {
  @Prop({ type: Types.ObjectId, index: true })
  verificationId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, index: true })
  claimId?: Types.ObjectId;

  @Prop({ required: true, index: true })
  requestId!: string;

  @Prop({ required: true, enum: SearchProviderName })
  provider!: SearchProviderName;

  @Prop({ enum: SearchProviderName })
  primaryProvider?: SearchProviderName;

  @Prop({ default: false })
  fallbackUsed?: boolean;

  @Prop({ required: true })
  queryFingerprint!: string;

  @Prop()
  providerRequestId?: string;

  @Prop({ required: true })
  startedAt!: Date;

  @Prop({ required: true })
  endedAt!: Date;

  @Prop({ required: true, min: 0 })
  latencyMs!: number;

  @Prop({ required: true })
  success!: boolean;

  @Prop()
  safeFailureCode?: string;

  @Prop({ min: 0 })
  resultCount?: number;

  @Prop({ min: 0 })
  creditsUsed?: number;
}

export const SearchExecutionSchema =
  SchemaFactory.createForClass(SearchExecution);
