import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { chunkText, type ChunkOptions } from './chunker.js';
import type { DocumentChunk, SourceDocument } from './document.types.js';

const TEXT_FILE_EXTENSION = '.txt';
const TEXT_FILE_ENCODING = 'utf-8';

@Injectable()
export class DocumentsService {
  /** Reads every .txt file from `documentsDirectory`, sorted by name. */
  async loadDocuments(documentsDirectory: string): Promise<SourceDocument[]> {
    const textFileNames = (await readdir(documentsDirectory))
      .filter((fileName) => fileName.endsWith(TEXT_FILE_EXTENSION))
      .sort();

    return Promise.all(
      textFileNames.map(async (fileName) => ({
        id: fileName.slice(0, -TEXT_FILE_EXTENSION.length),
        text: await readFile(
          join(documentsDirectory, fileName),
          TEXT_FILE_ENCODING,
        ),
      })),
    );
  }

  /** Splits documents into chunks that remember where they came from. */
  chunkDocuments(
    documents: SourceDocument[],
    options?: ChunkOptions,
  ): DocumentChunk[] {
    return documents.flatMap((sourceDocument) =>
      chunkText(sourceDocument.text, options).map(
        (chunkContent, chunkIndex) => ({
          documentId: sourceDocument.id,
          index: chunkIndex,
          text: chunkContent,
        }),
      ),
    );
  }
}
