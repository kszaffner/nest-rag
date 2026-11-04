import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  EMBEDDING_PROVIDER,
  type EmbeddingProvider,
} from './embedding-provider.interface.js';
import { EMBEDDING_ENVIRONMENT_KEYS } from './embedding-settings.js';
import { EmbeddingsModule } from './embeddings.module.js';
import { MockEmbeddingProvider } from './mock-embedding.provider.js';
import { TransformersEmbeddingProvider } from './transformers-embedding.provider.js';

async function createProviderFromConfig(
  configValues: Record<string, string>,
): Promise<EmbeddingProvider> {
  const testingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [() => configValues],
      }),
      EmbeddingsModule,
    ],
  }).compile();

  return testingModule.get<EmbeddingProvider>(EMBEDDING_PROVIDER);
}

describe('EmbeddingsModule', () => {
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

  it('provides the mock provider by default', async () => {
    const provider = await createProviderFromConfig({});

    expect(provider).toBeInstanceOf(MockEmbeddingProvider);
  });

  it('provides the transformers provider when configured', async () => {
    const provider = await createProviderFromConfig({
      [EMBEDDING_ENVIRONMENT_KEYS.providerKind]: 'transformers',
    });

    // The model is loaded lazily, so this test downloads nothing.
    expect(provider).toBeInstanceOf(TransformersEmbeddingProvider);
  });

  it('fails at startup for an unknown provider', async () => {
    await expect(
      createProviderFromConfig({
        [EMBEDDING_ENVIRONMENT_KEYS.providerKind]: 'openai',
      }),
    ).rejects.toThrow(/EMBEDDING_PROVIDER must be one of/);
  });
});
