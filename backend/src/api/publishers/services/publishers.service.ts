import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { NotFoundException } from '../../../core/exceptions';
import { AuditService } from '../../admin/services/audit.service';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface';
import type {
  PublisherAdminQueryDto,
  PublisherOverrideDto,
} from '../dto/publisher-admin.dto';
import {
  PublisherCredibilityLevel,
  PublisherReviewStatus,
} from '../enums/publisher.enum';
import { Publisher } from '../schemas/publisher.schema';

@Injectable()
export class PublishersService {
  constructor(
    @InjectModel(Publisher.name) private readonly model: Model<Publisher>,
    private readonly audit: AuditService,
  ) {}

  async ensureDiscovered(domain: string, name?: string): Promise<Publisher> {
    return this.model
      .findOneAndUpdate(
        { domain },
        {
          $setOnInsert: {
            domain,
            name: name?.trim() || domain,
            aliases: [],
            sourceType: 'WEB_PUBLISHER',
            reviewStatus: PublisherReviewStatus.UNREVIEWED,
            credibilityLevel: PublisherCredibilityLevel.UNKNOWN,
            methodologyVersion: 'publisher-discovery.v1',
            manualOverrides: [],
            references: [],
          },
        },
        { upsert: true, returnDocument: 'after', runValidators: true },
      )
      .orFail()
      .exec();
  }

  async listAdmin(query: PublisherAdminQueryDto) {
    const records = await this.model
      .find({
        ...(query.search
          ? {
              $or: [
                { name: { $regex: this.escape(query.search), $options: 'i' } },
                {
                  domain: {
                    $regex: this.escape(query.search),
                    $options: 'i',
                  },
                },
              ],
            }
          : {}),
        ...(query.status ? { reviewStatus: query.status } : {}),
        ...(query.credibility ? { credibilityLevel: query.credibility } : {}),
        ...(query.cursor
          ? { _id: { $lt: new Types.ObjectId(query.cursor) } }
          : {}),
      })
      .sort({ _id: -1 })
      .limit(query.limit + 1)
      .lean()
      .exec();
    const hasNextPage = records.length > query.limit;
    const items = records.slice(0, query.limit);
    return {
      items,
      pagination: {
        nextCursor: hasNextPage ? items.at(-1)?._id.toString() : null,
        previousCursor: null,
        hasNextPage,
        limit: query.limit,
      },
    };
  }

  async getAdmin(id: string) {
    const publisher = await this.model.findById(id).lean().exec();
    if (!publisher)
      throw new NotFoundException(
        'The publisher could not be found',
        'PUBLISHER_NOT_FOUND',
      );
    return publisher;
  }

  async override(
    id: string,
    dto: PublisherOverrideDto,
    actor: AuthUser,
    requestId: string,
  ) {
    const publisher = await this.model.findById(id).exec();
    if (!publisher)
      throw new NotFoundException(
        'The publisher could not be found',
        'PUBLISHER_NOT_FOUND',
      );
    const before = {
      reviewStatus: publisher.reviewStatus,
      credibilityLevel: publisher.credibilityLevel,
    };
    const { reason, ...changes } = dto;
    publisher.set({
      ...changes,
      lastReviewedAt: new Date(),
      manualOverrides: [
        ...publisher.manualOverrides,
        {
          actorId: actor.userId,
          reason,
          changedAt: new Date().toISOString(),
          changes,
        },
      ].slice(-50),
    });
    await publisher.save();
    await this.audit.record({
      actor,
      action: 'PUBLISHER_OVERRIDE',
      resourceType: 'PUBLISHER',
      resourceId: id,
      requestId,
      reason,
      safeBefore: before,
      safeAfter: {
        reviewStatus: publisher.reviewStatus,
        credibilityLevel: publisher.credibilityLevel,
      },
    });
    return publisher.toObject();
  }

  private escape(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
