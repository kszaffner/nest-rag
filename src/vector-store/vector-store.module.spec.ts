import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  EMBEDDING_PROVIDER,
  type EmbeddingProvider,
} from '../embeddings/embedding-provider.interface.js';
import { EMBEDDING_ENVIRONMENT_KEYS } from '../embeddings/embedding-settings.js';
import { InMemoryVectorStore } from './in-memory-vector-store.js';
import { SqliteVectorStore } from './sqlite-vector-store.js';
import { VECTOR_STORE_ENVIRONMENT_KEYS } from './vector-store-settings.js';
import { VECTOR_STORE, type VectorStore } from './vector-store.interface.js';
import { VectorStoreModule } from './vector-store.module.js';

describe('VectorStoreModule', () => {
  const environmentKeysToClear = [
    EMBEDDING_ENVIRONMENT_KEYS.providerKind,
    VECTOR_STORE_ENVIRONMENT_KEYS.kind,
    VECTOR_STORE_ENVIRONMENT_KEYS.sqliteDatabasePath,
  ];
  const originalVectorStoreValues = environmentKeysToClear.map(
    (key) => process.env[key],
  );
  let temporaryDirectory: string | undefined;

  beforeEach(() => {
    // Real environment variables take priority over `load`, so clear them.
    environmentKeysToClear.forEach((key) => delete process.env[key]);
  });

  afterEach(() => {
    environmentKeysToClear.forEach((key, position) => {
      const originalValue = originalVectorStoreValues[position];
      if (originalValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalValue;
      }
    });
    if (temporaryDirectory) {
      rmSync(temporaryDirectory, { recursive: true, force: true });
      temporaryDirectory = undefined;
    }
  });

  async function createTestingModule(settings: Record<string, string> = {}) {
    return Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => settings],
        }),
        VectorStoreModule,
      ],
    }).compile();
  }

  it('provides an in-memory store', async () => {
    const testingModule = await createTestingModule();

    const vectorStore = testingModule.get<VectorStore>(VECTOR_STORE);

    expect(vectorStore).toBeInstanceOf(InMemoryVectorStore);
  });

  it('creates a store that accepts only the size of the provider embeddings', async () => {
    const testingModule = await createTestingModule();
    const vectorStore = testingModule.get<VectorStore>(VECTOR_STORE);
    const embeddingProvider =
      testingModule.get<EmbeddingProvider>(EMBEDDING_PROVIDER);

    const matchingEmbedding = await embeddingProvider.embed('any text');
    const tooShortEmbedding = [1, 0, 0];

    await expect(vectorStore.search(matchingEmbedding)).resolves.toEqual([]);
    await expect(vectorStore.search(tooShortEmbedding)).rejects.toThrow(
      `${embeddingProvider.dimensions} dimensions`,
    );
  });

  it('provides a SQLite store that persists between restarts when VECTOR_STORE is sqlite', async () => {
    // The path must be inside the project, so use a git-ignored directory.
    temporaryDirectory = mkdtempSync(join(process.cwd(), '.cache', 'test-'));
    const settings = {
      [VECTOR_STORE_ENVIRONMENT_KEYS.kind]: 'sqlite',
      [VECTOR_STORE_ENVIRONMENT_KEYS.sqliteDatabasePath]: join(
        temporaryDirectory,
        'index.sqlite',
      ),
    };
    const firstModule = await createTestingModule(settings);
    const firstStore = firstModule.get<VectorStore>(VECTOR_STORE);
    const embeddingProvider =
      firstModule.get<EmbeddingProvider>(EMBEDDING_PROVIDER);
    await firstStore.replaceAll([
      {
        chunk: { documentId: 'a', index: 0, text: 'kept text' },
        embedding: await embeddingProvider.embed('kept text'),
      },
    ]);
    await firstModule.close();

    const secondModule = await createTestingModule(settings);
    const secondStore = secondModule.get<VectorStore>(VECTOR_STORE);

    expect(firstStore).toBeInstanceOf(SqliteVectorStore);
    await expect(secondStore.count()).resolves.toBe(1);
    await secondModule.close();
  });

  it('refuses to start with an unknown VECTOR_STORE value', async () => {
    await expect(
      createTestingModule({ [VECTOR_STORE_ENVIRONMENT_KEYS.kind]: 'redis' }),
    ).rejects.toThrow('VECTOR_STORE must be one of');
  });

  it('shares one store instance across the application', async () => {
    const testingModule = await createTestingModule();

    expect(testingModule.get(VECTOR_STORE)).toBe(
      testingModule.get(VECTOR_STORE),
    );
  });
});
