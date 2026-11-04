/** A vector of numbers that represents the meaning of a text. */
export type Embedding = number[];

export interface EmbeddingProvider {
  /** Length of every vector returned by this provider. */
  readonly dimensions: number;

  /** Converts one text into an embedding. */
  embed(text: string): Promise<Embedding>;

  /** Converts many texts into embeddings, in the same order as the input. */
  embedMany(texts: readonly string[]): Promise<Embedding[]>;
}

/** Dependency injection token used to inject the configured provider. */
export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');
