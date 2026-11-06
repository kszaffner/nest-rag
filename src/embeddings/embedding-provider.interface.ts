/** A vector of numbers that represents the meaning of a text. */
export type Embedding = number[];

export interface EmbeddingProvider {
  /** Length of every vector returned by this provider. */
  readonly dimensions: number;

  /**
   * Names the model and its version, for example "Xenova/all-MiniLM-L6-v2@abc".
   * Embeddings of different identities are not comparable, so a persistent
   * index built with another identity must be rebuilt.
   */
  readonly identity: string;

  /** Converts one text into an embedding. */
  embed(text: string): Promise<Embedding>;

  /** Converts many texts into embeddings, in the same order as the input. */
  embedMany(texts: readonly string[]): Promise<Embedding[]>;
}

/** Dependency injection token used to inject the configured provider. */
export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');
