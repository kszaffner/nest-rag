import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  EMBEDDING_PROVIDER,
  type EmbeddingProvider,
} from '../embeddings/embedding-provider.interface.js';
import { EMBEDDING_ENVIRONMENT_KEYS } from '../embeddings/embedding-settings.js';
import { InMemoryVectorStore } from './in-memory-vector-store.js';
import { VECTOR_STORE, type VectorStore } from './vector-store.interface.js';
import { VectorStoreModule } from './vector-store.module.js';

describe('VectorStoreModule', () => {
  const originalProviderKind =
    process.env[EMBEDDING_ENVIRONMENT_KEYS.providerKind];

  beforeEach(() => {
    // Real environment variables take priority over `load`, so clear them.
    delete process.env[EMBEDDING_ENVIRONMENT_KEYS.providerKind];
  });

  afterEach(() => {
    if (originalProviderKind !== undefined) {
      process.env[EMBEDDING_ENVIRONMENT_KEYS.providerKind] =
        originalProviderKind;
    }
  });

  async function createTestingModule() {
    return Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({})],
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

  it('shares one store instance across the application', async () => {
    const testingModule = await createTestingModule();

    expect(testingModule.get(VECTOR_STORE)).toBe(
      testingModule.get(VECTOR_STORE),
    );
  });
});
