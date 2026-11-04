import type { LlmGenerationRequest } from './llm-provider.interface.js';

/**
 * Builds the user message that is sent to a model: the retrieved passages
 * and the question, each wrapped in its own tag. The system prompt must tell
 * the model that everything inside <documents> is data, not instructions.
 *
 * Text is escaped, so a passage or a question cannot contain a closing tag
 * such as "</documents>" to break out of its section and pose as instructions
 * (OWASP LLM01: Prompt Injection). Escaping reduces the risk but cannot remove
 * it completely, because the model still reads the text.
 */
export function buildUserPrompt(
  request: Pick<LlmGenerationRequest, 'userMessage' | 'context'>,
): string {
  const documentBlocks = request.context.map(
    (passage) =>
      `<document source="${escapeXml(passage.sourceId)}">\n${escapeXml(passage.text)}\n</document>`,
  );

  return [
    '<documents>',
    ...documentBlocks,
    '</documents>',
    '',
    '<question>',
    escapeXml(request.userMessage),
    '</question>',
  ].join('\n');
}

/** Replaces the characters that could open or close a tag or an attribute. */
export function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
