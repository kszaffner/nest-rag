import { isAbsolute, resolve } from 'node:path';
import { readTrimmedValue } from '../config/setting-parsers.js';

export const DOCUMENTS_DIRECTORY_ENVIRONMENT_KEY = 'DOCUMENTS_DIRECTORY';

/** The sample documents of this repository, relative to the working directory. */
export const DEFAULT_DOCUMENTS_DIRECTORY = 'data/documents';

export interface DocumentsDirectorySetting {
  /** Absolute path of the directory whose .txt files are indexed. */
  documentsDirectory: string;
}

/**
 * Reads where the documents are. The value is trusted configuration, set by
 * whoever runs the application. It must never come from a request, because
 * every .txt file in that directory is read and later sent to the model.
 */
export function parseDocumentsDirectorySetting(
  readValue: (key: string) => string | undefined,
): DocumentsDirectorySetting {
  const configuredDirectory = readTrimmedValue(
    readValue(DOCUMENTS_DIRECTORY_ENVIRONMENT_KEY),
  );
  const directory = configuredDirectory ?? DEFAULT_DOCUMENTS_DIRECTORY;
  return {
    documentsDirectory: isAbsolute(directory) ? directory : resolve(directory),
  };
}
