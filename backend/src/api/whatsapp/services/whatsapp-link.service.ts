import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'node:crypto';
import { Model, Types } from 'mongoose';
import { ConflictException, NotFoundException } from '../../../core/exceptions';
import { MetaWhatsAppService } from './meta-whatsapp.service';
import { WhatsAppLink } from '../schemas/whatsapp-link.schema';

@Injectable()
export class WhatsAppLinkService {
  constructor(
    @InjectModel(WhatsAppLink.name)
    private readonly links: Model<WhatsAppLink>,
    private readonly meta: MetaWhatsAppService,
  ) {}

  async createCode(userId: string) {
    if (!this.meta.config.enabled)
      throw new ConflictException(
        'WhatsApp is not configured',
        'WHATSAPP_NOT_CONFIGURED',
      );
    const code = randomBytes(5).toString('hex').toUpperCase();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.links.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      {
        $set: {
          linkCodeHash: this.hash(`code:${code}`),
          linkCodeExpiresAt: expiresAt,
          consented: false,
        },
        $unset: {
          phoneNumberEncrypted: 1,
          phoneNumberHash: 1,
          linkedAt: 1,
          unlinkedAt: 1,
        },
      },
      { upsert: true, returnDocument: 'after' },
    );
    return { code, expiresAt, instruction: `Send LINK ${code} to Verith.` };
  }

  async consumeCode(phoneNumber: string, code: string) {
    const link = await this.links
      .findOneAndUpdate(
        {
          linkCodeHash: this.hash(`code:${code.toUpperCase()}`),
          linkCodeExpiresAt: { $gt: new Date() },
          linkedAt: { $exists: false },
        },
        {
          $set: {
            phoneNumberHash: this.phoneHash(phoneNumber),
            phoneNumberEncrypted: this.encrypt(phoneNumber),
            linkedAt: new Date(),
            consented: true,
          },
          $unset: { linkCodeHash: 1, linkCodeExpiresAt: 1, unlinkedAt: 1 },
        },
        { returnDocument: 'after' },
      )
      .exec();
    return link;
  }

  async resolve(phoneNumber: string) {
    return this.links
      .findOne({
        phoneNumberHash: this.phoneHash(phoneNumber),
        linkedAt: { $exists: true },
        unlinkedAt: { $exists: false },
        consented: true,
      })
      .exec();
  }

  async status(userId: string) {
    const link = await this.links
      .findOne({ userId: new Types.ObjectId(userId) })
      .select('linkedAt consented')
      .lean()
      .exec();
    return { linked: Boolean(link?.linkedAt && link.consented) };
  }

  async phoneForUser(userId: string) {
    const link = await this.links
      .findOne({
        userId: new Types.ObjectId(userId),
        linkedAt: { $exists: true },
        unlinkedAt: { $exists: false },
        consented: true,
      })
      .select('+phoneNumberEncrypted')
      .exec();
    return link?.phoneNumberEncrypted
      ? this.decrypt(link.phoneNumberEncrypted)
      : null;
  }

  async unlink(userId: string) {
    const result = await this.links.updateOne(
      {
        userId: new Types.ObjectId(userId),
        linkedAt: { $exists: true },
        unlinkedAt: { $exists: false },
      },
      {
        $set: { unlinkedAt: new Date(), consented: false },
        $unset: { phoneNumberEncrypted: 1, phoneNumberHash: 1 },
      },
    );
    if (!result.modifiedCount)
      throw new NotFoundException(
        'A linked WhatsApp account was not found',
        'WHATSAPP_LINK_NOT_FOUND',
      );
  }

  phoneHash(phoneNumber: string) {
    return this.hash(`phone:${phoneNumber}`);
  }
  private hash(value: string) {
    return createHmac('sha256', this.meta.config.hashingPepper)
      .update(value)
      .digest('hex');
  }
  private encrypt(value: string) {
    const key = createHash('sha256')
      .update(this.meta.config.encryptionKey)
      .digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    return [
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      encrypted.toString('base64url'),
    ].join('.');
  }
  private decrypt(value: string) {
    const [ivValue, tagValue, encryptedValue] = value.split('.');
    if (!ivValue || !tagValue || !encryptedValue)
      throw new Error('Invalid encrypted WhatsApp linkage');
    const key = createHash('sha256')
      .update(this.meta.config.encryptionKey)
      .digest();
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(ivValue, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
