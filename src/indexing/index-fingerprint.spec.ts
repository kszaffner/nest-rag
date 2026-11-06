import { createIndexFingerprint } from './index-fingerprint.js';

const BASE_INPUT = {
  embeddingIdentity: 'model@1',
  dimensions: 384,
  chunks: [
    { documentId: 'a', index: 0, text: 'first' },
    { documentId: 'a', index: 1, text: 'second' },
  ],
};

describe('createIndexFingerprint', () => {
  it('is a stable SHA-256 hex string', () => {
    const fingerprint = createIndexFingerprint(BASE_INPUT);

    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(createIndexFingerprint({ ...BASE_INPUT })).toBe(fingerprint);
  });

  it.each([
    ['the model', { embeddingIdentity: 'model@2' }],
    ['the dimensions', { dimensions: 768 }],
    [
      'a chunk text',
      {
        chunks: [
          BASE_INPUT.chunks[0]!,
          { documentId: 'a', index: 1, text: 'second!' },
        ],
      },
    ],
    [
      'a chunk position',
      {
        chunks: [
          BASE_INPUT.chunks[0]!,
          { documentId: 'a', index: 2, text: 'second' },
        ],
      },
    ],
    [
      'a document id',
      {
        chunks: [
          { documentId: 'b', index: 0, text: 'first' },
          BASE_INPUT.chunks[1]!,
        ],
      },
    ],
    ['a removed chunk', { chunks: [BASE_INPUT.chunks[0]!] }],
  ])('changes when %s changes', (_description, change) => {
    expect(createIndexFingerprint({ ...BASE_INPUT, ...change })).not.toBe(
      createIndexFingerprint(BASE_INPUT),
    );
  });

  it('does not confuse text moved between neighbouring fields', () => {
    const first = createIndexFingerprint({
      ...BASE_INPUT,
      chunks: [{ documentId: 'ab', index: 0, text: 'c' }],
    });
    const second = createIndexFingerprint({
      ...BASE_INPUT,
      chunks: [{ documentId: 'a', index: 0, text: 'bc' }],
    });

    expect(first).not.toBe(second);
  });
});
