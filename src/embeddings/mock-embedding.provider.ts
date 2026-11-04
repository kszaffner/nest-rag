import { Injectable } from '@nestjs/common';
import {
  assertValidEmbeddingBatch,
  assertValidEmbeddingText,
} from './embedding-input-limits.js';
import type {
  Embedding,
  EmbeddingProvider,
} from './embedding-provider.interface.js';

/** Same size as the real model (all-MiniLM-L6-v2), so providers are swappable. */
export const MOCK_EMBEDDING_DIMENSIONS = 384;

/** Parameters of the 32-bit FNV-1a hash function. */
const FNV_OFFSET_BASIS = 2_166_136_261;
const FNV_PRIME = 16_777_619;

const WORD_PATTERN = /[a-z0-9]+/g;
const EMPTY_VECTOR_LENGTH = 0;

/**
 * Free, offline and deterministic embedding provider for development and
 * tests. It hashes every word into one of the vector positions, so texts
 * that share words get similar vectors. It does NOT understand meaning
 * (synonyms are not related), which the real model does.
 */
@Injectable()
export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = MOCK_EMBEDDING_DIMENSIONS;

  async embed(text: string): Promise<Embedding> {
    assertValidEmbeddingText(text);
    return this.createEmbedding(text);
  }

  async embedMany(texts: readonly string[]): Promise<Embedding[]> {
    assertValidEmbeddingBatch(texts);
    return texts.map((text) => this.createEmbedding(text));
  }

  private createEmbedding(text: string): Embedding {
    const wordCounts = Array.from({ length: this.dimensions }, () => 0);
    const words = text.toLowerCase().match(WORD_PATTERN) ?? [];

    for (const word of words) {
      const vectorPosition = hashWord(word) % this.dimensions;
      wordCounts[vectorPosition] += 1;
    }

    return normalizeToUnitLength(wordCounts);
  }
}

function hashWord(word: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let characterIndex = 0; characterIndex < word.length; characterIndex++) {
    hash ^= word.charCodeAt(characterIndex);
    hash = Math.imul(hash, FNV_PRIME);
  }
  // `>>> 0` converts the signed 32-bit result into an unsigned number.
  return hash >>> 0;
}

/**
 * Scales the vector so its length is 1. For unit vectors the dot product
 * equals the cosine similarity. A vector of only zeros stays unchanged.
 */
function normalizeToUnitLength(vector: number[]): number[] {
  const vectorLength = Math.sqrt(
    vector.reduce((sumOfSquares, value) => sumOfSquares + value * value, 0),
  );
  if (vectorLength === EMPTY_VECTOR_LENGTH) {
    return vector;
  }
  return vector.map((value) => value / vectorLength);
}
