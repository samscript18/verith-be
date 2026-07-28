import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Model } from 'mongoose';
import { AppModule } from '../../src/app.module';
import { AiProviderName } from '../../src/api/ai/enums/ai-provider-name.enum';
import { PromptStatus } from '../../src/api/ai/enums/prompt-status.enum';
import { AiPrompt } from '../../src/api/ai/schemas/prompt.schema';
import { PromptRegistryService } from '../../src/api/ai/services/prompt-registry.service';
import { NotFoundException } from '../../src/core/exceptions';

describe('AI prompt registry persistence (integration)', () => {
  let moduleRef: TestingModule;
  let model: Model<AiPrompt>;
  let registry: PromptRegistryService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    await moduleRef.init();
    model = moduleRef.get<Model<AiPrompt>>(getModelToken(AiPrompt.name));
    registry = moduleRef.get(PromptRegistryService);
  });

  afterAll(async () => {
    await model.deleteMany({ key: 'integration.prompt' }).exec();
    await moduleRef.close();
  });

  it('resolves only the latest published compatible prompt', async () => {
    await model.create([
      {
        key: 'integration.prompt',
        task: 'TEST',
        version: 1,
        status: PromptStatus.DEPRECATED,
        systemPrompt: 'old',
        userPromptTemplate: '{{content}}',
        supportedProviders: [AiProviderName.GROQ],
        supportedModels: [],
        outputSchemaVersion: '1',
        changeSummary: 'old',
      },
      {
        key: 'integration.prompt',
        task: 'TEST',
        version: 2,
        status: PromptStatus.PUBLISHED,
        systemPrompt: 'current',
        userPromptTemplate: '{{content}}',
        supportedProviders: [AiProviderName.GROQ],
        supportedModels: ['configured-model'],
        outputSchemaVersion: '1',
        publishedAt: new Date(),
        changeSummary: 'published',
      },
    ]);

    const prompt = await registry.resolvePublished(
      'integration.prompt',
      AiProviderName.GROQ,
      'configured-model',
      '1',
    );
    expect(prompt.version).toBe(2);
    await expect(
      registry.resolvePublished(
        'integration.prompt',
        AiProviderName.GEMINI,
        'configured-model',
        '1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
