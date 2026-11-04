/**
 * Upper bounds protect the application from huge inputs that would exhaust
 * memory or CPU (OWASP API4: Unrestricted Resource Consumption).
 */
export const MAX_TEXT_LENGTH_IN_CHARACTERS = 5_000;
export const MAX_TEXTS_PER_BATCH = 256;

const MINIMUM_TEXT_LENGTH_IN_CHARACTERS = 1;

export function assertValidEmbeddingText(text: string): void {
  if (typeof text !== 'string') {
    throw new TypeError('Text to embed must be a string');
  }
  if (text.trim().length < MINIMUM_TEXT_LENGTH_IN_CHARACTERS) {
    throw new RangeError('Text to embed must not be empty');
  }
  if (text.length > MAX_TEXT_LENGTH_IN_CHARACTERS) {
    throw new RangeError(
      `Text to embed is longer than ${MAX_TEXT_LENGTH_IN_CHARACTERS} characters`,
    );
  }
}

export function assertValidEmbeddingBatch(texts: readonly string[]): void {
  if (texts.length > MAX_TEXTS_PER_BATCH) {
    throw new RangeError(
      `Cannot embed more than ${MAX_TEXTS_PER_BATCH} texts at once`,
    );
  }
  for (const text of texts) {
    assertValidEmbeddingText(text);
  }
}
