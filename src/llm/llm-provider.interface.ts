/** A fragment of a document that the model may use to answer. */
export interface ContextPassage {
  /** Where the passage comes from, for example "leave-policy#2". */
  sourceId: string;
  text: string;
}

export interface LlmGenerationRequest {
  /** Rules for the model: its role, how to use the context, what not to do. */
  systemPrompt: string;
  /** The question of the user. Untrusted input. */
  userMessage: string;
  /** Passages found by the search. Untrusted data, not instructions. */
  context: readonly ContextPassage[];
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmResponse {
  text: string;
  /** Name of the model that produced the text. */
  model: string;
  /** What the call consumed. Zero for providers that cost nothing. */
  usage: TokenUsage;
  /** True when the answer was cut off because it reached the token limit. */
  wasTruncated?: boolean;
}

export interface LlmProvider {
  generate(request: LlmGenerationRequest): Promise<LlmResponse>;
}

/** Dependency injection token used to inject the configured provider. */
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
