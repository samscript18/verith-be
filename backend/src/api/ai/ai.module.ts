import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiHealthController } from './controllers/ai-health.controller';
import {
  AI_PROVIDERS,
  type AiProvider,
} from './interfaces/ai-provider.interface';
import { GeminiProvider } from './providers/gemini.provider';
import { GroqProvider } from './providers/groq.provider';
import { OpenRouterProvider } from './providers/openrouter.provider';
import { AiPrompt, AiPromptSchema } from './schemas/prompt.schema';
import {
  ProviderExecution,
  ProviderExecutionSchema,
} from './schemas/provider-execution.schema';
import { AiRouterService } from './services/ai-router.service';
import { PromptRegistryService } from './services/prompt-registry.service';
import { ProviderHealthService } from './services/provider-health.service';
import { CorePromptSeedService } from './services/core-prompt-seed.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AiPrompt.name, schema: AiPromptSchema },
      { name: ProviderExecution.name, schema: ProviderExecutionSchema },
    ]),
  ],
  controllers: [AiHealthController],
  providers: [
    GeminiProvider,
    GroqProvider,
    OpenRouterProvider,
    {
      provide: AI_PROVIDERS,
      inject: [GeminiProvider, GroqProvider, OpenRouterProvider],
      useFactory: (
        gemini: GeminiProvider,
        groq: GroqProvider,
        openRouter: OpenRouterProvider,
      ): AiProvider[] => [gemini, groq, openRouter],
    },
    PromptRegistryService,
    ProviderHealthService,
    AiRouterService,
    CorePromptSeedService,
  ],
  exports: [
    AI_PROVIDERS,
    AiRouterService,
    PromptRegistryService,
    ProviderHealthService,
    MongooseModule,
  ],
})
export class AiModule {}
