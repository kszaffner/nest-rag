import type { Embedding } from '../embeddings/embedding-provider.interface.js';
import { createChunkId } from './chunk-id.js';
import { assertValidEmbedding, dotProduct } from './vector-math.js';
import {
  MAX_STORED_CHUNKS,
  resolveSearchOptions,
} from './vector-store-limits.js';
import type {
  SearchOptions,
  SearchResult,
  StoredChunk,
  VectorStore,
} from './vector-store.interface.js';

const MINIMUM_DIMENSIONS = 1;

export interface InMemoryVectorStoreOptions {
  /** Length of every embedding that will be stored and searched. */
  dimensions: number;
  /** Maximum number of chunks kept in memory. */
  maxStoredChunks?: number;
}

interface SearchCandidate extends SearchResult {
  chunkId: string;
}

/**
 * Keeps chunks and embeddings in memory and finds the most similar ones by
 * comparing the query with every stored embedding. Simple and exact, and
 * fast enough for thousands of chunks. Everything is lost when the application
 * stops. Use SqliteVectorStore when the index should survive a restart.
 */
export class InMemoryVectorStore implements VectorStore {
  private readonly dimensions: number;
  private readonly maxStoredChunks: number;
  private entriesByChunkId = new Map<string, StoredChunk>();

  constructor(options: InMemoryVectorStoreOptions) {
    if (
      !Number.isInteger(options.dimensions) ||
      options.dimensions < MINIMUM_DIMENSIONS
    ) {
      throw new RangeError(
        `dimensions must be a whole number of at least ${MINIMUM_DIMENSIONS}`,
      );
    }
    this.dimensions = options.dimensions;
    this.maxStoredChunks = options.maxStoredChunks ?? MAX_STORED_CHUNKS;
  }

  async upsert(entries: readonly StoredChunk[]): Promise<void> {
    if (entries.length > this.maxStoredChunks) {
      throw new RangeError(
        `Cannot store more than ${this.maxStoredChunks} chunks`,
      );
    }
    // Validate everything first, so a bad entry never leaves a partial update.
    for (const entry of entries) {
      this.assertValidEmbedding(entry.embedding);
    }

    const newChunkIds = new Set(
      entries
        .map((entry) => createChunkId(entry.chunk))
        .filter((chunkId) => !this.entriesByChunkId.has(chunkId)),
    );
    if (this.entriesByChunkId.size + newChunkIds.size > this.maxStoredChunks) {
      throw new RangeError(
        `Cannot store more than ${this.maxStoredChunks} chunks`,
      );
    }

    for (const entry of entries) {
      this.entriesByChunkId.set(
        createChunkId(entry.chunk),
        this.createIndependentCopy(entry),
      );
    }
  }

  async replaceAll(entries: readonly StoredChunk[]): Promise<void> {
    if (entries.length > this.maxStoredChunks) {
      throw new RangeError(
        `Cannot store more than ${this.maxStoredChunks} chunks`,
      );
    }
    // Validate everything and build the new content before touching the
    // current one, so a failure leaves the previous content untouched.
    for (const entry of entries) {
      this.assertValidEmbedding(entry.embedding);
    }
    const replacementEntries = new Map<string, StoredChunk>();
    for (const entry of entries) {
      replacementEntries.set(
        createChunkId(entry.chunk),
        this.createIndependentCopy(entry),
      );
    }

    this.entriesByChunkId = replacementEntries;
  }

  async search(
    queryEmbedding: Embedding,
    options: SearchOptions = {},
  ): Promise<SearchResult[]> {
    const { topK, minimumSimilarity } = resolveSearchOptions(options);
    this.assertValidEmbedding(queryEmbedding);

    const candidates: SearchCandidate[] = [];
    for (const [chunkId, entry] of this.entriesByChunkId) {
      const similarity = dotProduct(queryEmbedding, entry.embedding);
      if (similarity > minimumSimilarity) {
        candidates.push({ chunkId, chunk: { ...entry.chunk }, similarity });
      }
    }

    candidates.sort(
      (first, second) =>
        second.similarity - first.similarity ||
        first.chunkId.localeCompare(second.chunkId),
    );

    return candidates
      .slice(0, topK)
      .map(({ chunk, similarity }) => ({ chunk, similarity }));
  }

  async count(): Promise<number> {
    return this.entriesByChunkId.size;
  }

  /** A copy, so later changes made by the caller cannot alter the store. */
  private createIndependentCopy(entry: StoredChunk): StoredChunk {
    return {
      chunk: { ...entry.chunk },
      embedding: [...entry.embedding],
    };
  }

  /**
   * Wrong length, NaN or a vector that is not normalized would silently
   * produce a wrong ranking, so they are rejected loudly.
   */
  private assertValidEmbedding(embedding: Embedding): void {
    assertValidEmbedding(embedding, this.dimensions);
  }
}
