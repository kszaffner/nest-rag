import {
  parseBooleanSetting,
  readTrimmedValue,
} from '../config/setting-parsers.js';

export const EMBEDDING_PROVIDER_KINDS = ['mock', 'transformers'] as const;
export type EmbeddingProviderKind = (typeof EMBEDDING_PROVIDER_KINDS)[number];

/** Free and offline, so a fresh checkout works without any setup. */
export const DEFAULT_EMBEDDING_PROVIDER_KIND: EmbeddingProviderKind = 'mock';

export const EMBEDDING_ENVIRONMENT_KEYS = {
  providerKind: 'EMBEDDING_PROVIDER',
  localFilesOnly: 'EMBEDDING_LOCAL_FILES_ONLY',
  modelRevision: 'EMBEDDING_MODEL_REVISION',
} as const;

export interface EmbeddingSettings {
  providerKind: EmbeddingProviderKind;
  /** When true, the model is never downloaded from the internet. */
  localFilesOnly: boolean;
  /** Exact revision (commit) of the model repository to use. */
  modelRevision?: string;
}

/**
 * Reads and validates the embedding configuration. Throws on an invalid
 * value, so a typo stops the application at startup instead of silently
 * switching to a different provider (fail fast).
 */
export function parseEmbeddingSettings(
  readValue: (key: string) => string | undefined,
): EmbeddingSettings {
  const providerKind = parseProviderKind(
    readValue(EMBEDDING_ENVIRONMENT_KEYS.providerKind),
  );
  const localFilesOnly = parseBooleanSetting(
    EMBEDDING_ENVIRONMENT_KEYS.localFilesOnly,
    readValue(EMBEDDING_ENVIRONMENT_KEYS.localFilesOnly),
  );
  const modelRevision = readTrimmedValue(
    readValue(EMBEDDING_ENVIRONMENT_KEYS.modelRevision),
  );

  return {
    providerKind,
    localFilesOnly,
    ...(modelRevision && { modelRevision }),
  };
}

function parseProviderKind(
  rawValue: string | undefined,
): EmbeddingProviderKind {
  const trimmedValue = rawValue?.trim();
  if (!trimmedValue) {
    return DEFAULT_EMBEDDING_PROVIDER_KIND;
  }
  const matchingKind = EMBEDDING_PROVIDER_KINDS.find(
    (kind) => kind === trimmedValue,
  );
  if (!matchingKind) {
    throw new Error(
      `${EMBEDDING_ENVIRONMENT_KEYS.providerKind} must be one of: ${EMBEDDING_PROVIDER_KINDS.join(', ')}`,
    );
  }
  return matchingKind;
}
