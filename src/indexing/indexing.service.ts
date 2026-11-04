import { Inject, Injectable, Logger } from '@nestjs/common';
import type { DocumentChunk } from '../documents/document.types.js';
import { DocumentsService } from '../documents/documents.service.js';
import { MAX_TEXTS_PER_BATCH } from '../embeddings/embedding-input-limits.js';
import {
  EMBEDDING_PROVIDER,
  type EmbeddingProvider,
} from '../embeddings/embedding-provider.interface.js';
import { MAX_STORED_CHUNKS } from '../vector-store/vector-store-limits.js';
import {
  VECTOR_STORE,
  type StoredChunk,
  type VectorStore,
} from '../vector-store/vector-store.interface.js';

export interface IndexingReport {
  documentCount: number;
  chunkCount: number;
}

/**
 * Builds the search index: reads the documents, splits them into chunks,
 * converts every chunk into an embedding and stores both in the vector store.
 */
@Injectable()
export class IndexingService {
  private readonly logger = new Logger(IndexingService.name);

  constructor(
    private readonly documentsService: DocumentsService,
    @Inject(EMBEDDING_PROVIDER)
    private readonly embeddingProvider: EmbeddingProvider,
    @Inject(VECTOR_STORE)
    private readonly vectorStore: VectorStore,
  ) {}

  /**
   * Rebuilds the whole index from the .txt files of a directory. The old
   * index is replaced only after everything was embedded successfully, so a
   * failure never leaves the application with an empty or half-built index.
   *
   * `documentsDirectory` must come from trusted configuration, never from a
   * request, because every .txt file in it will be read.
   */
  async indexDirectory(documentsDirectory: string): Promise<IndexingReport> {
    const documents =
      await this.documentsService.loadDocuments(documentsDirectory);
    const chunks = this.documentsService.chunkDocuments(documents);

    // Fail before the expensive embedding work, not after it.
    if (chunks.length > MAX_STORED_CHUNKS) {
      throw new RangeError(
        `Cannot index more than ${MAX_STORED_CHUNKS} chunks`,
      );
    }

    const entries = await this.embedChunks(chunks);
    await this.vectorStore.replaceAll(entries);

    if (documents.length === 0) {
      this.logger.warn('No documents found, the index is now empty');
    }
    this.logger.log(
      `Indexed ${documents.length} documents as ${chunks.length} chunks`,
    );
    return { documentCount: documents.length, chunkCount: chunks.length };
  }

  /** Embeds chunks in batches that respect the embedding provider limit. */
  private async embedChunks(chunks: DocumentChunk[]): Promise<StoredChunk[]> {
    const entries: StoredChunk[] = [];

    for (
      let batchStart = 0;
      batchStart < chunks.length;
      batchStart += MAX_TEXTS_PER_BATCH
    ) {
      const batchChunks = chunks.slice(
        batchStart,
        batchStart + MAX_TEXTS_PER_BATCH,
      );
      const batchEmbeddings = await this.embeddingProvider.embedMany(
        batchChunks.map((chunk) => chunk.text),
      );
      if (batchEmbeddings.length !== batchChunks.length) {
        throw new Error(
          'The embedding provider returned a wrong number of embeddings',
        );
      }

      batchChunks.forEach((chunk, chunkPosition) => {
        entries.push({ chunk, embedding: batchEmbeddings[chunkPosition]! });
      });
    }

    return entries;
  }
}
