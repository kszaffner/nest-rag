import { Inject, Injectable, Logger } from '@nestjs/common';
import type { DocumentChunk } from '../documents/document.types.js';
import { DocumentsService } from '../documents/documents.service.js';
import { MAX_TEXTS_PER_BATCH } from '../embeddings/embedding-input-limits.js';
import { findInjectionSignalPositions } from '../llm/prompt-injection-signals.js';
import {
  EMBEDDING_PROVIDER,
  type EmbeddingProvider,
} from '../embeddings/embedding-provider.interface.js';
import { createIndexFingerprint } from './index-fingerprint.js';
import { MAX_STORED_CHUNKS } from '../vector-store/vector-store-limits.js';
import {
  VECTOR_STORE,
  type StoredChunk,
  type VectorStore,
} from '../vector-store/vector-store.interface.js';

/** Keeps one log line short even when many chunks are flagged. */
const MAX_LISTED_FLAGGED_CHUNKS = 10;

export interface IndexingReport {
  documentCount: number;
  chunkCount: number;
  /** True when a persistent store was already up to date and nothing was embedded. */
  reusedStoredIndex: boolean;
}

/**
 * Builds the search index: reads the documents, splits them into chunks,
 * converts every chunk into an embedding and stores both in the vector store.
 * With a persistent store (SQLite) the embedding step is skipped when the
 * stored index was built from the same chunks and the same embedding model.
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

    this.warnAboutInjectionSignals(chunks);

    const indexFingerprint = createIndexFingerprint({
      embeddingIdentity: this.embeddingProvider.identity,
      dimensions: this.embeddingProvider.dimensions,
      chunks,
    });
    if (await this.isStoredIndexUpToDate(indexFingerprint, chunks.length)) {
      this.logger.log(
        `Index is up to date, reusing ${chunks.length} stored chunks from ${documents.length} documents`,
      );
      return {
        documentCount: documents.length,
        chunkCount: chunks.length,
        reusedStoredIndex: true,
      };
    }

    const entries = await this.embedChunks(chunks);
    await this.vectorStore.replaceAll(entries, { indexFingerprint });

    if (documents.length === 0) {
      this.logger.warn('No documents found, the index is now empty');
    }
    this.logger.log(
      `Indexed ${documents.length} documents as ${chunks.length} chunks`,
    );
    return {
      documentCount: documents.length,
      chunkCount: chunks.length,
      reusedStoredIndex: false,
    };
  }

  /**
   * True when a persistent store already holds an index built from exactly
   * these chunks and this embedding model. The chunk count is checked too, so
   * a store that lost rows is rebuilt instead of trusted.
   */
  private async isStoredIndexUpToDate(
    indexFingerprint: string,
    expectedChunkCount: number,
  ): Promise<boolean> {
    if (!this.vectorStore.readIndexFingerprint) {
      return false;
    }
    const storedFingerprint = await this.vectorStore.readIndexFingerprint();
    return (
      storedFingerprint === indexFingerprint &&
      (await this.vectorStore.count()) === expectedChunkCount
    );
  }

  /**
   * Logs which chunks contain phrases typical for prompt injection, so an
   * operator can review those documents. The chunks are still indexed and
   * nothing from their text is logged, only their ids.
   */
  private warnAboutInjectionSignals(chunks: DocumentChunk[]): void {
    const flaggedChunks = findInjectionSignalPositions(
      chunks.map((chunk) => chunk.text),
    ).map((position) => chunks[position]!);
    if (flaggedChunks.length === 0) {
      return;
    }

    const listedChunkIds = flaggedChunks
      .slice(0, MAX_LISTED_FLAGGED_CHUNKS)
      .map((chunk) => `${chunk.documentId}#${chunk.index}`)
      .join(', ');
    this.logger.warn(
      `${flaggedChunks.length} chunk(s) contain phrases typical for prompt injection, review these documents (first ${MAX_LISTED_FLAGGED_CHUNKS}): ${listedChunkIds}`,
    );
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
