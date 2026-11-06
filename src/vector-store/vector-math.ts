import type { Embedding } from '../embeddings/embedding-provider.interface.js';

const ZERO_LENGTH = 0;
const UNIT_LENGTH = 1;

/**
 * How far the length of a vector may differ from 1. Real models return
 * float32 numbers, so the length is only approximately 1.
 */
const UNIT_LENGTH_TOLERANCE = 0.001;

/** For vectors of length 1 the dot product equals the cosine similarity. */
export function dotProduct(
  first: ArrayLike<number>,
  second: ArrayLike<number>,
): number {
  let sum = 0;
  for (let position = 0; position < first.length; position++) {
    sum += first[position]! * second[position]!;
  }
  return sum;
}

export function vectorLength(vector: Embedding): number {
  return Math.sqrt(dotProduct(vector, vector));
}

/**
 * Wrong length, NaN or a vector that is not normalized would silently produce
 * a wrong ranking, so every store rejects them loudly.
 */
export function assertValidEmbedding(
  embedding: Embedding,
  dimensions: number,
): void {
  if (embedding.length !== dimensions) {
    throw new RangeError(`Embedding must have ${dimensions} dimensions`);
  }
  if (!embedding.every((value) => Number.isFinite(value))) {
    throw new RangeError('Embedding must contain only finite numbers');
  }
  if (!hasUnitOrZeroLength(embedding)) {
    throw new RangeError('Embedding must be normalized to length 1');
  }
}

/** True for a vector of length 1 (within tolerance) or a vector of zeros. */
export function hasUnitOrZeroLength(vector: Embedding): boolean {
  const length = vectorLength(vector);
  return (
    length === ZERO_LENGTH ||
    Math.abs(length - UNIT_LENGTH) <= UNIT_LENGTH_TOLERANCE
  );
}
