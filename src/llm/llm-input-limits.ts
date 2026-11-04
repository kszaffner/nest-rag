import type { LlmGenerationRequest } from './llm-provider.interface.js';

/**
 * Upper bounds protect the application from requests that would exhaust
 * memory or run up the bill of a paid model (OWASP API4: Unrestricted
 * Resource Consumption, OWASP LLM10: Unbounded Consumption).
 */
export const MAX_SYSTEM_PROMPT_LENGTH_IN_CHARACTERS = 4_000;
export const MAX_USER_MESSAGE_LENGTH_IN_CHARACTERS = 2_000;
export const MAX_CONTEXT_PASSAGES = 20;
export const MAX_PASSAGE_LENGTH_IN_CHARACTERS = 5_000;
export const MAX_SOURCE_ID_LENGTH_IN_CHARACTERS = 200;
export const MAX_TOTAL_CONTEXT_LENGTH_IN_CHARACTERS = 10_000;

const MINIMUM_TEXT_LENGTH_IN_CHARACTERS = 1;

/** Rejects requests that are malformed or too large. Shared by all providers. */
export function assertValidGenerationRequest(
  request: LlmGenerationRequest,
): void {
  assertValidText(
    'systemPrompt',
    request.systemPrompt,
    MAX_SYSTEM_PROMPT_LENGTH_IN_CHARACTERS,
  );
  assertValidText(
    'userMessage',
    request.userMessage,
    MAX_USER_MESSAGE_LENGTH_IN_CHARACTERS,
  );

  if (!Array.isArray(request.context)) {
    throw new TypeError('context must be a list of passages');
  }
  if (request.context.length > MAX_CONTEXT_PASSAGES) {
    throw new RangeError(
      `context must not have more than ${MAX_CONTEXT_PASSAGES} passages`,
    );
  }

  let totalContextLength = 0;
  for (const passage of request.context) {
    assertValidText(
      'context passage',
      passage.text,
      MAX_PASSAGE_LENGTH_IN_CHARACTERS,
    );
    assertValidText(
      'context source id',
      passage.sourceId,
      MAX_SOURCE_ID_LENGTH_IN_CHARACTERS,
    );
    totalContextLength += passage.text.length;
  }
  if (totalContextLength > MAX_TOTAL_CONTEXT_LENGTH_IN_CHARACTERS) {
    throw new RangeError(
      `context is longer than ${MAX_TOTAL_CONTEXT_LENGTH_IN_CHARACTERS} characters in total`,
    );
  }
}

/** Error messages name the field only, never the content of the value. */
function assertValidText(
  fieldName: string,
  value: unknown,
  maximumLength: number,
): void {
  if (typeof value !== 'string') {
    throw new TypeError(`${fieldName} must be a string`);
  }
  if (value.trim().length < MINIMUM_TEXT_LENGTH_IN_CHARACTERS) {
    throw new RangeError(`${fieldName} must not be empty`);
  }
  if (value.length > maximumLength) {
    throw new RangeError(
      `${fieldName} is longer than ${maximumLength} characters`,
    );
  }
}
