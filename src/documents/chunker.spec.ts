import { chunkText } from './chunker.js';

describe('chunkText', () => {
  it('returns a single chunk for short text', () => {
    expect(chunkText('Hello world.', { chunkSize: 100, overlap: 10 })).toEqual([
      'Hello world.',
    ]);
  });

  it('returns no chunks for empty or whitespace-only text', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n  ')).toEqual([]);
  });

  it('never exceeds chunkSize', () => {
    const text = 'word '.repeat(300);
    const chunks = chunkText(text, { chunkSize: 80, overlap: 20 });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(80);
    }
  });

  it('prefers cutting at a sentence boundary', () => {
    const text = 'First sentence is here. Second sentence follows after it.';
    const [first] = chunkText(text, { chunkSize: 35, overlap: 5 });

    expect(first).toBe('First sentence is here.');
  });

  it('prefers cutting at a paragraph boundary', () => {
    const text = 'Paragraph one text.\n\nParagraph two text goes on and on.';
    const [first] = chunkText(text, { chunkSize: 30, overlap: 5 });

    expect(first).toBe('Paragraph one text.');
  });

  it('overlaps neighbouring chunks', () => {
    const text = 'abcdefghij'.repeat(10);
    const [first, second] = chunkText(text, { chunkSize: 30, overlap: 10 });

    expect(second!.startsWith(first!.slice(-10))).toBe(true);
  });

  it('covers the whole text', () => {
    const text = 'abcdefghij'.repeat(10);
    const chunks = chunkText(text, { chunkSize: 30, overlap: 10 });

    expect(chunks.at(-1)!.endsWith(text.slice(-5))).toBe(true);
  });

  it('rejects invalid options', () => {
    expect(() => chunkText('x', { chunkSize: 0, overlap: 0 })).toThrow(
      RangeError,
    );
    expect(() => chunkText('x', { chunkSize: 10, overlap: 10 })).toThrow(
      RangeError,
    );
    expect(() => chunkText('x', { chunkSize: 10, overlap: -1 })).toThrow(
      RangeError,
    );
  });
});
