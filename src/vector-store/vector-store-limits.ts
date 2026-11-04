import type { SearchOptions } from './vector-store.interface.js';

/**
 * Upper bounds protect the application from requests that would exhaust
 * memory or return the whole database (OWASP API4: Unrestricted Resource
 * Consumption).
 */
export const MAX_STORED_CHUNKS = 10_000;
export const MAX_TOP_K = 20;

export const DEFAULT_TOP_K = 4;
export const DEFAULT_MINIMUM_SIMILARITY = 0;

const MINIMUM_TOP_K = 1;
const LOWEST_POSSIBLE_SIMILARITY = -1;
const HIGHEST_POSSIBLE_SIMILARITY = 1;

export interface ResolvedSearchOptions {
  topK: number;
  minimumSimilarity: number;
}

/** Applies defaults to the search options and rejects invalid values. */
export function resolveSearchOptions(
  options: SearchOptions,
): ResolvedSearchOptions {
  const topK = options.topK ?? DEFAULT_TOP_K;
  const minimumSimilarity =
    options.minimumSimilarity ?? DEFAULT_MINIMUM_SIMILARITY;

  if (!Number.isInteger(topK) || topK < MINIMUM_TOP_K || topK > MAX_TOP_K) {
    throw new RangeError(
      `topK must be a whole number from ${MINIMUM_TOP_K} to ${MAX_TOP_K}`,
    );
  }
  if (
    !Number.isFinite(minimumSimilarity) ||
    minimumSimilarity < LOWEST_POSSIBLE_SIMILARITY ||
    minimumSimilarity > HIGHEST_POSSIBLE_SIMILARITY
  ) {
    throw new RangeError(
      `minimumSimilarity must be a number from ${LOWEST_POSSIBLE_SIMILARITY} to ${HIGHEST_POSSIBLE_SIMILARITY}`,
    );
  }

  return { topK, minimumSimilarity };
}
