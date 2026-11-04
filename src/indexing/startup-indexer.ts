import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseDocumentsDirectorySetting } from './documents-directory-setting.js';
import { IndexingService } from './indexing.service.js';

/**
 * Builds the index once, before the application starts accepting requests.
 * When indexing fails, the error is thrown and the application does not
 * start (fail fast): an application without an index would answer every
 * question with "I could not find this in the documents".
 *
 * Future SQLite migration: the in-memory store forgets everything on
 * restart, which is why the whole index is rebuilt here on every start. With
 * a persistent store (SQLite + sqlite-vec) the index survives restarts, so
 * this class should then index only new or changed documents, or move to an
 * explicit "reindex" command.
 */
@Injectable()
export class StartupIndexer implements OnApplicationBootstrap {
  private readonly logger = new Logger(StartupIndexer.name);

  constructor(
    private readonly indexingService: IndexingService,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const { documentsDirectory } = parseDocumentsDirectorySetting((key) =>
      this.configService.get<string>(key),
    );
    try {
      await this.indexingService.indexDirectory(documentsDirectory);
    } catch (error) {
      // The path is trusted configuration, so it is safe and useful to log.
      this.logger.error(`Indexing ${documentsDirectory} failed`);
      throw error;
    }
  }
}
