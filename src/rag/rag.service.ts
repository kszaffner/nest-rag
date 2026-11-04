import { Inject, Injectable } from '@nestjs/common';
import {
  EMBEDDING_PROVIDER,
  type EmbeddingProvider,
} from '../embeddings/embedding-provider.interface.js';
import { estimateCostInUsd } from '../llm/claude-pricing.js';
import { MAX_USER_MESSAGE_LENGTH_IN_CHARACTERS } from '../llm/llm-input-limits.js';
import {
  LLM_PROVIDER,
  type ContextPassage,
  type LlmProvider,
  type TokenUsage,
} from '../llm/llm-provider.interface.js';
import { createChunkId } from '../vector-store/chunk-id.js';
import {
  VECTOR_STORE,
  type VectorStore,
} from '../vector-store/vector-store.interface.js';
import { NO_ANSWER_TEXT, RAG_SYSTEM_PROMPT } from './rag-prompt.js';

/** How many chunks the search returns. More chunks cost more tokens. */
export const RETRIEVED_CHUNK_COUNT = 4;

const NO_TOKENS_USED = 0;
const NO_COST_IN_USD = 0;

export interface RagSource {
  /** For example "leave-policy#2". */
  sourceId: string;
  /** Cosine similarity between the question and the chunk, -1 to 1. */
  similarity: number;
  text: string;
}

export interface RagAnswer {
  answer: string;
  /**
   * The chunks that were given to the model. They come from the search, not
   * from the model, so the model cannot invent a source.
   */
  sources: RagSource[];
  /** Undefined when no chunk was found and the model was not called. */
  model?: string;
  usage: TokenUsage;
  /** Undefined when the price of the model is unknown (mock, Ollama). */
  estimatedCostInUsd?: number;
  /** True when the answer was cut off at the output token limit. */
  wasTruncated: boolean;
}

/**
 * The RAG pipeline: question -> embedding -> search -> prompt -> model.
 * It never logs the question or the answer, because they may be private.
 */
@Injectable()
export class RagService {
  constructor(
    @Inject(EMBEDDING_PROVIDER)
    private readonly embeddingProvider: EmbeddingProvider,
    @Inject(VECTOR_STORE)
    private readonly vectorStore: VectorStore,
    @Inject(LLM_PROVIDER)
    private readonly llmProvider: LlmProvider,
  ) {}

  async answerQuestion(question: string): Promise<RagAnswer> {
    // Checked before any work, so an invalid question costs nothing.
    this.assertValidQuestion(question);
    const trimmedQuestion = question.trim();

    const questionEmbedding =
      await this.embeddingProvider.embed(trimmedQuestion);
    const searchResults = await this.vectorStore.search(questionEmbedding, {
      topK: RETRIEVED_CHUNK_COUNT,
    });
    const sources: RagSource[] = searchResults.map((result) => ({
      sourceId: createChunkId(result.chunk),
      similarity: result.similarity,
      text: result.chunk.text,
    }));

    // Nothing to answer from: skip the model call, so it costs nothing and
    // cannot make something up.
    if (sources.length === 0) {
      return {
        answer: NO_ANSWER_TEXT,
        sources,
        usage: { inputTokens: NO_TOKENS_USED, outputTokens: NO_TOKENS_USED },
        estimatedCostInUsd: NO_COST_IN_USD,
        wasTruncated: false,
      };
    }

    const context: ContextPassage[] = sources.map(({ sourceId, text }) => ({
      sourceId,
      text,
    }));
    const response = await this.llmProvider.generate({
      systemPrompt: RAG_SYSTEM_PROMPT,
      userMessage: trimmedQuestion,
      context,
    });

    const estimatedCostInUsd = estimateCostInUsd(
      response.model,
      response.usage,
    );
    return {
      answer: response.text,
      sources,
      model: response.model,
      usage: response.usage,
      ...(estimatedCostInUsd !== undefined && { estimatedCostInUsd }),
      wasTruncated: response.wasTruncated ?? false,
    };
  }

  /** Error messages name the problem, never the content of the question. */
  private assertValidQuestion(question: unknown): asserts question is string {
    if (typeof question !== 'string') {
      throw new TypeError('question must be a string');
    }
    if (question.trim().length === 0) {
      throw new RangeError('question must not be empty');
    }
    if (question.length > MAX_USER_MESSAGE_LENGTH_IN_CHARACTERS) {
      throw new RangeError(
        `question is longer than ${MAX_USER_MESSAGE_LENGTH_IN_CHARACTERS} characters`,
      );
    }
  }
}
