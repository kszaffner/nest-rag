import {
  DEFAULT_LLM_PROVIDER_KIND,
  LLM_ENVIRONMENT_KEYS,
  parseLlmSettings,
} from './llm-settings.js';

const SECRET_API_KEY = 'sk-ant-this-secret-must-never-be-printed';

function settingsFrom(values: Record<string, string>) {
  return parseLlmSettings((key) => values[key]);
}

describe('parseLlmSettings', () => {
  it('uses the free mock provider when nothing is configured', () => {
    expect(settingsFrom({})).toEqual({
      providerKind: DEFAULT_LLM_PROVIDER_KIND,
      claude: { model: undefined },
      ollama: {
        baseUrl: undefined,
        model: undefined,
        allowNonLocalHost: false,
      },
    });
    expect(DEFAULT_LLM_PROVIDER_KIND).toBe('mock');
  });

  it('treats blank values like missing ones', () => {
    const settings = settingsFrom({
      [LLM_ENVIRONMENT_KEYS.providerKind]: '   ',
      [LLM_ENVIRONMENT_KEYS.ollamaBaseUrl]: '',
      [LLM_ENVIRONMENT_KEYS.ollamaModel]: '  ',
      [LLM_ENVIRONMENT_KEYS.ollamaAllowNonLocalHost]: ' ',
    });

    expect(settings.providerKind).toBe('mock');
    expect(settings.ollama).toEqual({
      baseUrl: undefined,
      model: undefined,
      allowNonLocalHost: false,
    });
  });

  it('reads the Ollama settings and trims them', () => {
    const settings = settingsFrom({
      [LLM_ENVIRONMENT_KEYS.providerKind]: ' ollama ',
      [LLM_ENVIRONMENT_KEYS.ollamaBaseUrl]: ' http://localhost:11434 ',
      [LLM_ENVIRONMENT_KEYS.ollamaModel]: 'qwen3:0.6b',
      [LLM_ENVIRONMENT_KEYS.ollamaAllowNonLocalHost]: 'true',
    });

    expect(settings.providerKind).toBe('ollama');
    expect(settings.ollama).toEqual({
      baseUrl: 'http://localhost:11434',
      model: 'qwen3:0.6b',
      allowNonLocalHost: true,
    });
  });

  it('reads the Claude settings, including the key', () => {
    const settings = settingsFrom({
      [LLM_ENVIRONMENT_KEYS.providerKind]: 'claude',
      [LLM_ENVIRONMENT_KEYS.claudeApiKey]: `  ${SECRET_API_KEY}  `,
      [LLM_ENVIRONMENT_KEYS.claudeModel]: 'claude-haiku-5-5',
    });

    expect(settings.providerKind).toBe('claude');
    expect(settings.claude).toEqual({
      apiKey: SECRET_API_KEY,
      model: 'claude-haiku-5-5',
    });
  });

  describe('the API key', () => {
    it('is required for claude, and the error names the setting only', () => {
      expect(() =>
        settingsFrom({ [LLM_ENVIRONMENT_KEYS.providerKind]: 'claude' }),
      ).toThrow('ANTHROPIC_API_KEY is required when LLM_PROVIDER is claude');
    });

    it('is not accepted when it is blank', () => {
      expect(() =>
        settingsFrom({
          [LLM_ENVIRONMENT_KEYS.providerKind]: 'claude',
          [LLM_ENVIRONMENT_KEYS.claudeApiKey]: '   ',
        }),
      ).toThrow(/ANTHROPIC_API_KEY is required/);
    });

    it('is not required for mock or ollama', () => {
      expect(() => settingsFrom({})).not.toThrow();
      expect(() =>
        settingsFrom({ [LLM_ENVIRONMENT_KEYS.providerKind]: 'ollama' }),
      ).not.toThrow();
    });

    it('is not carried into the settings of the other providers', () => {
      for (const providerKind of ['mock', 'ollama']) {
        const settings = settingsFrom({
          [LLM_ENVIRONMENT_KEYS.providerKind]: providerKind,
          [LLM_ENVIRONMENT_KEYS.claudeApiKey]: SECRET_API_KEY,
        });

        expect(JSON.stringify(settings)).not.toContain(SECRET_API_KEY);
      }
    });

    it('is never repeated in an error message', () => {
      const failingSettings = [
        {
          [LLM_ENVIRONMENT_KEYS.providerKind]: 'claud',
          [LLM_ENVIRONMENT_KEYS.claudeApiKey]: SECRET_API_KEY,
        },
        {
          [LLM_ENVIRONMENT_KEYS.providerKind]: 'claude',
          [LLM_ENVIRONMENT_KEYS.claudeApiKey]: SECRET_API_KEY,
          [LLM_ENVIRONMENT_KEYS.ollamaAllowNonLocalHost]: 'maybe',
        },
      ];

      for (const values of failingSettings) {
        expect(() => settingsFrom(values)).toThrow();
        try {
          settingsFrom(values);
        } catch (error) {
          expect((error as Error).message).not.toContain(SECRET_API_KEY);
        }
      }
    });
  });

  it('rejects an unknown provider instead of falling back silently', () => {
    expect(() =>
      settingsFrom({ [LLM_ENVIRONMENT_KEYS.providerKind]: 'openai' }),
    ).toThrow(/LLM_PROVIDER must be one of: mock, ollama, claude/);
  });

  it('rejects a boolean that is not exactly "true" or "false"', () => {
    expect(() =>
      settingsFrom({ [LLM_ENVIRONMENT_KEYS.ollamaAllowNonLocalHost]: 'yes' }),
    ).toThrow(/OLLAMA_ALLOW_NON_LOCAL_HOST must be "true" or "false"/);
  });
});
