import Anthropic from '@anthropic-ai/sdk';
import { assertValidGenerationRequest } from './llm-input-limits.js';
import { buildUserPrompt } from './llm-prompt.js';
import type {
  LlmGenerationRequest,
  LlmProvider,
  LlmResponse,
  LlmStreamEvent,
} from './llm-provider.interface.js';

/** The cheapest current model. Change it with the CLAUDE_MODEL setting. */
export const DEFAULT_CLAUDE_MODEL = 'claude-haiku-5-5';

/**
 * Upper bound for one answer. Thinking tokens count towards it too, so it
 * must leave room for them. Keeps the cost of a single call predictable.
 */
export const DEFAULT_CLAUDE_MAX_OUTPUT_TOKENS = 1_024;
export const MAX_ALLOWED_CLAUDE_OUTPUT_TOKENS = 4_096;
export const DEFAULT_CLAUDE_REQUEST_TIMEOUT_IN_MILLISECONDS = 60_000;
export const DEFAULT_CLAUDE_MAX_RETRIES = 2;

/**
 * Answering from a few given passages is a simple task, so the lowest effort
 * is enough and spends the fewest tokens on reasoning.
 */
const ANSWER_EFFORT = 'low';

const MINIMUM_OUTPUT_TOKENS = 1;
const NO_TOKENS_REPORTED = 0;
const STOP_REASON_REFUSAL = 'refusal';
const STOP_REASON_MAX_TOKENS = 'max_tokens';

export interface ClaudeLlmOptions {
  model: string;
  maxOutputTokens: number;
}

/** Events of a streamed answer. `controller.abort()` closes the connection. */
export interface ClaudeEventStream extends AsyncIterable<Anthropic.RawMessageStreamEvent> {
  controller: { abort(): void };
}

/** The only part of the SDK client that this provider needs. */
export interface ClaudeMessagesApi {
  create(
    parameters: Anthropic.MessageCreateParamsNonStreaming,
  ): Promise<Anthropic.Message>;
  createStream(
    parameters: Anthropic.MessageCreateParamsStreaming,
  ): Promise<ClaudeEventStream>;
}

export interface ClaudeClientSettings {
  /** Secret. Never log it and never put it in an error message. */
  apiKey: string;
  requestTimeoutInMilliseconds?: number;
  maxRetries?: number;
}

/** Creates the real SDK client. Tests pass a fake ClaudeMessagesApi instead. */
export function createClaudeMessagesApi(
  settings: ClaudeClientSettings,
): ClaudeMessagesApi {
  if (settings.apiKey.trim().length === 0) {
    throw new RangeError('The Claude API key must not be empty');
  }
  const client = new Anthropic({
    apiKey: settings.apiKey,
    timeout:
      settings.requestTimeoutInMilliseconds ??
      DEFAULT_CLAUDE_REQUEST_TIMEOUT_IN_MILLISECONDS,
    maxRetries: settings.maxRetries ?? DEFAULT_CLAUDE_MAX_RETRIES,
  });
  return {
    create: (parameters) => client.messages.create(parameters),
    createStream: (parameters) => client.messages.create(parameters),
  };
}

/**
 * Generates answers with Claude through the Anthropic API. Every call costs
 * money, so the output limit is small, the effort is low, and the usage of
 * tokens is returned with every response.
 */
export class ClaudeLlmProvider implements LlmProvider {
  private readonly options: ClaudeLlmOptions;

  constructor(
    private readonly messagesApi: ClaudeMessagesApi,
    options: Partial<ClaudeLlmOptions> = {},
  ) {
    this.options = {
      model: DEFAULT_CLAUDE_MODEL,
      maxOutputTokens: DEFAULT_CLAUDE_MAX_OUTPUT_TOKENS,
      ...options,
    };
    assertValidOptions(this.options);
  }

  async generate(request: LlmGenerationRequest): Promise<LlmResponse> {
    assertValidGenerationRequest(request);

    let message: Anthropic.Message;
    try {
      message = await this.messagesApi.create(this.createParameters(request));
    } catch (error) {
      throw toSafeError(error);
    }

    if (message.stop_reason === STOP_REASON_REFUSAL) {
      throw new Error('The model declined to answer this request');
    }

    return {
      text: readAnswerText(message),
      model: message.model,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      },
      wasTruncated: message.stop_reason === STOP_REASON_MAX_TOKENS,
    };
  }

  /**
   * Streams the answer as Claude writes it. The connection is closed as soon
   * as the caller stops reading, so a page that was closed does not keep
   * costing money.
   */
  async *stream(request: LlmGenerationRequest): AsyncGenerator<LlmStreamEvent> {
    assertValidGenerationRequest(request);

    let events: ClaudeEventStream;
    try {
      events = await this.messagesApi.createStream({
        ...this.createParameters(request),
        stream: true,
      });
    } catch (error) {
      throw toSafeError(error);
    }

    let model = this.options.model;
    let inputTokens = NO_TOKENS_REPORTED;
    let outputTokens = NO_TOKENS_REPORTED;
    let stopReason: Anthropic.StopReason | null = null;

    try {
      for await (const event of events) {
        if (event.type === 'message_start') {
          model = event.message.model;
          inputTokens = event.message.usage.input_tokens;
        } else if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          yield { type: 'delta', text: event.delta.text };
        } else if (event.type === 'message_delta') {
          stopReason = event.delta.stop_reason;
          outputTokens = event.usage.output_tokens;
          inputTokens = event.usage.input_tokens ?? inputTokens;
        }
      }
    } catch (error) {
      throw toSafeError(error);
    } finally {
      events.controller.abort();
    }

    if (stopReason === STOP_REASON_REFUSAL) {
      throw new Error('The model declined to answer this request');
    }
    if (stopReason === null) {
      throw new Error('Claude stream ended before the answer was complete');
    }
    yield {
      type: 'end',
      model,
      usage: { inputTokens, outputTokens },
      wasTruncated: stopReason === STOP_REASON_MAX_TOKENS,
    };
  }

  private createParameters(
    request: LlmGenerationRequest,
  ): Anthropic.MessageCreateParamsNonStreaming {
    // Sampling parameters (temperature, top_p, top_k) are left out on
    // purpose: the API rejects them.
    return {
      model: this.options.model,
      max_tokens: this.options.maxOutputTokens,
      system: request.systemPrompt,
      output_config: { effort: ANSWER_EFFORT },
      messages: [{ role: 'user', content: buildUserPrompt(request) }],
    };
  }
}

function assertValidOptions(options: ClaudeLlmOptions): void {
  if (options.model.trim().length === 0) {
    throw new RangeError('Claude model name must not be empty');
  }
  if (
    !Number.isInteger(options.maxOutputTokens) ||
    options.maxOutputTokens < MINIMUM_OUTPUT_TOKENS ||
    options.maxOutputTokens > MAX_ALLOWED_CLAUDE_OUTPUT_TOKENS
  ) {
    throw new RangeError(
      `maxOutputTokens must be a whole number from ${MINIMUM_OUTPUT_TOKENS} to ${MAX_ALLOWED_CLAUDE_OUTPUT_TOKENS}`,
    );
  }
}

/** Joins the text blocks and ignores the others (for example thinking). */
function readAnswerText(message: Anthropic.Message): string {
  return message.content
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('');
}

/**
 * Turns an SDK error into one with a fixed message. The original error stays
 * available as `cause`, but its text (which may describe the request) never
 * reaches the logs or the user through the message.
 */
function toSafeError(error: unknown): Error {
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return new Error('The Claude API rejected the credentials', {
      cause: error,
    });
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new Error('The Claude API rate limit was reached', { cause: error });
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new Error('Could not reach the Claude API', { cause: error });
  }
  if (error instanceof Anthropic.APIError) {
    return new Error(
      `The Claude API request failed with status ${error.status}`,
      {
        cause: error,
      },
    );
  }
  return error instanceof Error ? error : new Error('Unknown Claude error');
}
