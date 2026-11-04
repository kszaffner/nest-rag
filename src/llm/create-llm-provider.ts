import { omitUndefined } from '../config/setting-parsers.js';
import type { LlmProvider } from './llm-provider.interface.js';
import type { LlmSettings } from './llm-settings.js';
import { MockLlmProvider } from './mock-llm.provider.js';
import { OllamaLlmProvider } from './ollama-llm.provider.js';

/**
 * Creates the provider selected in the settings. It is asynchronous because
 * the Claude SDK is loaded only when Claude is selected, so the other
 * providers never pay for loading it.
 */
export async function createLlmProvider(
  settings: LlmSettings,
): Promise<LlmProvider> {
  switch (settings.providerKind) {
    case 'mock':
      return new MockLlmProvider();
    case 'ollama':
      // Undefined values are dropped so they cannot overwrite the defaults.
      return new OllamaLlmProvider(omitUndefined(settings.ollama));
    case 'claude': {
      const { ClaudeLlmProvider, createClaudeMessagesApi } =
        await import('./claude-llm.provider.js');
      return new ClaudeLlmProvider(
        createClaudeMessagesApi({ apiKey: settings.claude.apiKey ?? '' }),
        omitUndefined({ model: settings.claude.model }),
      );
    }
  }
}
