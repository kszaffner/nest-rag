import {
  parseBooleanSetting,
  readTrimmedValue,
} from '../config/setting-parsers.js';

export const LLM_PROVIDER_KINDS = ['mock', 'ollama', 'claude'] as const;
export type LlmProviderKind = (typeof LLM_PROVIDER_KINDS)[number];

/** Free and offline, so a fresh checkout works without any setup. */
export const DEFAULT_LLM_PROVIDER_KIND: LlmProviderKind = 'mock';

export const LLM_ENVIRONMENT_KEYS = {
  providerKind: 'LLM_PROVIDER',
  claudeApiKey: 'ANTHROPIC_API_KEY',
  claudeModel: 'CLAUDE_MODEL',
  ollamaBaseUrl: 'OLLAMA_BASE_URL',
  ollamaModel: 'OLLAMA_MODEL',
  ollamaAllowNonLocalHost: 'OLLAMA_ALLOW_NON_LOCAL_HOST',
} as const;

export interface LlmSettings {
  providerKind: LlmProviderKind;
  claude: {
    /**
     * SECRET. Present only when the provider is "claude". Never log this
     * object and never put the key in an error message.
     */
    apiKey?: string;
    model?: string;
  };
  ollama: {
    baseUrl?: string;
    model?: string;
    /** See OllamaLlmOptions.allowNonLocalHost before setting it to true. */
    allowNonLocalHost: boolean;
  };
}

/**
 * Reads and validates the LLM configuration. Throws on an invalid value or a
 * missing key, so a mistake stops the application at startup instead of
 * failing later in the middle of a request (fail fast). Error messages name
 * the setting but never repeat its value.
 */
export function parseLlmSettings(
  readValue: (key: string) => string | undefined,
): LlmSettings {
  const providerKind = parseProviderKind(
    readValue(LLM_ENVIRONMENT_KEYS.providerKind),
  );

  // The secret is read only when it is needed, so the other providers never
  // carry it around.
  let apiKey: string | undefined;
  if (providerKind === 'claude') {
    apiKey = readTrimmedValue(readValue(LLM_ENVIRONMENT_KEYS.claudeApiKey));
    if (apiKey === undefined) {
      throw new Error(
        `${LLM_ENVIRONMENT_KEYS.claudeApiKey} is required when ${LLM_ENVIRONMENT_KEYS.providerKind} is claude`,
      );
    }
  }

  return {
    providerKind,
    claude: {
      ...(apiKey !== undefined && { apiKey }),
      model: readTrimmedValue(readValue(LLM_ENVIRONMENT_KEYS.claudeModel)),
    },
    ollama: {
      baseUrl: readTrimmedValue(readValue(LLM_ENVIRONMENT_KEYS.ollamaBaseUrl)),
      model: readTrimmedValue(readValue(LLM_ENVIRONMENT_KEYS.ollamaModel)),
      allowNonLocalHost: parseBooleanSetting(
        LLM_ENVIRONMENT_KEYS.ollamaAllowNonLocalHost,
        readValue(LLM_ENVIRONMENT_KEYS.ollamaAllowNonLocalHost),
      ),
    },
  };
}

function parseProviderKind(rawValue: string | undefined): LlmProviderKind {
  const trimmedValue = readTrimmedValue(rawValue);
  if (trimmedValue === undefined) {
    return DEFAULT_LLM_PROVIDER_KIND;
  }
  const matchingKind = LLM_PROVIDER_KINDS.find((kind) => kind === trimmedValue);
  if (!matchingKind) {
    throw new Error(
      `${LLM_ENVIRONMENT_KEYS.providerKind} must be one of: ${LLM_PROVIDER_KINDS.join(', ')}`,
    );
  }
  return matchingKind;
}
