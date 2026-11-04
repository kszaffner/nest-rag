/**
 * Phrases that are typical for an attempt to take over a model with text
 * hidden in a document ("prompt injection", OWASP LLM01).
 *
 * This is a WARNING SIGNAL ONLY. The text is never removed or blocked,
 * because phrases like these are easy to rewrite, and a normal document may
 * contain them (for example a security training text). The real protection is
 * the separation of data and instructions in the prompt (see llm-prompt.ts).
 * The signal tells the operator which documents to review.
 *
 * HOW TO EXTEND: add a pattern to the list. Keep the patterns simple; the
 * texts are up to a few thousand characters, but a complicated pattern can
 * still be slow.
 */
const INJECTION_PATTERNS: readonly RegExp[] = [
  /\b(ignore|disregard|forget)\s+(all\s+|any\s+)?(the\s+|your\s+)?(previous|prior|above|earlier|preceding)\s+(instructions?|rules?|prompts?)/i,
  /\breveal\s+(the\s+|your\s+)?(system\s+)?prompt/i,
  /\bsystem\s+(notice|override|message|prompt)\s*:/i,
  /\bnew\s+instructions?\s*:/i,
  /\b(reply|respond|answer)\s+(only\s+)?with\s+(just\s+)?the\s+word\b/i,
];

export function hasInjectionSignal(text: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

/** Positions of the texts that carry an injection signal. */
export function findInjectionSignalPositions(
  texts: readonly string[],
): number[] {
  return texts.flatMap((text, position) =>
    hasInjectionSignal(text) ? [position] : [],
  );
}
