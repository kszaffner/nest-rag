import type { Embedding } from './embedding-provider.interface.js';
import {
  DEFAULT_MODEL_DIMENSIONS,
  TransformersEmbeddingProvider,
} from './transformers-embedding.provider.js';

/**
 * Uses the REAL model (downloads about 25 MB on the first run and needs
 * network access). Skipped by default. Run it with:
 *   RUN_MODEL_TESTS=1 npm test -- transformers-embedding.provider.model
 */
const SHOULD_RUN_MODEL_TESTS = process.env.RUN_MODEL_TESTS === '1';
const MODEL_TEST_TIMEOUT_IN_MILLISECONDS = 120_000;

/** For unit vectors the dot product equals the cosine similarity. */
function dotProduct(first: Embedding, second: Embedding): number {
  return first.reduce(
    (sum, value, position) => sum + value * second[position]!,
    0,
  );
}

describe.skipIf(!SHOULD_RUN_MODEL_TESTS)(
  'TransformersEmbeddingProvider with the real model',
  () => {
    it(
      'places a question closer to the related text than to an unrelated one',
      async () => {
        const provider = new TransformersEmbeddingProvider();

        const [question, relatedText, unrelatedText] = await provider.embedMany(
          [
            'How do I connect to the company network from home?',
            'The company VPN is required to reach internal systems. Install the BrightGate client.',
            'The daily meal allowance on business trips is 45 EUR abroad.',
          ],
        );

        expect(question).toHaveLength(DEFAULT_MODEL_DIMENSIONS);
        expect(dotProduct(question!, relatedText!)).toBeGreaterThan(
          dotProduct(question!, unrelatedText!),
        );
      },
      MODEL_TEST_TIMEOUT_IN_MILLISECONDS,
    );
  },
);
