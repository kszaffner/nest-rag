import { createLlmProvider } from './create-llm-provider.js';
import type { LlmSettings } from './llm-settings.js';
import { MockLlmProvider } from './mock-llm.provider.js';
import { OllamaLlmProvider } from './ollama-llm.provider.js';

function createSettings(overrides: Partial<LlmSettings> = {}): LlmSettings {
  return {
    providerKind: 'mock',
    claude: {},
    ollama: { allowNonLocalHost: false },
    ...overrides,
  };
}

describe('createLlmProvider', () => {
  it('creates the mock provider', async () => {
    const provider = await createLlmProvider(createSettings());

    expect(provider).toBeInstanceOf(MockLlmProvider);
  });

  it('creates the Ollama provider', async () => {
    const provider = await createLlmProvider(
      createSettings({ providerKind: 'ollama' }),
    );

    expect(provider).toBeInstanceOf(OllamaLlmProvider);
  });

  it('keeps the Ollama defaults when the settings are not given', async () => {
    // Undefined values must not overwrite the defaults: with an undefined
    // address, creating the provider would fail.
    await expect(
      createLlmProvider(
        createSettings({
          providerKind: 'ollama',
          ollama: {
            baseUrl: undefined,
            model: undefined,
            allowNonLocalHost: false,
          },
        }),
      ),
    ).resolves.toBeInstanceOf(OllamaLlmProvider);
  });

  it('passes the Ollama settings on, so the address restriction applies', async () => {
    await expect(
      createLlmProvider(
        createSettings({
          providerKind: 'ollama',
          ollama: {
            baseUrl: 'http://ollama.example.com',
            allowNonLocalHost: false,
          },
        }),
      ),
    ).rejects.toThrow(/must point to this computer/);

    await expect(
      createLlmProvider(
        createSettings({
          providerKind: 'ollama',
          ollama: {
            baseUrl: 'http://ollama.example.com',
            allowNonLocalHost: true,
          },
        }),
      ),
    ).resolves.toBeInstanceOf(OllamaLlmProvider);
  });

  it('does not load the Claude SDK for the other providers', async () => {
    // Importing the SDK is blocked in the sandbox, so creating mock and
    // Ollama providers working here shows that it is not loaded.
    await expect(createLlmProvider(createSettings())).resolves.toBeDefined();
    await expect(
      createLlmProvider(createSettings({ providerKind: 'ollama' })),
    ).resolves.toBeDefined();
  });
});
