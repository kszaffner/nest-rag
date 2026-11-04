import { assertValidGenerationRequest } from './llm-input-limits.js';
import { buildUserPrompt } from './llm-prompt.js';
import type {
  LlmGenerationRequest,
  LlmProvider,
  LlmResponse,
} from './llm-provider.interface.js';

export const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';
export const DEFAULT_OLLAMA_MODEL = 'llama3.2:1b';
export const DEFAULT_REQUEST_TIMEOUT_IN_MILLISECONDS = 60_000;
export const DEFAULT_MAX_OUTPUT_TOKENS = 512;

/** The highest value accepted for the output limit, whatever the config says. */
export const MAX_ALLOWED_OUTPUT_TOKENS = 4_096;

const CHAT_ENDPOINT_PATH = '/api/chat';
const ALLOWED_URL_PROTOCOLS = ['http:', 'https:'];
const MINIMUM_OUTPUT_TOKENS = 1;
const NO_TOKENS_REPORTED = 0;

/** Ollama reports this `done_reason` when the output limit cut the answer. */
const STOP_REASON_LENGTH = 'length';

/** 0 makes the answers as repeatable as the model allows. */
const SAMPLING_TEMPERATURE = 0;

/** Host names that mean "this computer". */
const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]'];

/**
 * The largest response body that is read, in bytes (1 MiB). An answer is at
 * most a few thousand tokens, which is a few tens of kilobytes, so anything
 * near this size is a mistake or an attack, and reading it would waste memory.
 *
 * HOW TO CHANGE: edit this constant. Raise it only if you also raised
 * MAX_ALLOWED_OUTPUT_TOKENS far beyond the current value.
 */
export const MAX_RESPONSE_BODY_IN_BYTES = 1_048_576;

const RESPONSE_TOO_LARGE_MESSAGE = 'Ollama response is larger than allowed';

export interface OllamaLlmOptions {
  /**
   * Address of the Ollama server. Must come from trusted configuration.
   * Only this computer is accepted unless `allowNonLocalHost` is true.
   */
  baseUrl: string;
  /**
   * By default the server must run on this computer (localhost, 127.0.0.1 or
   * ::1), because every prompt contains text from your documents and is sent
   * to the server in full.
   *
   * HOW TO LIFT THE RESTRICTION: set this to true when you really want to use
   * an Ollama server on another machine, and then use an https address on a
   * network you trust. Do it only in configuration written by you, never from
   * a request. Without a restriction, a wrong or tampered address would send
   * your documents to an unknown server.
   */
  allowNonLocalHost: boolean;
  model: string;
  requestTimeoutInMilliseconds: number;
  /** The model stops after this many tokens, which bounds time and cost. */
  maxOutputTokens: number;
}

export type FetchFunction = typeof fetch;

/**
 * Generates answers with a model running locally in Ollama: no API key, no
 * cost, and the text never leaves the machine.
 */
export class OllamaLlmProvider implements LlmProvider {
  private readonly options: OllamaLlmOptions;
  private readonly chatUrl: string;
  private readonly fetchFunction: FetchFunction;

  constructor(
    options: Partial<OllamaLlmOptions> = {},
    fetchFunction: FetchFunction = fetch,
  ) {
    this.options = {
      baseUrl: DEFAULT_OLLAMA_BASE_URL,
      allowNonLocalHost: false,
      model: DEFAULT_OLLAMA_MODEL,
      requestTimeoutInMilliseconds: DEFAULT_REQUEST_TIMEOUT_IN_MILLISECONDS,
      maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
      ...options,
    };
    this.chatUrl = createChatUrl(
      this.options.baseUrl,
      this.options.allowNonLocalHost,
    );
    assertValidOptions(this.options);
    this.fetchFunction = fetchFunction;
  }

  async generate(request: LlmGenerationRequest): Promise<LlmResponse> {
    assertValidGenerationRequest(request);

    const requestBody = {
      model: this.options.model,
      stream: false,
      // Thinking models (for example qwen3) would otherwise spend tokens on
      // a hidden chain of thought before the answer.
      think: false,
      options: {
        temperature: SAMPLING_TEMPERATURE,
        num_predict: this.options.maxOutputTokens,
      },
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: buildUserPrompt(request) },
      ],
    };

    let response: Response;
    try {
      response = await this.fetchFunction(this.chatUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.options.requestTimeoutInMilliseconds),
        // A redirect could send the prompt to a server nobody configured.
        redirect: 'error',
      });
    } catch (error) {
      throw new Error('Could not reach the Ollama server', { cause: error });
    }

    if (!response.ok) {
      // Only the status: the body may echo parts of the prompt.
      throw new Error(`Ollama request failed with status ${response.status}`);
    }

    return this.toLlmResponse(await readLimitedJson(response));
  }

  private toLlmResponse(payload: unknown): LlmResponse {
    const answerText = readAnswerText(payload);
    if (answerText === undefined) {
      throw new Error('Ollama returned a response in an unexpected format');
    }

    return {
      text: answerText,
      model: readString(payload, 'model') ?? this.options.model,
      usage: {
        inputTokens: readCount(payload, 'prompt_eval_count'),
        outputTokens: readCount(payload, 'eval_count'),
      },
      wasTruncated: readString(payload, 'done_reason') === STOP_REASON_LENGTH,
    };
  }
}

function createChatUrl(baseUrl: string, allowNonLocalHost: boolean): string {
  const parsedUrl = new URL(baseUrl);
  if (!ALLOWED_URL_PROTOCOLS.includes(parsedUrl.protocol)) {
    throw new RangeError('Ollama base URL must use http or https');
  }
  if (parsedUrl.username || parsedUrl.password) {
    throw new RangeError('Ollama base URL must not contain credentials');
  }
  if (!allowNonLocalHost && !LOCAL_HOSTNAMES.includes(parsedUrl.hostname)) {
    throw new RangeError(
      'Ollama base URL must point to this computer. To use another host, set allowNonLocalHost to true',
    );
  }
  return new URL(CHAT_ENDPOINT_PATH, parsedUrl).toString();
}

/**
 * Reads the body of a response as JSON, but refuses to read more than
 * MAX_RESPONSE_BODY_IN_BYTES. The size is checked while reading, because the
 * Content-Length header can be missing or wrong.
 */
async function readLimitedJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_RESPONSE_BODY_IN_BYTES
  ) {
    throw new Error(RESPONSE_TOO_LARGE_MESSAGE);
  }

  const receivedChunks: Uint8Array[] = [];
  let receivedBytes = 0;
  if (response.body) {
    const reader = response.body.getReader();
    let chunk = await reader.read();
    while (!chunk.done) {
      receivedBytes += chunk.value.byteLength;
      if (receivedBytes > MAX_RESPONSE_BODY_IN_BYTES) {
        await reader.cancel();
        throw new Error(RESPONSE_TOO_LARGE_MESSAGE);
      }
      receivedChunks.push(chunk.value);
      chunk = await reader.read();
    }
  }

  try {
    return JSON.parse(Buffer.concat(receivedChunks).toString('utf-8'));
  } catch (error) {
    throw new Error('Ollama returned a response in an unexpected format', {
      cause: error,
    });
  }
}

function assertValidOptions(options: OllamaLlmOptions): void {
  if (options.model.trim().length === 0) {
    throw new RangeError('Ollama model name must not be empty');
  }
  if (
    !Number.isInteger(options.maxOutputTokens) ||
    options.maxOutputTokens < MINIMUM_OUTPUT_TOKENS ||
    options.maxOutputTokens > MAX_ALLOWED_OUTPUT_TOKENS
  ) {
    throw new RangeError(
      `maxOutputTokens must be a whole number from ${MINIMUM_OUTPUT_TOKENS} to ${MAX_ALLOWED_OUTPUT_TOKENS}`,
    );
  }
  if (
    !Number.isFinite(options.requestTimeoutInMilliseconds) ||
    options.requestTimeoutInMilliseconds <= 0
  ) {
    throw new RangeError('requestTimeoutInMilliseconds must be above 0');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readAnswerText(payload: unknown): string | undefined {
  if (!isRecord(payload) || !isRecord(payload.message)) {
    return undefined;
  }
  const { content } = payload.message;
  return typeof content === 'string' ? content : undefined;
}

function readString(payload: unknown, key: string): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }
  const value = payload[key];
  return typeof value === 'string' ? value : undefined;
}

function readCount(payload: unknown, key: string): number {
  if (!isRecord(payload)) {
    return NO_TOKENS_REPORTED;
  }
  const value = payload[key];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : NO_TOKENS_REPORTED;
}
