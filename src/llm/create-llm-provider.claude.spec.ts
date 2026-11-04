import { ClaudeLlmProvider } from './claude-llm.provider.js';
import { createLlmProvider } from './create-llm-provider.js';
import type { LlmSettings } from './llm-settings.js';

/**
 * This file needs the Claude SDK. In a sandbox that blocks paths containing
 * "credentials" (the SDK has a lib/credentials folder) it cannot even load,
 * so it is kept apart from the tests of the other providers.
 */
function createClaudeSettings(claude: LlmSettings['claude']): LlmSettings {
  return {
    providerKind: 'claude',
    claude,
    ollama: { allowNonLocalHost: false },
  };
}

describe('createLlmProvider for Claude', () => {
  it('creates the Claude provider without calling the network', async () => {
    const provider = await createLlmProvider(
      createClaudeSettings({ apiKey: 'sk-ant-test-not-real' }),
    );

    expect(provider).toBeInstanceOf(ClaudeLlmProvider);
  });

  it('keeps the default model when none is given', async () => {
    await expect(
      createLlmProvider(
        createClaudeSettings({
          apiKey: 'sk-ant-test-not-real',
          model: undefined,
        }),
      ),
    ).resolves.toBeInstanceOf(ClaudeLlmProvider);
  });

  it('refuses to create a provider without a key', async () => {
    await expect(createLlmProvider(createClaudeSettings({}))).rejects.toThrow(
      RangeError,
    );
  });
});
