import {
  MAX_TEXT_LENGTH_IN_CHARACTERS,
  MAX_TEXTS_PER_BATCH,
} from './embedding-input-limits.js';
import type { Embedding } from './embedding-provider.interface.js';
import {
  MOCK_EMBEDDING_DIMENSIONS,
  MockEmbeddingProvider,
} from './mock-embedding.provider.js';

/** For unit vectors the dot product equals the cosine similarity. */
function dotProduct(first: Embedding, second: Embedding): number {
  return first.reduce(
    (sum, value, position) => sum + value * second[position]!,
    0,
  );
}

describe('MockEmbeddingProvider', () => {
  const provider = new MockEmbeddingProvider();

  it('returns a vector with the declared number of dimensions', async () => {
    const embedding = await provider.embed('How many vacation days do I have?');

    expect(embedding).toHaveLength(MOCK_EMBEDDING_DIMENSIONS);
    expect(provider.dimensions).toBe(MOCK_EMBEDDING_DIMENSIONS);
  });

  it('is deterministic', async () => {
    const firstEmbedding = await provider.embed('VPN error AUTH-403');
    const secondEmbedding = await provider.embed('VPN error AUTH-403');

    expect(firstEmbedding).toEqual(secondEmbedding);
  });

  it('returns vectors of length 1', async () => {
    const embedding = await provider.embed('Annual leave policy');

    expect(dotProduct(embedding, embedding)).toBeCloseTo(1);
  });

  it('ignores letter case and punctuation', async () => {
    const plainEmbedding = await provider.embed('annual leave');
    const noisyEmbedding = await provider.embed('Annual, LEAVE!');

    expect(noisyEmbedding).toEqual(plainEmbedding);
  });

  it('gives higher similarity to texts that share words', async () => {
    const [question, relatedText, unrelatedText] = await provider.embedMany([
      'how to reset my vpn password',
      'reset the vpn password in the self service portal',
      'meal allowance on business trips abroad',
    ]);

    expect(dotProduct(question!, relatedText!)).toBeGreaterThan(
      dotProduct(question!, unrelatedText!),
    );
  });

  it('keeps the order of texts in embedMany', async () => {
    const texts = ['first text', 'second text', 'third text'];
    const batchEmbeddings = await provider.embedMany(texts);
    const singleEmbeddings = await Promise.all(
      texts.map((text) => provider.embed(text)),
    );

    expect(batchEmbeddings).toEqual(singleEmbeddings);
  });

  it('returns a zero vector for text without letters or digits', async () => {
    const embedding = await provider.embed('!!! ???');

    expect(embedding.every((value) => value === 0)).toBe(true);
  });

  describe('input limits', () => {
    it('rejects empty and whitespace-only text', async () => {
      await expect(provider.embed('')).rejects.toThrow(RangeError);
      await expect(provider.embed('   \n ')).rejects.toThrow(RangeError);
    });

    it('rejects text that is not a string', async () => {
      await expect(provider.embed(42 as unknown as string)).rejects.toThrow(
        TypeError,
      );
    });

    it('rejects text longer than the maximum length', async () => {
      const tooLongText = 'a'.repeat(MAX_TEXT_LENGTH_IN_CHARACTERS + 1);

      await expect(provider.embed(tooLongText)).rejects.toThrow(RangeError);
    });

    it('accepts text of exactly the maximum length', async () => {
      const maxLengthText = 'a'.repeat(MAX_TEXT_LENGTH_IN_CHARACTERS);

      await expect(provider.embed(maxLengthText)).resolves.toHaveLength(
        MOCK_EMBEDDING_DIMENSIONS,
      );
    });

    it('rejects a batch with too many texts', async () => {
      const tooManyTexts = Array.from(
        { length: MAX_TEXTS_PER_BATCH + 1 },
        () => 'text',
      );

      await expect(provider.embedMany(tooManyTexts)).rejects.toThrow(
        RangeError,
      );
    });

    it('rejects a batch that contains an invalid text', async () => {
      await expect(provider.embedMany(['valid text', ''])).rejects.toThrow(
        RangeError,
      );
    });
  });
});
