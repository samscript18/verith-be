import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PublisherCredibilityLevel,
  PublisherReviewStatus,
} from '../enums/publisher.enum';
import { Publisher } from '../schemas/publisher.schema';

@Injectable()
export class PublishersService {
  constructor(
    @InjectModel(Publisher.name) private readonly model: Model<Publisher>,
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
}
