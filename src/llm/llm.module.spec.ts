import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { LLM_PROVIDER, type LlmProvider } from './llm-provider.interface.js';
import { LLM_ENVIRONMENT_KEYS } from './llm-settings.js';
import { LlmModule } from './llm.module.js';
import { MockLlmProvider } from './mock-llm.provider.js';
import { OllamaLlmProvider } from './ollama-llm.provider.js';

const ALL_LLM_KEYS = Object.values(LLM_ENVIRONMENT_KEYS);

async function createProviderFromConfig(
  configValues: Record<string, string>,
): Promise<LlmProvider> {
  const testingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [() => configValues],
      }),
      LlmModule,
    ],
  }).compile();

  return testingModule.get<LlmProvider>(LLM_PROVIDER);
}

describe('LlmModule', () => {
  const originalEnvironment = new Map<string, string | undefined>();

  beforeEach(() => {
    // Real environment variables take priority over `load`, so clear them.
    for (const key of ALL_LLM_KEYS) {
      originalEnvironment.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, value] of originalEnvironment) {
      if (value !== undefined) {
        process.env[key] = value;
      }
    }
    originalEnvironment.clear();
  });

  it('provides the mock provider by default', async () => {
    const provider = await createProviderFromConfig({});

    expect(provider).toBeInstanceOf(MockLlmProvider);
  });

  it('provides the Ollama provider when configured', async () => {
    const provider = await createProviderFromConfig({
      [LLM_ENVIRONMENT_KEYS.providerKind]: 'ollama',
    });

    expect(provider).toBeInstanceOf(OllamaLlmProvider);
  });

  it('shares one provider instance across the application', async () => {
    const testingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({})],
        }),
        LlmModule,
      ],
    }).compile();

    expect(testingModule.get(LLM_PROVIDER)).toBe(
      testingModule.get(LLM_PROVIDER),
    );
  });

  it('fails at startup for an unknown provider', async () => {
    await expect(
      createProviderFromConfig({ [LLM_ENVIRONMENT_KEYS.providerKind]: 'gpt' }),
    ).rejects.toThrow(/LLM_PROVIDER must be one of/);
  });

  it('fails at startup when Claude is chosen without a key', async () => {
    await expect(
      createProviderFromConfig({
        [LLM_ENVIRONMENT_KEYS.providerKind]: 'claude',
      }),
    ).rejects.toThrow(/ANTHROPIC_API_KEY is required/);
  });

  it('fails at startup when Ollama points to another computer without permission', async () => {
    await expect(
      createProviderFromConfig({
        [LLM_ENVIRONMENT_KEYS.providerKind]: 'ollama',
        [LLM_ENVIRONMENT_KEYS.ollamaBaseUrl]: 'http://ollama.example.com',
      }),
    ).rejects.toThrow(/must point to this computer/);
  });
});
