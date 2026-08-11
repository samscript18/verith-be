import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditService } from '../../admin/services/audit.service';
import type { AuthUser } from '../../auth/interfaces/auth-user.interface';
import type {
  CreatePromptVersionDto,
  PromptAdminQueryDto,
} from '../dto/prompt-admin.dto';
import {
  NotFoundException,
  ValidationException,
} from '../../../core/exceptions';
import { AiProviderName } from '../enums/ai-provider-name.enum';
import { PromptStatus } from '../enums/prompt-status.enum';
import { AiPrompt, type AiPromptDocument } from '../schemas/prompt.schema';

@Injectable()
export class PromptRegistryService {
  constructor(
    @InjectModel(AiPrompt.name) private readonly model: Model<AiPrompt>,
    private readonly audit: AuditService,
  ) {}

  async listAdmin(query: PromptAdminQueryDto) {
    const records = await this.model
      .find({
        ...(query.key ? { key: query.key } : {}),
        ...(query.status ? { status: query.status } : {}),
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
    const prompt = await this.model.findById(id).lean().exec();
    if (!prompt)
      throw new NotFoundException(
        'The prompt version could not be found',
        'AI_PROMPT_NOT_FOUND',
      );
    return prompt;
  }

  async createVersion(
    dto: CreatePromptVersionDto,
    actor: AuthUser,
    requestId: string,
  ) {
    const latest = await this.model
      .findOne({ key: dto.key })
      .sort({ version: -1 })
      .lean()
      .exec();
    const { reason, ...values } = dto;
    const prompt = await this.model.create({
      ...values,
      version: (latest?.version ?? 0) + 1,
      status: PromptStatus.DRAFT,
      createdBy: actor.userId,
      publishedBy: actor.userId,
    });
    await this.audit.record({
      actor,
      action: 'AI_PROMPT_VERSION_CREATED',
      resourceType: 'AI_PROMPT',
      resourceId: prompt.id,
      requestId,
      reason,
      safeAfter: {
        key: prompt.key,
        version: prompt.version,
        status: prompt.status,
      },
    });
    return prompt;
  }

  async publish(
    id: string,
    reason: string,
    actor: AuthUser,
    requestId: string,
    rollback = false,
  ) {
    const prompt = await this.model.findById(id).exec();
    if (!prompt)
      throw new NotFoundException(
        'The prompt version could not be found',
        'AI_PROMPT_NOT_FOUND',
      );
    const before = { status: prompt.status };
    await this.model.updateMany(
      {
        key: prompt.key,
        status: PromptStatus.PUBLISHED,
        _id: { $ne: prompt._id },
      },
      { $set: { status: PromptStatus.DEPRECATED, deprecatedAt: new Date() } },
    );
    prompt.status = PromptStatus.PUBLISHED;
    prompt.publishedBy = actor.userId;
    prompt.publishedAt = new Date();
    prompt.set('deprecatedAt', undefined);
    await prompt.save();
    await this.audit.record({
      actor,
      action: rollback ? 'AI_PROMPT_ROLLED_BACK' : 'AI_PROMPT_PUBLISHED',
      resourceType: 'AI_PROMPT',
      resourceId: id,
      requestId,
      reason,
      safeBefore: before,
      safeAfter: {
        key: prompt.key,
        version: prompt.version,
        status: prompt.status,
      },
    });
    return prompt;
  }

  async resolvePublished(
    key: string,
    provider: AiProviderName,
    model: string,
    outputSchemaVersion: string,
  ): Promise<AiPromptDocument> {
    const prompt = await this.model
      .findOne({
        key,
        status: PromptStatus.PUBLISHED,
        outputSchemaVersion,
        supportedProviders: provider,
        $or: [{ supportedModels: { $size: 0 } }, { supportedModels: model }],
      })
      .sort({ version: -1 })
      .exec();
    if (!prompt) {
      throw new NotFoundException(
        'No published prompt supports the selected provider and model',
        'AI_PROMPT_NOT_FOUND',
      );
    }
    return prompt;
  }

  render(template: string, variables: Record<string, string>): string {
    const missing = new Set<string>();
    const rendered = template.replace(
      /\{\{([a-zA-Z0-9_]+)\}\}/g,
      (_match, key: string) => {
        const value = variables[key];
        if (value === undefined) {
          missing.add(key);
          return '';
        }
        return value;
      },
    );
    if (missing.size) {
      throw new ValidationException(
        `Prompt variables are missing: ${[...missing].join(', ')}`,
      );
    }
    return rendered;
  }
}
