import type { DocumentChunk } from '../documents/document.types.js';

/** Unique id of a chunk, for example "leave-policy#2". */
export function createChunkId(chunk: DocumentChunk): string {
  return `${chunk.documentId}#${chunk.index}`;
}
