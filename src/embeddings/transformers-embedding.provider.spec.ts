import { MAX_TEXTS_PER_BATCH } from './embedding-input-limits.js';
import {
  INFERENCE_BATCH_SIZE,
  TransformersEmbeddingProvider,
  type FeatureExtractor,
  type FeatureExtractorFactory,
} from './transformers-embedding.provider.js';

const TEST_DIMENSIONS = 4;

/** Fake model: every text becomes [textLength, 0, 0, 0]. */
function createFakeFactory(): {
  factory: FeatureExtractorFactory;
  extractedBatches: string[][];
  loadCount: () => number;
} {
  const extractedBatches: string[][] = [];
  let loadCount = 0;
  const extractor: FeatureExtractor = async (texts) => {
    extractedBatches.push(texts);
    return texts.map((text) => [text.length, 0, 0, 0]);
  };
  const factory: FeatureExtractorFactory = async () => {
    loadCount += 1;
    return extractor;
  };
  return { factory, extractedBatches, loadCount: () => loadCount };
}

function createProvider(factory: FeatureExtractorFactory) {
  return new TransformersEmbeddingProvider(
    { dimensions: TEST_DIMENSIONS },
    factory,
  );
}

describe('TransformersEmbeddingProvider', () => {
  it('does not load the model until the first use', async () => {
    const { factory, loadCount } = createFakeFactory();
    const provider = createProvider(factory);

    expect(loadCount()).toBe(0);

    await provider.embed('hello');

    expect(loadCount()).toBe(1);
  });

  it('loads the model only once, even for concurrent calls', async () => {
    const { factory, loadCount } = createFakeFactory();
    const provider = createProvider(factory);

    await Promise.all([
      provider.embed('first'),
      provider.embed('second'),
      provider.embedMany(['third', 'fourth']),
    ]);
    await provider.embed('fifth');

    expect(loadCount()).toBe(1);
  });

  it('returns embeddings in the order of the input texts', async () => {
    const { factory } = createFakeFactory();
    const provider = createProvider(factory);

    const embeddings = await provider.embedMany(['a', 'bbb', 'cc']);

    expect(embeddings).toEqual([
      [1, 0, 0, 0],
      [3, 0, 0, 0],
      [2, 0, 0, 0],
    ]);
  });

  it('splits large inputs into batches of the inference batch size', async () => {
    const { factory, extractedBatches } = createFakeFactory();
    const provider = createProvider(factory);
    const textCount = INFERENCE_BATCH_SIZE * 2 + 6;
    const texts = Array.from(
      { length: textCount },
      (_, index) => `text ${index}`,
    );

    const embeddings = await provider.embedMany(texts);

    expect(embeddings).toHaveLength(textCount);
    expect(extractedBatches.map((batch) => batch.length)).toEqual([
      INFERENCE_BATCH_SIZE,
      INFERENCE_BATCH_SIZE,
      6,
    ]);
  });

  it('returns an empty list without loading the model for no texts', async () => {
    const { factory, loadCount } = createFakeFactory();
    const provider = createProvider(factory);

    await expect(provider.embedMany([])).resolves.toEqual([]);
    expect(loadCount()).toBe(0);
  });

  it('validates input before loading the model', async () => {
    const { factory, loadCount } = createFakeFactory();
    const provider = createProvider(factory);
    const tooManyTexts = Array.from(
      { length: MAX_TEXTS_PER_BATCH + 1 },
      () => 'text',
    );

    await expect(provider.embed('  ')).rejects.toThrow(RangeError);
    await expect(provider.embedMany(tooManyTexts)).rejects.toThrow(RangeError);
    expect(loadCount()).toBe(0);
  });

  it('fails when the model returns vectors of a different length', async () => {
    const provider = new TransformersEmbeddingProvider(
      { dimensions: TEST_DIMENSIONS },
      async () => async (texts) => texts.map(() => [1, 2, 3]),
    );

    await expect(provider.embed('hello')).rejects.toThrow(/dimensions/);
  });

  it('can retry after loading the model failed', async () => {
    let attemptCount = 0;
    const { factory } = createFakeFactory();
    const provider = createProvider(async (options) => {
      attemptCount += 1;
      if (attemptCount === 1) {
        throw new Error('network down');
      }
      return factory(options);
    });

    await expect(provider.embed('hello')).rejects.toThrow(
      /Failed to load embedding model/,
    );
    await expect(provider.embed('hello')).resolves.toHaveLength(
      TEST_DIMENSIONS,
    );
    expect(attemptCount).toBe(2);
  });
});
