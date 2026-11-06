import { isAbsolute, relative, resolve } from 'node:path';
import { readTrimmedValue } from '../config/setting-parsers.js';

export const VECTOR_STORE_KINDS = ['memory', 'sqlite'] as const;
export type VectorStoreKind = (typeof VECTOR_STORE_KINDS)[number];

/** Needs no files and starts empty, so a fresh checkout works without setup. */
export const DEFAULT_VECTOR_STORE_KIND: VectorStoreKind = 'memory';

/** Relative to the working directory. The file is ignored by git. */
export const DEFAULT_SQLITE_DATABASE_PATH = 'data/index.sqlite';

export const VECTOR_STORE_ENVIRONMENT_KEYS = {
  kind: 'VECTOR_STORE',
  sqliteDatabasePath: 'SQLITE_DATABASE_PATH',
} as const;

const PARENT_DIRECTORY_SEGMENT = '..';
const NULL_CHARACTER = '\0';

export interface VectorStoreSettings {
  kind: VectorStoreKind;
  /** Absolute path of the SQLite file, always inside the working directory. */
  sqliteDatabasePath: string;
}

/**
 * Reads and validates the vector store configuration. Throws on an invalid
 * value, so a typo stops the application at startup instead of silently
 * switching to a store that forgets everything (fail fast).
 *
 * The database path is trusted configuration, but it must still stay inside
 * the working directory: a wrong value such as "/etc/passwd" or "../x" would
 * otherwise make the application create or overwrite files elsewhere.
 */
export function parseVectorStoreSettings(
  readValue: (key: string) => string | undefined,
  workingDirectory: string = process.cwd(),
): VectorStoreSettings {
  return {
    kind: parseKind(readValue(VECTOR_STORE_ENVIRONMENT_KEYS.kind)),
    sqliteDatabasePath: parseDatabasePath(
      readValue(VECTOR_STORE_ENVIRONMENT_KEYS.sqliteDatabasePath),
      workingDirectory,
    ),
  };
}

function parseKind(rawValue: string | undefined): VectorStoreKind {
  const trimmedValue = readTrimmedValue(rawValue);
  if (trimmedValue === undefined) {
    return DEFAULT_VECTOR_STORE_KIND;
  }
  const matchingKind = VECTOR_STORE_KINDS.find((kind) => kind === trimmedValue);
  if (!matchingKind) {
    throw new Error(
      `${VECTOR_STORE_ENVIRONMENT_KEYS.kind} must be one of: ${VECTOR_STORE_KINDS.join(', ')}`,
    );
  }
  return matchingKind;
}

function parseDatabasePath(
  rawValue: string | undefined,
  workingDirectory: string,
): string {
  const configuredPath =
    readTrimmedValue(rawValue) ?? DEFAULT_SQLITE_DATABASE_PATH;
  const absolutePath = resolve(workingDirectory, configuredPath);
  const pathFromWorkingDirectory = relative(workingDirectory, absolutePath);

  const isInsideWorkingDirectory =
    pathFromWorkingDirectory !== '' &&
    !isAbsolute(pathFromWorkingDirectory) &&
    pathFromWorkingDirectory.split(/[\\/]/)[0] !== PARENT_DIRECTORY_SEGMENT;
  if (!isInsideWorkingDirectory || configuredPath.includes(NULL_CHARACTER)) {
    throw new Error(
      `${VECTOR_STORE_ENVIRONMENT_KEYS.sqliteDatabasePath} must be a file path inside the project directory`,
    );
  }
  return absolutePath;
}
