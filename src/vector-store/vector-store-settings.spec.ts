import { join } from 'node:path';
import {
  DEFAULT_SQLITE_DATABASE_PATH,
  parseVectorStoreSettings,
  VECTOR_STORE_ENVIRONMENT_KEYS,
} from './vector-store-settings.js';

const PROJECT_DIRECTORY = join('/', 'projects', 'nest-rag');

function parse(values: Record<string, string>) {
  return parseVectorStoreSettings((key) => values[key], PROJECT_DIRECTORY);
}

describe('parseVectorStoreSettings', () => {
  it('uses the in-memory store and the default file when nothing is set', () => {
    expect(parse({})).toEqual({
      kind: 'memory',
      sqliteDatabasePath: join(PROJECT_DIRECTORY, DEFAULT_SQLITE_DATABASE_PATH),
    });
  });

  it('accepts sqlite and ignores surrounding spaces', () => {
    expect(
      parse({ [VECTOR_STORE_ENVIRONMENT_KEYS.kind]: '  sqlite ' }).kind,
    ).toBe('sqlite');
  });

  it('treats a blank value as not set', () => {
    expect(parse({ [VECTOR_STORE_ENVIRONMENT_KEYS.kind]: '   ' }).kind).toBe(
      'memory',
    );
  });

  it('rejects an unknown store kind', () => {
    expect(() =>
      parse({ [VECTOR_STORE_ENVIRONMENT_KEYS.kind]: 'mongo' }),
    ).toThrow('VECTOR_STORE must be one of: memory, sqlite');
  });

  it('resolves a relative database path against the project directory', () => {
    expect(
      parse({
        [VECTOR_STORE_ENVIRONMENT_KEYS.sqliteDatabasePath]: 'db/x.sqlite',
      }).sqliteDatabasePath,
    ).toBe(join(PROJECT_DIRECTORY, 'db', 'x.sqlite'));
  });

  it('accepts an absolute path inside the project directory', () => {
    const insidePath = join(PROJECT_DIRECTORY, 'data', 'x.sqlite');

    expect(
      parse({ [VECTOR_STORE_ENVIRONMENT_KEYS.sqliteDatabasePath]: insidePath })
        .sqliteDatabasePath,
    ).toBe(insidePath);
  });

  it.each([
    '../outside.sqlite',
    'data/../../outside.sqlite',
    '/etc/passwd',
    '.',
    'bad\0name.sqlite',
  ])('rejects the database path %j', (databasePath) => {
    expect(() =>
      parse({
        [VECTOR_STORE_ENVIRONMENT_KEYS.sqliteDatabasePath]: databasePath,
      }),
    ).toThrow('inside the project directory');
  });

  it('does not reject a file whose name starts with two dots', () => {
    expect(() =>
      parse({
        [VECTOR_STORE_ENVIRONMENT_KEYS.sqliteDatabasePath]: '..index.sqlite',
      }),
    ).not.toThrow();
  });
});
