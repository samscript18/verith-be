import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import type { Queue } from 'bullmq';
import { v2 as cloudinary } from 'cloudinary';
import { randomUUID } from 'node:crypto';
import { Model, Types } from 'mongoose';
import {
  ExternalProviderException,
  ValidationException,
} from '../../../core/exceptions';
import type { CloudinaryConfig } from '../../../shared/config';
import { AssetStatus } from '../../uploads/enums/asset-status.enum';
import { AssetType } from '../../uploads/enums/asset-type.enum';
import { MediaAsset } from '../../uploads/schemas/media-asset.schema';
import { User } from '../../users/schemas/user.schema';
import { VerificationSourceType } from '../../verifications/enums/verification-source-type.enum';
import { VerificationService } from '../../verifications/services/verification.service';
import {
  WhatsAppDirection,
  WhatsAppMessageStatus,
  WhatsAppMessageType,
} from '../enums/whatsapp.enum';
import { WHATSAPP_INBOUND_JOB, WHATSAPP_QUEUE } from '../whatsapp.constants';
import { WhatsAppMessage } from '../schemas/whatsapp-message.schema';
import { MetaWhatsAppService } from './meta-whatsapp.service';
import { WhatsAppLinkService } from './whatsapp-link.service';

interface InboundJob {
  messageId: string;
  phoneNumber: string;
  type: 'text' | 'image' | 'audio';
  text?: string;
  mediaId?: string;
  mimeHint?: string;
}

@Injectable()
export class WhatsAppService {
  private readonly cloudinaryConfig: CloudinaryConfig;
  constructor(
    @InjectModel(WhatsAppMessage.name)
    private readonly messages: Model<WhatsAppMessage>,
    @InjectModel(MediaAsset.name)
    private readonly assets: Model<MediaAsset>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectQueue(WHATSAPP_QUEUE) private readonly queue: Queue<InboundJob>,
    @Inject(forwardRef(() => VerificationService))
    private readonly verifications: VerificationService,
    private readonly links: WhatsAppLinkService,
    private readonly meta: MetaWhatsAppService,
    config: ConfigService,
  ) {
    this.cloudinaryConfig = config.getOrThrow<CloudinaryConfig>('cloudinary');
  }

  async acceptWebhook(body: unknown) {
    const events = this.parseWebhook(body);
    for (const status of events.statuses) await this.applyStatus(status);
    for (const inbound of events.messages) {
      const phoneNumberHash = this.links.phoneHash(inbound.phoneNumber);
      try {
        await this.messages.create({
          wamid: inbound.wamid,
          phoneNumberHash,
          direction: WhatsAppDirection.INBOUND,
          messageType: this.messageType(inbound.type),
          status: WhatsAppMessageStatus.RECEIVED,
          ...(inbound.mediaId ? { mediaId: inbound.mediaId } : {}),
          receivedAt: new Date(),
        });
      } catch (error) {
        if (this.isDuplicate(error)) continue;
        throw error;
      }
      await this.queue.add(
        WHATSAPP_INBOUND_JOB,
        {
          messageId: inbound.wamid,
          phoneNumber: inbound.phoneNumber,
          type: inbound.type,
          ...(inbound.text ? { text: inbound.text } : {}),
          ...(inbound.mediaId ? { mediaId: inbound.mediaId } : {}),
        },
        {
          jobId: `whatsapp-inbound-${inbound.wamid}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      );
    }
    return { accepted: true };
  }

  async processInbound(job: InboundJob) {
    const record = await this.messages.findOne({ wamid: job.messageId }).exec();
    if (!record || record.verificationId) return;
    record.status = WhatsAppMessageStatus.PROCESSING;
    await record.save();
    try {
      if (job.type === 'text' && job.text) {
        const match = /^LINK\s+([A-F0-9]{10})$/i.exec(job.text.trim());
        if (match?.[1]) {
          const linked = await this.links.consumeCode(
            job.phoneNumber,
            match[1],
          );
          if (linked) record.linkedUserId = linked.userId;
          record.status = linked
            ? WhatsAppMessageStatus.READ
            : WhatsAppMessageStatus.IGNORED;
          await record.save();
          await this.sendAndPersist(
            job.phoneNumber,
            linked
              ? 'Your WhatsApp account is now linked to Verith.'
              : 'That link code is invalid or expired.',
          );
          return;
        }
      }
      const link = await this.links.resolve(job.phoneNumber);
      if (!link) {
        record.status = WhatsAppMessageStatus.IGNORED;
        await record.save();
        await this.sendAndPersist(
          job.phoneNumber,
          'Link WhatsApp from your Verith account before submitting content.',
        );
        return;
      }
      record.linkedUserId = link.userId;
      const input = await this.verificationInput(job, link.userId.toString());
      const created = await this.verifications.create(
        link.userId.toString(),
        input,
        `wa:${job.messageId}`,
        `whatsapp-${job.messageId}`,
        true,
      );
      record.verificationId = new Types.ObjectId(String(created.id));
      record.status = WhatsAppMessageStatus.READ;
      await record.save();
      await this.sendAndPersist(
        job.phoneNumber,
        'Your verification was received. Verith will send a summary when analysis completes.',
      );
    } catch (error) {
      record.status = WhatsAppMessageStatus.FAILED;
      record.failedAt = new Date();
      record.failureCode =
        error instanceof ExternalProviderException ||
        error instanceof ValidationException
          ? error.code
          : 'WHATSAPP_PROCESSING_FAILED';
      await record.save();
      throw error;
    }
  }

  async sendCompletion(
    userId: string,
    verificationId: string,
    reportId: string,
  ) {
    const user = await this.users
      .findById(userId)
      .select('notificationPreferences')
      .lean()
      .exec();
    if (!user || user.notificationPreferences.whatsappEnabled === false) return;
    const phoneNumber = await this.links.phoneForUser(userId);
    if (!phoneNumber) return;
    const deepLink = this.meta.config.reportDeepLinkBase
      ? `${this.meta.config.reportDeepLinkBase.replace(/\/$/, '')}/${reportId}`
      : '';
    const wamid = await this.sendAndPersist(
      phoneNumber,
      `Your Verith analysis is complete. The result may include uncertainty or unavailable checks, so review the full evidence and limitations.${deepLink ? ` ${deepLink}` : ''}`,
    );
    await this.messages.updateOne(
      { wamid },
      { $set: { verificationId: new Types.ObjectId(verificationId) } },
    );
  }

  private async verificationInput(job: InboundJob, userId: string) {
    if (job.type === 'text' && job.text) {
      const text = job.text.trim();
      try {
        const url = new URL(text);
        if (['http:', 'https:'].includes(url.protocol))
          return {
            sourceType: VerificationSourceType.WHATSAPP_URL,
            url: url.toString(),
          };
      } catch {
        // It is ordinary text.
      }
      return { sourceType: VerificationSourceType.WHATSAPP_TEXT, text };
    }
    if (!job.mediaId)
      throw new ValidationException('The WhatsApp media identifier is missing');
    const media = await this.meta.getMedia(job.mediaId);
    const audio = job.type === 'audio';
    const allowed = audio
      ? ['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm']
      : ['image/jpeg', 'image/png', 'image/webp'];
    const maxBytes = audio
      ? this.meta.config.maxAudioBytes
      : this.meta.config.maxImageBytes;
    if (!allowed.includes(media.mimeType) || media.bytes.length > maxBytes)
      throw new ValidationException(
        'WhatsApp media type or size is not allowed',
      );
    const assetId = await this.uploadMedia(
      userId,
      media.bytes,
      media.mimeType,
      audio,
    );
    return {
      sourceType: audio
        ? VerificationSourceType.WHATSAPP_AUDIO
        : VerificationSourceType.WHATSAPP_IMAGE,
      mediaAssetId: assetId,
    };
  }

  private async uploadMedia(
    userId: string,
    bytes: Buffer,
    mimeType: string,
    audio: boolean,
  ) {
    if (!this.cloudinaryConfig.configured)
      throw new ExternalProviderException(
        'Cloudinary is not configured',
        'CLOUDINARY_NOT_CONFIGURED',
      );
    const publicId = `${this.cloudinaryConfig.folder}/users/${userId}/whatsapp/${randomUUID()}`;
    const resourceType = audio ? 'video' : 'image';
    const result = await cloudinary.uploader.upload(
      `data:${mimeType};base64,${bytes.toString('base64')}`,
      { public_id: publicId, resource_type: resourceType, overwrite: false },
    );
    const asset = await this.assets.create({
      ownerId: new Types.ObjectId(userId),
      assetType: audio
        ? AssetType.VERIFICATION_AUDIO
        : AssetType.VERIFICATION_IMAGE,
      provider: 'CLOUDINARY',
      publicId,
      resourceType,
      format: result.format,
      mimeType,
      bytes: result.bytes,
      width: result.width,
      height: result.height,
      ...(typeof result.duration === 'number'
        ? { duration: result.duration }
        : {}),
      secureUrl: result.secure_url,
      providerVersion: result.version,
      signatureVerifiedAt: new Date(),
      status: AssetStatus.CONFIRMED,
      metadata: { origin: 'WHATSAPP' },
    });
    return asset.id;
  }

  private async sendAndPersist(phoneNumber: string, text: string) {
    const phoneNumberHash = this.links.phoneHash(phoneNumber);
    try {
      const wamid = await this.meta.sendText(phoneNumber, text);
      await this.messages.create({
        wamid,
        phoneNumberHash,
        direction: WhatsAppDirection.OUTBOUND,
        messageType: WhatsAppMessageType.TEXT,
        status: WhatsAppMessageStatus.SENT,
        sentAt: new Date(),
      });
      return wamid;
    } catch (error) {
      await this.messages.create({
        wamid: `local.${randomUUID()}`,
        phoneNumberHash,
        direction: WhatsAppDirection.OUTBOUND,
        messageType: WhatsAppMessageType.TEXT,
        status: WhatsAppMessageStatus.FAILED,
        failedAt: new Date(),
        failureCode:
          error instanceof ExternalProviderException
            ? error.code
            : 'WHATSAPP_SEND_FAILED',
      });
      throw error;
    }
  }

  private async applyStatus(status: {
    wamid: string;
    status: string;
    failureCode?: string;
  }) {
    const statusMap: Record<string, WhatsAppMessageStatus | undefined> = {
      sent: WhatsAppMessageStatus.SENT,
      delivered: WhatsAppMessageStatus.DELIVERED,
      read: WhatsAppMessageStatus.READ,
      failed: WhatsAppMessageStatus.FAILED,
    };
    const mapped = statusMap[status.status];
    if (!mapped) return;
    const fieldMap: Partial<Record<WhatsAppMessageStatus, string>> = {
      [WhatsAppMessageStatus.SENT]: 'sentAt',
      [WhatsAppMessageStatus.DELIVERED]: 'deliveredAt',
      [WhatsAppMessageStatus.READ]: 'readAt',
      [WhatsAppMessageStatus.FAILED]: 'failedAt',
    };
    const field = fieldMap[mapped];
    if (!field) return;
    await this.messages.updateOne(
      { wamid: status.wamid },
      {
        $set: {
          status: mapped,
          [field]: new Date(),
          ...(status.failureCode ? { failureCode: status.failureCode } : {}),
        },
      },
    );
  }

  private parseWebhook(body: unknown) {
    const messages: Array<{
      wamid: string;
      phoneNumber: string;
      type: 'text' | 'image' | 'audio';
      text?: string;
      mediaId?: string;
    }> = [];
    const statuses: Array<{
      wamid: string;
      status: string;
      failureCode?: string;
    }> = [];
    if (!this.isObject(body) || body.object !== 'whatsapp_business_account')
      throw new ValidationException('Invalid WhatsApp webhook payload');
    const entries = Array.isArray(body.entry) ? body.entry : [];
    for (const entry of entries) {
      if (!this.isObject(entry) || !Array.isArray(entry.changes)) continue;
      for (const change of entry.changes) {
        if (!this.isObject(change) || !this.isObject(change.value)) continue;
        const value = change.value;
        for (const item of Array.isArray(value.messages)
          ? value.messages
          : []) {
          if (
            !this.isObject(item) ||
            typeof item.id !== 'string' ||
            typeof item.from !== 'string' ||
            !['text', 'image', 'audio'].includes(String(item.type))
          )
            continue;
          const type = item.type as 'text' | 'image' | 'audio';
          const content = this.isObject(item[type]) ? item[type] : {};
          messages.push({
            wamid: item.id,
            phoneNumber: item.from,
            type,
            ...(type === 'text' && typeof content.body === 'string'
              ? { text: content.body }
              : {}),
            ...(type !== 'text' && typeof content.id === 'string'
              ? { mediaId: content.id }
              : {}),
          });
        }
        for (const item of Array.isArray(value.statuses)
          ? value.statuses
          : []) {
          if (
            this.isObject(item) &&
            typeof item.id === 'string' &&
            typeof item.status === 'string'
          )
            statuses.push({
              wamid: item.id,
              status: item.status,
              ...(Array.isArray(item.errors) &&
              this.isObject(item.errors[0]) &&
              (typeof item.errors[0].code === 'string' ||
                typeof item.errors[0].code === 'number')
                ? { failureCode: String(item.errors[0].code) }
                : {}),
            });
        }
      }
    }
    return { messages, statuses };
  }

  private messageType(type: string) {
    return type === 'image'
      ? WhatsAppMessageType.IMAGE
      : type === 'audio'
        ? WhatsAppMessageType.AUDIO
        : WhatsAppMessageType.TEXT;
  }
  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
  private isDuplicate(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }
}
