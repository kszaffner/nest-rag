import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createLlmProvider } from './create-llm-provider.js';
import { parseLlmSettings } from './llm-settings.js';
import { LLM_PROVIDER, type LlmProvider } from './llm-provider.interface.js';

/**
 * Provides the LLM provider chosen by the LLM_PROVIDER setting. Other modules
 * inject it with @Inject(LLM_PROVIDER) and depend only on the LlmProvider
 * interface. An invalid setting stops the application at startup.
 */
@Module({
  providers: [
    {
      provide: LLM_PROVIDER,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Promise<LlmProvider> =>
        createLlmProvider(
          parseLlmSettings((key) => configService.get<string>(key)),
        ),
    },
  ],
  exports: [LLM_PROVIDER],
})
export class LlmModule {}
