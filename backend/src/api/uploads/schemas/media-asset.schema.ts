import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { AssetStatus } from '../enums/asset-status.enum';
import { AssetType } from '../enums/asset-type.enum';

@Schema({ timestamps: true, collection: 'media_assets', versionKey: 'version' })
export class MediaAsset {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  ownerId!: Types.ObjectId;

  @Prop({ enum: AssetType, required: true })
  assetType!: AssetType;

  @Prop({ default: 'CLOUDINARY' })
  provider!: string;

  @Prop({ required: true, unique: true })
  publicId!: string;

  @Prop({ required: true })
  resourceType!: string;

  @Prop()
  format?: string;

  @Prop()
  mimeType?: string;

  @Prop()
  bytes?: number;

  @Prop()
  width?: number;

  @Prop()
  height?: number;

  @Prop()
  duration?: number;

  @Prop()
  secureUrl?: string;

  @Prop()
  providerVersion?: number;

  @Prop()
  signatureVerifiedAt?: Date;

  @Prop({ enum: AssetStatus, default: AssetStatus.PENDING, index: true })
  status!: AssetStatus;

  @Prop()
  attachedResourceType?: string;

  @Prop({ type: Types.ObjectId })
  attachedResourceId?: Types.ObjectId;

  @Prop({ default: 'OWNER_MANAGED' })
  retentionPolicy!: string;

  @Prop()
  deleteAfter?: Date;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Object, default: {} })
  metadata!: Record<string, unknown>;

  createdAt!: Date;
  updatedAt!: Date;
}

export type MediaAssetDocument = HydratedDocument<MediaAsset>;
export const MediaAssetSchema = SchemaFactory.createForClass(MediaAsset);
MediaAssetSchema.index({ ownerId: 1, createdAt: -1 });
MediaAssetSchema.index({ status: 1, createdAt: 1 });
MediaAssetSchema.index({ deleteAfter: 1 }, { sparse: true });
