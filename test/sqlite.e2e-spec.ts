import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { vi } from 'vitest';
import { configureApplication } from './../src/app-setup.js';
import { AppModule } from './../src/app.module.js';
import { MockEmbeddingProvider } from './../src/embeddings/mock-embedding.provider.js';
import { VECTOR_STORE_ENVIRONMENT_KEYS } from './../src/vector-store/vector-store-settings.js';

describe('SQLite vector store (e2e)', () => {
  let temporaryDirectory: string;
  let databasePath: string;
  const originalValues = {
    kind: process.env[VECTOR_STORE_ENVIRONMENT_KEYS.kind],
    path: process.env[VECTOR_STORE_ENVIRONMENT_KEYS.sqliteDatabasePath],
  };

  beforeEach(() => {
    // The database must be inside the project, so use a git-ignored directory.
    temporaryDirectory = mkdtempSync(join(process.cwd(), '.cache', 'e2e-'));
    databasePath = join(temporaryDirectory, 'index.sqlite');
    process.env[VECTOR_STORE_ENVIRONMENT_KEYS.kind] = 'sqlite';
    process.env[VECTOR_STORE_ENVIRONMENT_KEYS.sqliteDatabasePath] =
      databasePath;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnvironment(VECTOR_STORE_ENVIRONMENT_KEYS.kind, originalValues.kind);
    restoreEnvironment(
      VECTOR_STORE_ENVIRONMENT_KEYS.sqliteDatabasePath,
      originalValues.path,
    );
    rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  function restoreEnvironment(key: string, value: string | undefined) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  async function startApplication(): Promise<INestApplication> {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApplication(app);
    await app.init();
    return app;
  }

  async function askQuestion(app: INestApplication) {
    return request(app.getHttpServer())
      .post('/rag/query')
      .send({ question: 'How many days of annual leave do I get?' })
      .expect(200);
  }

  it('builds the index once and reuses it after a restart', async () => {
    const embedManySpy = vi.spyOn(MockEmbeddingProvider.prototype, 'embedMany');

    const firstApp = await startApplication();
    const firstAnswer = await askQuestion(firstApp);
    await firstApp.close();
    expect(embedManySpy).toHaveBeenCalled();
    embedManySpy.mockClear();

    const secondApp = await startApplication();
    const secondAnswer = await askQuestion(secondApp);
    await secondApp.close();

    expect(embedManySpy).not.toHaveBeenCalled();
    expect(secondAnswer.body.sources).toEqual(firstAnswer.body.sources);
    expect(secondAnswer.body.sources.length).toBeGreaterThan(0);
  });

  it('creates the database file readable only by its owner', async () => {
    const app = await startApplication();
    await app.close();

    expect(statSync(databasePath).mode & 0o777).toBe(0o600);
  });
});
