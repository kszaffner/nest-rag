import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { InMemoryVectorStore } from './in-memory-vector-store.js';
import {
  IN_MEMORY_DATABASE_PATH,
  SqliteVectorStore,
} from './sqlite-vector-store.js';
import type { StoredChunk } from './vector-store.interface.js';

const DIMENSIONS = 4;

/** A vector of length 1 that points along one axis. */
function axisVector(axis: number): number[] {
  return Array.from({ length: DIMENSIONS }, (_, position) =>
    position === axis ? 1 : 0,
  );
}

function createEntry(
  documentId: string,
  index: number,
  embedding: number[],
  text = `${documentId} text ${index}`,
): StoredChunk {
  return { chunk: { documentId, index, text }, embedding };
}

describe('SqliteVectorStore', () => {
  let temporaryDirectory: string;
  let databasePath: string;
  const openStores: SqliteVectorStore[] = [];

  function openStore(path = databasePath, maxStoredChunks?: number) {
    const store = new SqliteVectorStore({
      databasePath: path,
      dimensions: DIMENSIONS,
      ...(maxStoredChunks !== undefined && { maxStoredChunks }),
    });
    openStores.push(store);
    return store;
  }

  beforeEach(() => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'nest-rag-sqlite-'));
    databasePath = join(temporaryDirectory, 'nested', 'index.sqlite');
  });

  afterEach(() => {
    openStores.splice(0).forEach((store) => store.close());
    rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it('returns the most similar chunks first', async () => {
    const store = openStore();
    await store.replaceAll([
      createEntry('a', 0, axisVector(0)),
      createEntry('b', 0, axisVector(1)),
      createEntry('c', 0, [Math.SQRT1_2, Math.SQRT1_2, 0, 0]),
    ]);

    const results = await store.search(axisVector(0), { topK: 2 });

    expect(results.map((result) => result.chunk.documentId)).toEqual([
      'a',
      'c',
    ]);
    expect(results[0]!.similarity).toBeCloseTo(1);
    expect(results[1]!.similarity).toBeCloseTo(Math.SQRT1_2);
  });

  it('returns exactly what the in-memory store returns', async () => {
    const entries = [
      createEntry('a', 0, [0.5, 0.5, 0.5, 0.5]),
      createEntry('a', 1, [0.6, 0.8, 0, 0]),
      createEntry('b', 0, [0, 0.6, 0.8, 0]),
    ];
    const sqliteStore = openStore();
    const memoryStore = new InMemoryVectorStore({ dimensions: DIMENSIONS });
    await sqliteStore.replaceAll(entries);
    await memoryStore.replaceAll(entries);
    const query = [0.1, 0.7, 0.7, Math.sqrt(1 - 0.01 - 0.98)];

    expect(await sqliteStore.search(query)).toEqual(
      await memoryStore.search(query),
    );
  });

  it('keeps the content, with the fingerprint, after the database is reopened', async () => {
    const firstStore = openStore();
    await firstStore.replaceAll([createEntry('a', 0, axisVector(2))], {
      indexFingerprint: 'fingerprint-1',
    });
    firstStore.close();

    const secondStore = openStore();

    expect(await secondStore.count()).toBe(1);
    expect(await secondStore.readIndexFingerprint()).toBe('fingerprint-1');
    expect((await secondStore.search(axisVector(2)))[0]!.chunk).toEqual({
      documentId: 'a',
      index: 0,
      text: 'a text 0',
    });
  });

  it('has no fingerprint until replaceAll saves one', async () => {
    const store = openStore();

    expect(await store.readIndexFingerprint()).toBeUndefined();
  });

  it('replaces the previous content and fingerprint in replaceAll', async () => {
    const store = openStore();
    await store.replaceAll([createEntry('old', 0, axisVector(0))], {
      indexFingerprint: 'old-fingerprint',
    });

    await store.replaceAll([createEntry('new', 0, axisVector(1))]);

    expect(await store.count()).toBe(1);
    expect((await store.search(axisVector(1)))[0]!.chunk.documentId).toBe(
      'new',
    );
    expect(await store.readIndexFingerprint()).toBeUndefined();
  });

  it('leaves the previous content untouched when replaceAll is invalid', async () => {
    const store = openStore();
    await store.replaceAll([createEntry('old', 0, axisVector(0))], {
      indexFingerprint: 'old-fingerprint',
    });

    await expect(
      store.replaceAll([
        createEntry('new', 0, axisVector(1)),
        createEntry('bad', 0, [2, 0, 0, 0]),
      ]),
    ).rejects.toThrow('normalized');

    expect(await store.count()).toBe(1);
    expect(await store.readIndexFingerprint()).toBe('old-fingerprint');
  });

  it('upsert adds and replaces chunks by id and forgets the fingerprint', async () => {
    const store = openStore();
    await store.replaceAll([createEntry('a', 0, axisVector(0))], {
      indexFingerprint: 'fingerprint',
    });

    await store.upsert([
      createEntry('a', 0, axisVector(1), 'changed'),
      createEntry('b', 0, axisVector(2)),
    ]);

    expect(await store.count()).toBe(2);
    expect((await store.search(axisVector(1)))[0]!.chunk.text).toBe('changed');
    expect(await store.readIndexFingerprint()).toBeUndefined();
  });

  it('rolls back upsert when it would exceed the limit', async () => {
    const store = openStore(databasePath, 2);
    await store.replaceAll([
      createEntry('a', 0, axisVector(0)),
      createEntry('a', 1, axisVector(1)),
    ]);

    await expect(
      store.upsert([createEntry('b', 0, axisVector(2))]),
    ).rejects.toThrow('Cannot store more than 2 chunks');

    expect(await store.count()).toBe(2);
  });

  it('rejects more chunks than the limit in replaceAll', async () => {
    const store = openStore(databasePath, 1);

    await expect(
      store.replaceAll([
        createEntry('a', 0, axisVector(0)),
        createEntry('a', 1, axisVector(1)),
      ]),
    ).rejects.toThrow('Cannot store more than 1 chunks');
  });

  it('rejects embeddings with a wrong size, NaN or a wrong length', async () => {
    const store = openStore();

    await expect(
      store.replaceAll([createEntry('a', 0, [1, 0])]),
    ).rejects.toThrow('4 dimensions');
    await expect(
      store.replaceAll([createEntry('a', 0, [Number.NaN, 0, 0, 0])]),
    ).rejects.toThrow('finite');
    await expect(store.search([1, 1, 1, 1])).rejects.toThrow('normalized');
  });

  it('stores quotes and SQL-like text literally', async () => {
    const store = openStore();
    const dangerousText = `'); DROP TABLE chunks; --`;
    await store.replaceAll([
      createEntry(`doc'--`, 0, axisVector(0), dangerousText),
    ]);

    const [result] = await store.search(axisVector(0));

    expect(result!.chunk).toEqual({
      documentId: `doc'--`,
      index: 0,
      text: dangerousText,
    });
    expect(await store.count()).toBe(1);
  });

  it('creates the database file readable only by its owner', () => {
    openStore();

    expect(statSync(databasePath).mode & 0o777).toBe(0o600);
  });

  it('works with an in-memory database', async () => {
    const store = openStore(IN_MEMORY_DATABASE_PATH);

    await store.replaceAll([createEntry('a', 0, axisVector(0))]);

    expect(await store.count()).toBe(1);
  });

  it('refuses a database with an unknown schema version', () => {
    openStore().close();
    const database = new DatabaseSync(databasePath);
    database.exec('PRAGMA user_version = 99');
    database.close();

    expect(() => openStore()).toThrow('schema version 99');
  });

  it('fails loudly when stored embeddings have another size', async () => {
    const store = openStore();
    await store.replaceAll([createEntry('a', 0, axisVector(0))]);
    store.close();

    const otherSizeStore = new SqliteVectorStore({
      databasePath,
      dimensions: DIMENSIONS + 1,
    });
    openStores.push(otherSizeStore);

    await expect(otherSizeStore.search([1, 0, 0, 0, 0])).rejects.toThrow(
      'wrong size',
    );
  });

  it('rejects invalid dimensions', () => {
    expect(
      () =>
        new SqliteVectorStore({
          databasePath: IN_MEMORY_DATABASE_PATH,
          dimensions: 0,
        }),
    ).toThrow(RangeError);
  });
});
