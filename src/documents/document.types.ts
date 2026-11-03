export interface SourceDocument {
  /** File name without extension, e.g. "rag". */
  id: string;
  text: string;
}

export interface DocumentChunk {
  documentId: string;
  /** Position of the chunk within its document, starting at 0. */
  index: number;
  text: string;
}
