import { Injectable } from '@nestjs/common';
import { assertValidGenerationRequest } from './llm-input-limits.js';
import type {
  LlmGenerationRequest,
  LlmProvider,
  LlmResponse,
  LlmStreamEvent,
} from './llm-provider.interface.js';

export const MOCK_MODEL_NAME = 'mock';
export const MOCK_NO_ANSWER_TEXT =
  '[mock] I could not find this in the documents.';

/** How many characters of the first passage the mock answer quotes. */
const MOCK_QUOTE_LENGTH_IN_CHARACTERS = 200;
const QUOTE_ELLIPSIS = '...';
const SOURCE_SEPARATOR = ', ';
const NO_TOKENS_USED = 0;

/**
 * Free, offline and deterministic provider for development and tests. It
 * does not understand the question: it quotes the first passage that the
 * search found and lists the sources. With no passages it says it found
 * nothing, like a well-behaved real model should.
 */
@Injectable()
export class MockLlmProvider implements LlmProvider {
  async generate(request: LlmGenerationRequest): Promise<LlmResponse> {
    assertValidGenerationRequest(request);

    return {
      text: this.createAnswer(request),
      model: MOCK_MODEL_NAME,
      usage: { inputTokens: NO_TOKENS_USED, outputTokens: NO_TOKENS_USED },
    };
  }

  /** Streams the same answer word by word, to try the streaming without a model. */
  async *stream(request: LlmGenerationRequest): AsyncGenerator<LlmStreamEvent> {
    assertValidGenerationRequest(request);

    for (const word of this.createAnswer(request).match(/\S+\s*/g) ?? []) {
      yield { type: 'delta', text: word };
    }
    yield {
      type: 'end',
      model: MOCK_MODEL_NAME,
      usage: { inputTokens: NO_TOKENS_USED, outputTokens: NO_TOKENS_USED },
    };
  }

  private createAnswer(request: LlmGenerationRequest): string {
    const [firstPassage] = request.context;
    if (!firstPassage) {
      return MOCK_NO_ANSWER_TEXT;
    }

    const quote = this.shorten(firstPassage.text);
    const sourceIds = request.context
      .map((passage) => passage.sourceId)
      .join(SOURCE_SEPARATOR);
    return `[mock] Based on ${request.context.length} passage(s): "${quote}" (sources: ${sourceIds})`;
  }

  private shorten(text: string): string {
    const singleLineText = text.replace(/\s+/g, ' ').trim();
    if (singleLineText.length <= MOCK_QUOTE_LENGTH_IN_CHARACTERS) {
      return singleLineText;
    }
    return (
      singleLineText.slice(0, MOCK_QUOTE_LENGTH_IN_CHARACTERS) + QUOTE_ELLIPSIS
    );
  }
}
