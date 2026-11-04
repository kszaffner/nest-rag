import { Module } from '@nestjs/common';
import {
  EMBEDDING_PROVIDER,
  type EmbeddingProvider,
} from '../embeddings/embedding-provider.interface.js';
import { EmbeddingsModule } from '../embeddings/embeddings.module.js';
import { InMemoryVectorStore } from './in-memory-vector-store.js';
import { VECTOR_STORE, type VectorStore } from './vector-store.interface.js';

/**
 * Provides the vector store under the VECTOR_STORE token. The store accepts
 * only vectors of the size produced by the configured embedding provider, so
 * a mismatch between them is caught immediately.
 *
 * To switch to another store (for example SQLite), change the factory below;
 * code that injects VECTOR_STORE does not need to change.
 */
@Module({
  imports: [EmbeddingsModule],
  providers: [
    {
      provide: VECTOR_STORE,
      inject: [EMBEDDING_PROVIDER],
      useFactory: (embeddingProvider: EmbeddingProvider): VectorStore =>
        new InMemoryVectorStore({ dimensions: embeddingProvider.dimensions }),
    },
  ],
  exports: [VECTOR_STORE],
})
export class VectorStoreModule {}
