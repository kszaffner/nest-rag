import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createEmbeddingProvider } from './create-embedding-provider.js';
import {
  EMBEDDING_PROVIDER,
  type EmbeddingProvider,
} from './embedding-provider.interface.js';
import { parseEmbeddingSettings } from './embedding-settings.js';

/**
 * Provides the embedding provider chosen by the EMBEDDING_PROVIDER setting.
 * Other modules inject it with @Inject(EMBEDDING_PROVIDER) and depend only on
 * the EmbeddingProvider interface.
 */
@Module({
  providers: [
    {
      provide: EMBEDDING_PROVIDER,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): EmbeddingProvider =>
        createEmbeddingProvider(
          parseEmbeddingSettings((key) => configService.get<string>(key)),
        ),
    },
  ],
  exports: [EMBEDDING_PROVIDER],
})
export class EmbeddingsModule {}
