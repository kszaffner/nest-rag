import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EMBEDDING_PROVIDER,
  type EmbeddingProvider,
} from '../embeddings/embedding-provider.interface.js';
import { EmbeddingsModule } from '../embeddings/embeddings.module.js';
import { InMemoryVectorStore } from './in-memory-vector-store.js';
import { SqliteVectorStore } from './sqlite-vector-store.js';
import { parseVectorStoreSettings } from './vector-store-settings.js';
import { VECTOR_STORE, type VectorStore } from './vector-store.interface.js';

/**
 * Provides the vector store chosen by the VECTOR_STORE setting under the
 * VECTOR_STORE token: "memory" (default, forgets everything on restart) or
 * "sqlite" (a file that survives restarts). The store accepts only vectors of
 * the size produced by the configured embedding provider, so a mismatch
 * between them is caught immediately.
 *
 * Code that injects VECTOR_STORE does not depend on which store it gets.
 */
@Module({
  imports: [EmbeddingsModule],
  providers: [
    {
      provide: VECTOR_STORE,
      inject: [EMBEDDING_PROVIDER, ConfigService],
      useFactory: (
        embeddingProvider: EmbeddingProvider,
        configService: ConfigService,
      ): VectorStore => {
        const settings = parseVectorStoreSettings((key) =>
          configService.get<string>(key),
        );
        const dimensions = embeddingProvider.dimensions;
        return settings.kind === 'sqlite'
          ? new SqliteVectorStore({
              databasePath: settings.sqliteDatabasePath,
              dimensions,
            })
          : new InMemoryVectorStore({ dimensions });
      },
    },
  ],
  exports: [VECTOR_STORE],
})
export class VectorStoreModule {}
