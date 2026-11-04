import type { DocumentChunk } from '../documents/document.types.js';
import type { Embedding } from '../embeddings/embedding-provider.interface.js';
import { InMemoryVectorStore } from './in-memory-vector-store.js';
import { DEFAULT_TOP_K, MAX_TOP_K } from './vector-store-limits.js';
import type { StoredChunk } from './vector-store.interface.js';

const TEST_DIMENSIONS = 3;

/** Unit vectors used in the tests: three axes and one in between. */
const AXIS_X: Embedding = [1, 0, 0];
const AXIS_Y: Embedding = [0, 1, 0];
const AXIS_Z: Embedding = [0, 0, 1];
const BETWEEN_X_AND_Y: Embedding = [0.6, 0.8, 0];
const SIMILARITY_OF_BETWEEN_VECTOR_TO_AXIS_X = 0.6;

function createEntry(
  documentId: string,
  index: number,
  embedding: Embedding,
): StoredChunk {
  const chunk: DocumentChunk = {
    documentId,
    index,
    text: `${documentId} chunk ${index}`,
  };
  return { chunk, embedding };
}

function createStore(maxStoredChunks?: number): InMemoryVectorStore {
  return new InMemoryVectorStore({
    dimensions: TEST_DIMENSIONS,
    ...(maxStoredChunks && { maxStoredChunks }),
  });
}

describe('InMemoryVectorStore', () => {
  describe('upsert and count', () => {
    it('counts stored chunks', async () => {
      const store = createStore();

      await store.upsert([
        createEntry('a', 0, AXIS_X),
        createEntry('a', 1, AXIS_Y),
      ]);

      await expect(store.count()).resolves.toBe(2);
    });

    it('replaces a chunk stored under the same id', async () => {
      const store = createStore();
      await store.upsert([createEntry('a', 0, AXIS_X)]);

      await store.upsert([createEntry('a', 0, AXIS_Y)]);

      await expect(store.count()).resolves.toBe(1);
      const results = await store.search(AXIS_Y);
      expect(results).toHaveLength(1);
      expect(results[0]!.similarity).toBeCloseTo(1);
    });

    it('is not affected by changes made to the input afterwards', async () => {
      const store = createStore();
      const embedding = [...AXIS_X];
      const entry = createEntry('a', 0, embedding);
      await store.upsert([entry]);

      embedding[0] = 0;
      entry.chunk.text = 'changed';

      const [result] = await store.search(AXIS_X);
      expect(result!.chunk.text).toBe('a chunk 0');
    });
  });

  describe('search', () => {
    it('returns chunks ordered from the most to the least similar', async () => {
      const store = createStore();
      await store.upsert([
        createEntry('far', 0, AXIS_Z),
        createEntry('near', 0, BETWEEN_X_AND_Y),
        createEntry('exact', 0, AXIS_X),
      ]);

      const results = await store.search(AXIS_X, { minimumSimilarity: -1 });

      expect(results.map((result) => result.chunk.documentId)).toEqual([
        'exact',
        'near',
        'far',
      ]);
      expect(results[0]!.similarity).toBeCloseTo(1);
      expect(results[1]!.similarity).toBeCloseTo(
        SIMILARITY_OF_BETWEEN_VECTOR_TO_AXIS_X,
      );
      expect(results[2]!.similarity).toBeCloseTo(0);
    });

    it('excludes chunks that are not more similar than the minimum', async () => {
      const store = createStore();
      await store.upsert([
        createEntry('exact', 0, AXIS_X),
        createEntry('near', 0, BETWEEN_X_AND_Y),
        createEntry('unrelated', 0, AXIS_Z),
      ]);

      const withDefaultMinimum = await store.search(AXIS_X);
      const withHigherMinimum = await store.search(AXIS_X, {
        minimumSimilarity: 0.9,
      });

      expect(withDefaultMinimum.map((r) => r.chunk.documentId)).toEqual([
        'exact',
        'near',
      ]);
      expect(withHigherMinimum.map((r) => r.chunk.documentId)).toEqual([
        'exact',
      ]);
    });

    it('returns at most topK results', async () => {
      const store = createStore();
      await store.upsert([
        createEntry('a', 0, AXIS_X),
        createEntry('b', 0, BETWEEN_X_AND_Y),
        createEntry('c', 0, [0.8, 0.6, 0]),
      ]);

      const results = await store.search(AXIS_X, { topK: 2 });

      expect(results).toHaveLength(2);
    });

    it('returns at most the default number of results', async () => {
      const store = createStore();
      const manyEntries = Array.from({ length: DEFAULT_TOP_K + 3 }, (_, i) =>
        createEntry('doc', i, AXIS_X),
      );
      await store.upsert(manyEntries);

      const results = await store.search(AXIS_X);

      expect(results).toHaveLength(DEFAULT_TOP_K);
    });

    it('orders equally similar chunks by id, so results are stable', async () => {
      const store = createStore();
      await store.upsert([
        createEntry('b', 0, AXIS_X),
        createEntry('a', 0, AXIS_X),
      ]);

      const results = await store.search(AXIS_X);

      expect(results.map((r) => r.chunk.documentId)).toEqual(['a', 'b']);
    });

    it('returns nothing for a query of zeros and ignores stored zeros', async () => {
      const store = createStore();
      await store.upsert([
        createEntry('zeros', 0, [0, 0, 0]),
        createEntry('real', 0, AXIS_X),
      ]);

      await expect(store.search([0, 0, 0])).resolves.toEqual([]);
      const results = await store.search(AXIS_X);
      expect(results.map((r) => r.chunk.documentId)).toEqual(['real']);
    });

    it('returns an empty list for an empty store', async () => {
      await expect(createStore().search(AXIS_X)).resolves.toEqual([]);
    });

    it('returns copies, so callers cannot change the stored chunks', async () => {
      const store = createStore();
      await store.upsert([createEntry('a', 0, AXIS_X)]);

      const [firstResult] = await store.search(AXIS_X);
      firstResult!.chunk.text = 'changed';

      const [secondResult] = await store.search(AXIS_X);
      expect(secondResult!.chunk.text).toBe('a chunk 0');
    });
  });

  describe('input validation', () => {
    it('rejects embeddings with the wrong number of dimensions', async () => {
      const store = createStore();

      await expect(store.upsert([createEntry('a', 0, [1, 0])])).rejects.toThrow(
        /3 dimensions/,
      );
      await expect(store.search([1, 0])).rejects.toThrow(/3 dimensions/);
    });

    it('rejects embeddings with NaN or infinite values', async () => {
      const store = createStore();

      await expect(
        store.upsert([createEntry('a', 0, [Number.NaN, 0, 0])]),
      ).rejects.toThrow(/finite/);
      await expect(
        store.search([Number.POSITIVE_INFINITY, 0, 0]),
      ).rejects.toThrow(/finite/);
    });

    it('rejects embeddings that are not normalized', async () => {
      const store = createStore();

      await expect(
        store.upsert([createEntry('a', 0, [2, 0, 0])]),
      ).rejects.toThrow(/normalized/);
      await expect(store.search([2, 0, 0])).rejects.toThrow(/normalized/);
    });

    it('stores nothing when one entry of the batch is invalid', async () => {
      const store = createStore();

      await expect(
        store.upsert([
          createEntry('valid', 0, AXIS_X),
          createEntry('invalid', 0, [2, 0, 0]),
        ]),
      ).rejects.toThrow(RangeError);

      await expect(store.count()).resolves.toBe(0);
    });

    it('rejects invalid topK values', async () => {
      const store = createStore();

      for (const topK of [0, -1, 1.5, Number.NaN, MAX_TOP_K + 1]) {
        await expect(store.search(AXIS_X, { topK })).rejects.toThrow(/topK/);
      }
    });

    it('rejects invalid minimumSimilarity values', async () => {
      const store = createStore();

      for (const minimumSimilarity of [Number.NaN, 1.5, -1.5]) {
        await expect(
          store.search(AXIS_X, { minimumSimilarity }),
        ).rejects.toThrow(/minimumSimilarity/);
      }
    });

    it('rejects invalid dimensions in the constructor', () => {
      expect(() => new InMemoryVectorStore({ dimensions: 0 })).toThrow(
        RangeError,
      );
      expect(() => new InMemoryVectorStore({ dimensions: 2.5 })).toThrow(
        RangeError,
      );
    });
  });

  describe('replaceAll', () => {
    it('removes chunks that are not in the new content', async () => {
      const store = createStore();
      await store.upsert([
        createEntry('old', 0, AXIS_X),
        createEntry('old', 1, AXIS_Y),
      ]);

      await store.replaceAll([createEntry('new', 0, AXIS_Z)]);

      await expect(store.count()).resolves.toBe(1);
      const results = await store.search(AXIS_Z);
      expect(results.map((result) => result.chunk.documentId)).toEqual(['new']);
      await expect(store.search(AXIS_X)).resolves.toEqual([]);
    });

    it('empties the store when given no chunks', async () => {
      const store = createStore();
      await store.upsert([createEntry('old', 0, AXIS_X)]);

      await store.replaceAll([]);

      await expect(store.count()).resolves.toBe(0);
    });

    it('keeps the previous content when one new chunk is invalid', async () => {
      const store = createStore();
      await store.upsert([createEntry('old', 0, AXIS_X)]);

      await expect(
        store.replaceAll([
          createEntry('new', 0, AXIS_Y),
          createEntry('invalid', 0, [2, 0, 0]),
        ]),
      ).rejects.toThrow(RangeError);

      await expect(store.count()).resolves.toBe(1);
      const [result] = await store.search(AXIS_X);
      expect(result!.chunk.documentId).toBe('old');
    });

    it('keeps the previous content when the new chunks do not fit', async () => {
      const smallCapacity = 1;
      const store = createStore(smallCapacity);
      await store.upsert([createEntry('old', 0, AXIS_X)]);

      await expect(
        store.replaceAll([
          createEntry('new', 0, AXIS_Y),
          createEntry('new', 1, AXIS_Z),
        ]),
      ).rejects.toThrow(/more than 1 chunks/);

      const [result] = await store.search(AXIS_X);
      expect(result!.chunk.documentId).toBe('old');
    });
  });

  describe('capacity limit', () => {
    const SMALL_CAPACITY = 2;

    it('rejects a batch that does not fit', async () => {
      const store = createStore(SMALL_CAPACITY);

      await expect(
        store.upsert([
          createEntry('a', 0, AXIS_X),
          createEntry('a', 1, AXIS_Y),
          createEntry('a', 2, AXIS_Z),
        ]),
      ).rejects.toThrow(/more than 2 chunks/);
      await expect(store.count()).resolves.toBe(0);
    });

    it('rejects new chunks once the store is full', async () => {
      const store = createStore(SMALL_CAPACITY);
      await store.upsert([
        createEntry('a', 0, AXIS_X),
        createEntry('a', 1, AXIS_Y),
      ]);

      await expect(store.upsert([createEntry('a', 2, AXIS_Z)])).rejects.toThrow(
        /more than 2 chunks/,
      );
      await expect(store.count()).resolves.toBe(SMALL_CAPACITY);
    });

    it('still allows replacing chunks when the store is full', async () => {
      const store = createStore(SMALL_CAPACITY);
      await store.upsert([
        createEntry('a', 0, AXIS_X),
        createEntry('a', 1, AXIS_Y),
      ]);

      await expect(
        store.upsert([createEntry('a', 1, AXIS_Z)]),
      ).resolves.toBeUndefined();
      await expect(store.count()).resolves.toBe(SMALL_CAPACITY);
    });
  });
});
