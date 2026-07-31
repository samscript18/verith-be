import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ValidationException } from '../../../core/exceptions';
import { AuditService } from '../../admin/services/audit.service';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface';
import type { UpdateProviderConfigDto } from '../dto/provider-config.dto';
import { AiProviderName } from '../enums/ai-provider-name.enum';
import { ProviderRuntimeConfig } from '../schemas/provider-runtime-config.schema';

const defaults = Object.values(AiProviderName);

@Injectable()
export class ProviderConfigService {
  constructor(
    @InjectModel(ProviderRuntimeConfig.name)
    private readonly model: Model<ProviderRuntimeConfig>,
    private readonly audit: AuditService,
  ) {}

  async get() {
    const stored = await this.model.findOne({ key: 'default' }).lean().exec();
    return {
      enabledProviders: stored?.enabledProviders ?? defaults,
      defaultOrder: stored?.defaultOrder ?? defaults,
      configured: Boolean(stored),
      updatedAt: stored?.updatedAt ?? null,
    };
  }

  async update(
    dto: UpdateProviderConfigDto,
    actor: AuthUser,
    requestId: string,
  ) {
    if (
      new Set(dto.enabledProviders).size !== dto.enabledProviders.length ||
      new Set(dto.defaultOrder).size !== dto.defaultOrder.length ||
      dto.enabledProviders.some(
        (provider) => !dto.defaultOrder.includes(provider),
      )
    )
      throw new ValidationException(
        'Provider lists must be unique and the order must contain every enabled provider',
      );
    const before = await this.get();
    const record = await this.model
      .findOneAndUpdate(
        { key: 'default' },
        {
          $set: {
            enabledProviders: dto.enabledProviders,
            defaultOrder: dto.defaultOrder,
            updatedBy: actor.userId,
          },
        },
        { upsert: true, returnDocument: 'after', runValidators: true },
      )
      .lean()
      .orFail()
      .exec();
    await this.audit.record({
      actor,
      action: 'AI_PROVIDER_CONFIGURATION_UPDATED',
      resourceType: 'AI_PROVIDER_CONFIGURATION',
      resourceId: 'default',
      requestId,
      reason: dto.reason,
      safeBefore: {
        enabledProviders: before.enabledProviders,
        defaultOrder: before.defaultOrder,
      },
      safeAfter: {
        enabledProviders: record.enabledProviders,
        defaultOrder: record.defaultOrder,
      },
    });
    return this.get();
  }
}
