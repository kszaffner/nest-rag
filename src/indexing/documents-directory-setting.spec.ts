import { isAbsolute, resolve } from 'node:path';
import {
  DEFAULT_DOCUMENTS_DIRECTORY,
  parseDocumentsDirectorySetting,
} from './documents-directory-setting.js';

describe('parseDocumentsDirectorySetting', () => {
  it('uses the sample documents by default', () => {
    expect(
      parseDocumentsDirectorySetting(() => undefined).documentsDirectory,
    ).toBe(resolve(DEFAULT_DOCUMENTS_DIRECTORY));
  });

  it('treats a blank value as missing', () => {
    expect(parseDocumentsDirectorySetting(() => '   ').documentsDirectory).toBe(
      resolve(DEFAULT_DOCUMENTS_DIRECTORY),
    );
  });

  it('resolves a relative directory against the working directory', () => {
    const { documentsDirectory } = parseDocumentsDirectorySetting(
      () => ' my/docs ',
    );
    expect(documentsDirectory).toBe(resolve('my/docs'));
    expect(isAbsolute(documentsDirectory)).toBe(true);
  });

  it('keeps an absolute directory as it is', () => {
    expect(
      parseDocumentsDirectorySetting(() => '/srv/docs').documentsDirectory,
    ).toBe('/srv/docs');
  });
});
