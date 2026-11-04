import {
  DEFAULT_EMBEDDING_PROVIDER_KIND,
  EMBEDDING_ENVIRONMENT_KEYS,
  parseEmbeddingSettings,
} from './embedding-settings.js';

function settingsFrom(values: Record<string, string>) {
  return parseEmbeddingSettings((key) => values[key]);
}

describe('parseEmbeddingSettings', () => {
  it('uses safe defaults when nothing is configured', () => {
    expect(settingsFrom({})).toEqual({
      providerKind: DEFAULT_EMBEDDING_PROVIDER_KIND,
      localFilesOnly: false,
    });
  });

  it('treats blank values like missing ones', () => {
    const settings = settingsFrom({
      [EMBEDDING_ENVIRONMENT_KEYS.providerKind]: '  ',
      [EMBEDDING_ENVIRONMENT_KEYS.localFilesOnly]: '',
      [EMBEDDING_ENVIRONMENT_KEYS.modelRevision]: '   ',
    });

    expect(settings).toEqual({
      providerKind: DEFAULT_EMBEDDING_PROVIDER_KIND,
      localFilesOnly: false,
    });
  });

  it('reads all values', () => {
    const settings = settingsFrom({
      [EMBEDDING_ENVIRONMENT_KEYS.providerKind]: 'transformers',
      [EMBEDDING_ENVIRONMENT_KEYS.localFilesOnly]: 'true',
      [EMBEDDING_ENVIRONMENT_KEYS.modelRevision]: ' abc1234 ',
    });

    expect(settings).toEqual({
      providerKind: 'transformers',
      localFilesOnly: true,
      modelRevision: 'abc1234',
    });
  });

  it('rejects an unknown provider instead of falling back silently', () => {
    expect(() =>
      settingsFrom({
        [EMBEDDING_ENVIRONMENT_KEYS.providerKind]: 'transformer',
      }),
    ).toThrow(/EMBEDDING_PROVIDER must be one of: mock, transformers/);
  });

  it('rejects a boolean that is not exactly "true" or "false"', () => {
    expect(() =>
      settingsFrom({ [EMBEDDING_ENVIRONMENT_KEYS.localFilesOnly]: 'yes' }),
    ).toThrow(/EMBEDDING_LOCAL_FILES_ONLY must be "true" or "false"/);
  });
});
