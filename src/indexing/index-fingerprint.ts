import { createHash } from 'node:crypto';
import type { DocumentChunk } from '../documents/document.types.js';

/**
 * Bump it when the way chunks are turned into stored rows changes in a way
 * the chunk texts alone cannot show, so old persistent indexes are rebuilt.
 */
const INDEX_FORMAT_VERSION = 1;

const FIELD_SEPARATOR = '\u0000';

export interface IndexFingerprintInput {
  /** Which model made the embeddings, see EmbeddingProvider.identity. */
  embeddingIdentity: string;
  dimensions: number;
  chunks: readonly DocumentChunk[];
}

/**
 * A SHA-256 hash of everything the index is built from: the embedding model,
 * and the id, position and text of every chunk. Changing a document, the
 * chunking rules or the model changes the fingerprint, so a saved index is
 * reused only when rebuilding it would give the same result.
 *
 * Fields are separated by a character that cannot appear in the hashed
 * numbers and are length-prefixed where text is free, so two different
 * inputs never produce the same byte sequence.
 */
export function createIndexFingerprint(input: IndexFingerprintInput): string {
  const hash = createHash('sha256');
  hash.update(
    [
      INDEX_FORMAT_VERSION,
      input.dimensions,
      input.embeddingIdentity.length,
      input.embeddingIdentity,
      input.chunks.length,
    ].join(FIELD_SEPARATOR),
  );
  for (const chunk of input.chunks) {
    hash.update(
      [
        chunk.documentId.length,
        chunk.documentId,
        chunk.index,
        chunk.text.length,
        chunk.text,
      ].join(FIELD_SEPARATOR),
    );
  }
  return hash.digest('hex');
}
