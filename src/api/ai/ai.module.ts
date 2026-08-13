import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiHealthController } from './controllers/ai-health.controller';
import { PromptAdminController } from './controllers/prompt-admin.controller';
import { ProviderConfigAdminController } from './controllers/provider-config-admin.controller';
import { AdminModule } from '../admin/admin.module';
import {
  AI_PROVIDERS,
  type AiProvider,
} from './interfaces/ai-provider.interface';
import { GeminiProvider } from './providers/gemini.provider';
import { GroqProvider } from './providers/groq.provider';
import { OpenRouterProvider } from './providers/openrouter.provider';
import { VertexProvider } from './providers/vertex.provider';
import { BedrockProvider } from './providers/bedrock.provider';
import { AiPrompt, AiPromptSchema } from './schemas/prompt.schema';
import {
  ProviderExecution,
  ProviderExecutionSchema,
} from './schemas/provider-execution.schema';
import {
  ProviderRuntimeConfig,
  ProviderRuntimeConfigSchema,
} from './schemas/provider-runtime-config.schema';
import { AiRouterService } from './services/ai-router.service';
import { PromptRegistryService } from './services/prompt-registry.service';
import { ProviderHealthService } from './services/provider-health.service';
import { CorePromptSeedService } from './services/core-prompt-seed.service';
import { ProviderConfigService } from './services/provider-config.service';
import { AiBudgetService } from './services/ai-budget.service';
import { AiConcurrencyService } from './services/ai-concurrency.service';

@Module({
  imports: [
    AdminModule,
    MongooseModule.forFeature([
      { name: AiPrompt.name, schema: AiPromptSchema },
      { name: ProviderExecution.name, schema: ProviderExecutionSchema },
      {
        name: ProviderRuntimeConfig.name,
        schema: ProviderRuntimeConfigSchema,
      },
    ]),
  ],
  controllers: [
    AiHealthController,
    PromptAdminController,
    ProviderConfigAdminController,
  ],
  providers: [
    GeminiProvider,
    GroqProvider,
    OpenRouterProvider,
    VertexProvider,
    BedrockProvider,
    {
      provide: AI_PROVIDERS,
      inject: [
        GeminiProvider,
        GroqProvider,
        OpenRouterProvider,
        VertexProvider,
        BedrockProvider,
      ],
      useFactory: (
        gemini: GeminiProvider,
        groq: GroqProvider,
        openRouter: OpenRouterProvider,
        vertex: VertexProvider,
        bedrock: BedrockProvider,
      ): AiProvider[] => [gemini, groq, openRouter, vertex, bedrock],
    },
    PromptRegistryService,
    ProviderHealthService,
    AiRouterService,
    CorePromptSeedService,
    ProviderConfigService,
    AiBudgetService,
    AiConcurrencyService,
  ],
  exports: [
    AI_PROVIDERS,
    AiRouterService,
    PromptRegistryService,
    ProviderHealthService,
    ProviderConfigService,
    AiBudgetService,
    AiConcurrencyService,
    MongooseModule,
  ],
})
export class AiModule {}
