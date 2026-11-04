import { BadRequestException } from '@nestjs/common';
import { MAX_USER_MESSAGE_LENGTH_IN_CHARACTERS } from '../llm/llm-input-limits.js';

/**
 * Takes the question out of an untrusted request body. Only the "question"
 * field is read; any other field is ignored. Error messages are fixed texts
 * and never repeat what the client sent (OWASP API8: Security
 * Misconfiguration, information leakage).
 */
export function parseQuestionFromBody(body: unknown): string {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BadRequestException('Request body must be a JSON object');
  }

  const question: unknown = (body as Record<string, unknown>).question;
  if (typeof question !== 'string') {
    throw new BadRequestException('question must be a string');
  }
  if (question.trim().length === 0) {
    throw new BadRequestException('question must not be empty');
  }
  if (question.length > MAX_USER_MESSAGE_LENGTH_IN_CHARACTERS) {
    throw new BadRequestException(
      `question must not be longer than ${MAX_USER_MESSAGE_LENGTH_IN_CHARACTERS} characters`,
    );
  }
  return question;
}
