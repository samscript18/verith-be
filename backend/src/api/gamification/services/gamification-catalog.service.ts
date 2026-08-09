import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FIXED_BADGE_CATALOG } from '../constants/badge-catalog';
import { Badge } from '../schemas/badge.schema';
import { User } from '../../users/schemas/user.schema';
import { UserRole } from '../../users/enums/user-role.enum';
import { UserStatus } from '../../users/enums/user-status.enum';

@Injectable()
export class GamificationCatalogService implements OnApplicationBootstrap {
  private readonly logger = new Logger(GamificationCatalogService.name);

  constructor(
    @InjectModel(Badge.name) private readonly badges: Model<Badge>,
    @InjectModel(User.name) private readonly users: Model<User>,
  ) {}

  async onApplicationBootstrap() {
    const owner = await this.users
      .findOne({ role: UserRole.SUPER_ADMIN, status: UserStatus.ACTIVE })
      .select('_id')
      .lean()
      .exec();
    for (const definition of FIXED_BADGE_CATALOG) {
      await this.badges.updateOne(
        { $or: [{ code: definition.code }, { slug: definition.slug }] },
        {
          $set: definition,
          $setOnInsert: {
            active: true,
            ...(owner ? { createdBy: new Types.ObjectId(owner._id) } : {}),
          },
        },
        { upsert: true, runValidators: true },
      );
    }
    this.logger.log({
      event: 'fixed_badge_catalog_ready',
      count: FIXED_BADGE_CATALOG.length,
      ownership: owner ? 'SUPER_ADMIN' : 'SYSTEM',
      backfill: 'LAZY_VERSIONED',
    });
  }
}
