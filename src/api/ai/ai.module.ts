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
    ProviderConfigService,
  ],
  exports: [
    AI_PROVIDERS,
    AiRouterService,
    PromptRegistryService,
    ProviderHealthService,
    ProviderConfigService,
    MongooseModule,
  ],
})
export class AiModule {}
