import { join } from 'node:path';
import { vi } from 'vitest';
import { DocumentsService } from '../documents/documents.service.js';
import { IndexingService } from '../indexing/indexing.service.js';
import { MockEmbeddingProvider } from '../embeddings/mock-embedding.provider.js';
import { MAX_USER_MESSAGE_LENGTH_IN_CHARACTERS } from '../llm/llm-input-limits.js';
import type {
  LlmGenerationRequest,
  LlmProvider,
  LlmResponse,
} from '../llm/llm-provider.interface.js';
import { MockLlmProvider } from '../llm/mock-llm.provider.js';
import { InMemoryVectorStore } from '../vector-store/in-memory-vector-store.js';
import { NO_ANSWER_TEXT, RAG_SYSTEM_PROMPT } from './rag-prompt.js';
import { RETRIEVED_CHUNK_COUNT, RagService } from './rag.service.js';

const SAMPLE_DOCUMENTS_DIRECTORY = join(process.cwd(), 'data', 'documents');

function createRecordingLlm(response: Partial<LlmResponse> = {}) {
  const requests: LlmGenerationRequest[] = [];
  const llmProvider: LlmProvider = {
    generate: vi.fn(async (request: LlmGenerationRequest) => {
      requests.push(request);
      return {
        text: 'the answer',
        model: 'claude-haiku-5-5',
        usage: { inputTokens: 1_000, outputTokens: 100 },
        ...response,
      };
    }),
  };
  return { llmProvider, requests };
}

async function createFixture(
  llmProvider: LlmProvider = new MockLlmProvider(),
  { indexDocuments = true } = {},
) {
  const embeddingProvider = new MockEmbeddingProvider();
  const vectorStore = new InMemoryVectorStore({
    dimensions: embeddingProvider.dimensions,
  });
  if (indexDocuments) {
    await new IndexingService(
      new DocumentsService(),
      embeddingProvider,
      vectorStore,
    ).indexDirectory(SAMPLE_DOCUMENTS_DIRECTORY);
  }
  const ragService = new RagService(
    embeddingProvider,
    vectorStore,
    llmProvider,
  );
  return { ragService, vectorStore };
}

describe('RagService', () => {
  it('answers from the retrieved chunks and lists them as sources', async () => {
    const { ragService } = await createFixture();

    const result = await ragService.answerQuestion('Where is the office?');

    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources.length).toBeLessThanOrEqual(RETRIEVED_CHUNK_COUNT);
    expect(result.sources[0]?.sourceId).toMatch(/^.+#\d+$/);
    expect(result.answer).toContain('[mock]');
    expect(result.model).toBe('mock');
    expect(result.wasTruncated).toBe(false);
  });

  it('gives the model the system prompt, the question and the same chunks', async () => {
    const { llmProvider, requests } = createRecordingLlm();
    const { ragService } = await createFixture(llmProvider);

    const result = await ragService.answerQuestion('  Where is the office?  ');

    expect(requests).toHaveLength(1);
    expect(requests[0]?.systemPrompt).toBe(RAG_SYSTEM_PROMPT);
    expect(requests[0]?.userMessage).toBe('Where is the office?');
    expect(requests[0]?.context.map((passage) => passage.sourceId)).toEqual(
      result.sources.map((source) => source.sourceId),
    );
  });

  it('estimates the cost for a model with a known price', async () => {
    const { llmProvider } = createRecordingLlm();
    const { ragService } = await createFixture(llmProvider);

    const result = await ragService.answerQuestion('Where is the office?');

    // 1000 * 0.10 / 1M + 100 * 0.50 / 1M
    expect(result.estimatedCostInUsd).toBeCloseTo(0.00015, 10);
    expect(result.usage).toEqual({ inputTokens: 1_000, outputTokens: 100 });
  });

  it('leaves the cost out when the model price is unknown', async () => {
    const { ragService } = await createFixture();

    const result = await ragService.answerQuestion('Where is the office?');

    expect(result).not.toHaveProperty('estimatedCostInUsd');
  });

  it('passes on that the answer was truncated', async () => {
    const { llmProvider } = createRecordingLlm({ wasTruncated: true });
    const { ragService } = await createFixture(llmProvider);

    const result = await ragService.answerQuestion('Where is the office?');

    expect(result.wasTruncated).toBe(true);
  });

  it('does not call the model when nothing was found', async () => {
    const { llmProvider } = createRecordingLlm();
    const { ragService } = await createFixture(llmProvider, {
      indexDocuments: false,
    });

    const result = await ragService.answerQuestion('Where is the office?');

    expect(llmProvider.generate).not.toHaveBeenCalled();
    expect(result.answer).toBe(NO_ANSWER_TEXT);
    expect(result.sources).toEqual([]);
    expect(result.model).toBeUndefined();
    expect(result.estimatedCostInUsd).toBe(0);
  });

  it.each([
    ['empty', ''],
    ['blank', '   \n '],
    ['not a string', 42 as unknown as string],
    ['too long', 'a'.repeat(MAX_USER_MESSAGE_LENGTH_IN_CHARACTERS + 1)],
  ])(
    'rejects a question that is %s before any work',
    async (_name, question) => {
      const { llmProvider } = createRecordingLlm();
      const { ragService } = await createFixture(llmProvider);

      await expect(ragService.answerQuestion(question)).rejects.toThrow();
      expect(llmProvider.generate).not.toHaveBeenCalled();
    },
  );

  it('does not repeat the question in the error message', async () => {
    const { ragService } = await createFixture();
    const secretQuestion = 'x'.repeat(
      MAX_USER_MESSAGE_LENGTH_IN_CHARACTERS + 1,
    );

    await expect(ragService.answerQuestion(secretQuestion)).rejects.toThrow(
      /^(?!.*xxxx)/,
    );
  });

  it('passes on a failure of the model without hiding it', async () => {
    const llmProvider: LlmProvider = {
      generate: vi.fn().mockRejectedValue(new Error('LLM request failed')),
    };
    const { ragService } = await createFixture(llmProvider);

    await expect(
      ragService.answerQuestion('Where is the office?'),
    ).rejects.toThrow('LLM request failed');
  });
});
