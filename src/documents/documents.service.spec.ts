import { join } from 'node:path';
import { DocumentsService } from './documents.service.js';

const SAMPLE_DIR = join(process.cwd(), 'data', 'documents');

describe('DocumentsService', () => {
  const service = new DocumentsService();

  it('loads the sample .txt documents sorted by name', async () => {
    const loadedDocuments = await service.loadDocuments(SAMPLE_DIR);
    const documentIds = loadedDocuments.map((document) => document.id);

    expect(documentIds).toEqual(
      expect.arrayContaining([
        'expense-policy',
        'it-password-reset',
        'it-vpn-access',
        'leave-policy',
        'remote-work',
      ]),
    );
    expect(documentIds).toEqual([...documentIds].sort());
    for (const document of loadedDocuments) {
      expect(document.text.length).toBeGreaterThan(0);
    }
  });

  it('chunks documents and keeps source and index', () => {
    const chunks = service.chunkDocuments(
      [
        { id: 'a', text: 'x'.repeat(50) },
        { id: 'b', text: 'y'.repeat(20) },
      ],
      { chunkSize: 30, overlap: 5 },
    );

    const chunkIndexesOfDocumentA = chunks
      .filter((chunk) => chunk.documentId === 'a')
      .map((chunk) => chunk.index);

    expect(chunkIndexesOfDocumentA).toEqual([0, 1]);
    expect(chunks.filter((chunk) => chunk.documentId === 'b')).toEqual([
      { documentId: 'b', index: 0, text: 'y'.repeat(20) },
    ]);
  });
});
