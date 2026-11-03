export interface ChunkOptions {
  /** Maximum chunk length in characters. */
  chunkSize: number;
  /** Number of characters shared between neighbouring chunks. */
  overlap: number;
}

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = {
  chunkSize: 500,
  overlap: 100,
};

const MINIMUM_CHUNK_SIZE = 1;
const MINIMUM_OVERLAP = 0;
const FIRST_CHARACTER_INDEX = 0;

/**
 * We only look for a paragraph or sentence end in the second half of the
 * chunk, so chunks never become shorter than half of the available space.
 */
const HALF_OF_CHUNK_RATIO = 0.5;

/**
 * The next chunk must start at least this many characters after the current
 * one. It guarantees that the loop always makes progress and terminates.
 */
const MINIMUM_START_ADVANCE = 1;

/** Returned by `lastIndexOf` and by our helpers when nothing was found. */
const NOT_FOUND_INDEX = -1;

const PARAGRAPH_SEPARATOR = '\n\n';
const SENTENCE_SEPARATORS = ['. ', '? ', '! '] as const;

/**
 * Splits text into overlapping chunks of at most `chunkSize` characters.
 * Chunks end at a paragraph or sentence boundary when one is available
 * in the second half of the window; otherwise they are cut at the limit.
 */
export function chunkText(
  documentText: string,
  options: ChunkOptions = DEFAULT_CHUNK_OPTIONS,
): string[] {
  const { chunkSize, overlap } = options;
  if (chunkSize < MINIMUM_CHUNK_SIZE) {
    throw new RangeError(`chunkSize must be at least ${MINIMUM_CHUNK_SIZE}`);
  }
  if (overlap < MINIMUM_OVERLAP || overlap >= chunkSize) {
    throw new RangeError(
      `overlap must be at least ${MINIMUM_OVERLAP} and smaller than chunkSize`,
    );
  }

  const normalizedText = documentText.replace(/\r\n/g, '\n').trim();
  const chunks: string[] = [];
  let chunkStart = FIRST_CHARACTER_INDEX;

  while (chunkStart < normalizedText.length) {
    const maxChunkEnd = Math.min(chunkStart + chunkSize, normalizedText.length);
    const isLastChunk = maxChunkEnd >= normalizedText.length;
    const chunkEnd = isLastChunk
      ? maxChunkEnd
      : findBoundaryForCurrentChunk(normalizedText, chunkStart, maxChunkEnd);

    const chunkContent = normalizedText.slice(chunkStart, chunkEnd).trim();
    if (chunkContent) {
      chunks.push(chunkContent);
    }

    if (isLastChunk) {
      break;
    }
    // Step back by `overlap`, but always move forward to guarantee progress.
    chunkStart = Math.max(
      chunkEnd - overlap,
      chunkStart + MINIMUM_START_ADVANCE,
    );
  }

  return chunks;
}

/**
 * Finds the best position to end a chunk that starts at `chunkStart` and may
 * not extend beyond `maxChunkEnd`. Prefers the end of a paragraph, then the
 * end of a sentence, and falls back to `maxChunkEnd`.
 */
function findBoundaryForCurrentChunk(
  text: string,
  chunkStart: number,
  maxChunkEnd: number,
): number {
  const halfOfChunk = Math.floor(
    (maxChunkEnd - chunkStart) * HALF_OF_CHUNK_RATIO,
  );
  const minChunkEnd = chunkStart + halfOfChunk;
  const chunkWindow = text.slice(minChunkEnd, maxChunkEnd);

  const paragraphEndInWindow = findLastSeparatorEnd(chunkWindow, [
    PARAGRAPH_SEPARATOR,
  ]);
  if (paragraphEndInWindow !== NOT_FOUND_INDEX) {
    return minChunkEnd + paragraphEndInWindow;
  }

  const sentenceEndInWindow = findLastSeparatorEnd(
    chunkWindow,
    SENTENCE_SEPARATORS,
  );
  if (sentenceEndInWindow !== NOT_FOUND_INDEX) {
    return minChunkEnd + sentenceEndInWindow;
  }

  return maxChunkEnd;
}

/**
 * Returns the position just after the last occurrence of any of the
 * separators, so the separator stays at the end of the preceding chunk.
 * Returns NOT_FOUND_INDEX when none of them occurs.
 */
function findLastSeparatorEnd(
  chunkWindow: string,
  separators: readonly string[],
): number {
  let lastSeparatorEnd = NOT_FOUND_INDEX;

  for (const separator of separators) {
    const separatorStart = chunkWindow.lastIndexOf(separator);
    if (separatorStart !== NOT_FOUND_INDEX) {
      lastSeparatorEnd = Math.max(
        lastSeparatorEnd,
        separatorStart + separator.length,
      );
    }
  }

  return lastSeparatorEnd;
}
