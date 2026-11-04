import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { vi } from 'vitest';
import type { IndexingService } from './indexing.service.js';
import { StartupIndexer } from './startup-indexer.js';

function createIndexer(
  indexDirectory: IndexingService['indexDirectory'],
  settings: Record<string, string> = {},
) {
  const configService = {
    get: (key: string) => settings[key],
  } as unknown as ConfigService;
  return new StartupIndexer(
    { indexDirectory } as IndexingService,
    configService,
  );
}

describe('StartupIndexer', () => {
  it('indexes the configured directory', async () => {
    const indexDirectory = vi
      .fn()
      .mockResolvedValue({ documentCount: 1, chunkCount: 1 });

    await createIndexer(indexDirectory, {
      DOCUMENTS_DIRECTORY: '/srv/docs',
    }).onApplicationBootstrap();

    expect(indexDirectory).toHaveBeenCalledWith('/srv/docs');
  });

  it('rethrows a failure so the application does not start', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const indexDirectory = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(
      createIndexer(indexDirectory).onApplicationBootstrap(),
    ).rejects.toThrow('boom');
  });
});
