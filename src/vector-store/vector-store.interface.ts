import type { DocumentChunk } from '../documents/document.types.js';
import type { Embedding } from '../embeddings/embedding-provider.interface.js';

/** A chunk together with the embedding of its text. */
export interface StoredChunk {
  chunk: DocumentChunk;
  /** Must have length 1 (or be all zeros), see EmbeddingProvider. */
  embedding: Embedding;
}

export interface SearchOptions {
  /** How many of the most similar chunks to return at most. */
  topK?: number;
  /**
   * Only chunks with a similarity strictly greater than this value are
   * returned. Similarity is between -1 (opposite) and 1 (identical).
   */
  minimumSimilarity?: number;
}

export interface SearchResult {
  chunk: DocumentChunk;
  /** Cosine similarity between the query and the chunk, from -1 to 1. */
  similarity: number;
}

export interface ReplaceAllOptions {
  /**
   * Describes what the content was built from (documents, chunking, embedding
   * model). A persistent store saves it in the same transaction as the chunks;
   * a store that forgets everything on restart ignores it.
   */
  indexFingerprint?: string;
}

export interface VectorStore {
  /** Adds chunks, or replaces chunks that were stored under the same id. */
  upsert(entries: readonly StoredChunk[]): Promise<void>;

  /**
   * Replaces the whole content with the given chunks. It is all or nothing:
   * when anything is invalid, the previous content stays untouched. Use it to
   * rebuild an index, so chunks of removed or shortened documents disappear.
   */
  replaceAll(
    entries: readonly StoredChunk[],
    options?: ReplaceAllOptions,
  ): Promise<void>;

  /**
   * Only for stores that survive a restart: the fingerprint saved by the last
   * replaceAll, or undefined when there is none. Lets the application skip
   * rebuilding an index that is already up to date.
   */
  readIndexFingerprint?(): Promise<string | undefined>;

  /** Returns the most similar chunks, the most similar first. */
  search(
    queryEmbedding: Embedding,
    options?: SearchOptions,
  ): Promise<SearchResult[]>;

  /** Number of stored chunks. */
  count(): Promise<number>;
}

/** Dependency injection token used to inject the configured store. */
export const VECTOR_STORE = Symbol('VECTOR_STORE');
