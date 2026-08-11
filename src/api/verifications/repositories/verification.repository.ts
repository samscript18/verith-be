import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { VerificationStatus } from '../enums/verification-status.enum';
import {
  Verification,
  type VerificationDocument,
} from '../schemas/verification.schema';

@Injectable()
export class VerificationRepository {
  constructor(
    @InjectModel(Verification.name)
    private readonly model: Model<Verification>,
  ) {}

  create(
    data: Partial<Verification> & { _id?: Types.ObjectId },
  ): Promise<VerificationDocument> {
    return this.model.create(data);
  }

  findOwned(userId: string, id: string): Promise<VerificationDocument | null> {
    return this.model
      .findOne({
        _id: id,
        userId: new Types.ObjectId(userId),
        status: { $ne: VerificationStatus.DELETED },
      })
      .exec();
  }

  findById(id: string): Promise<VerificationDocument | null> {
    return this.model.findById(id).exec();
  }

  async list(
    userId: string,
    limit: number,
    cursor?: string,
    status?: VerificationStatus,
  ): Promise<VerificationDocument[]> {
    return this.model
      .find({
        userId: new Types.ObjectId(userId),
        status: status ?? { $ne: VerificationStatus.DELETED },
        ...(cursor ? { _id: { $lt: new Types.ObjectId(cursor) } } : {}),
      })
      .sort({ _id: -1 })
      .limit(limit + 1)
      .exec();
  }

  modelRef(): Model<Verification> {
    return this.model;
  }
}
