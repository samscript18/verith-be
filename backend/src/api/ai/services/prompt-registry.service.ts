import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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
  ) {}

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
