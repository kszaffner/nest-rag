import type { EmbeddingProvider } from './embedding-provider.interface.js';
import type { EmbeddingSettings } from './embedding-settings.js';
import { MockEmbeddingProvider } from './mock-embedding.provider.js';
import { TransformersEmbeddingProvider } from './transformers-embedding.provider.js';

/** Creates the provider selected in the settings. */
export function createEmbeddingProvider(
  settings: EmbeddingSettings,
): EmbeddingProvider {
  switch (settings.providerKind) {
    case 'mock':
      return new MockEmbeddingProvider();
    case 'transformers':
      return new TransformersEmbeddingProvider({
        localFilesOnly: settings.localFilesOnly,
        ...(settings.modelRevision && {
          modelRevision: settings.modelRevision,
        }),
      });
  }
}
