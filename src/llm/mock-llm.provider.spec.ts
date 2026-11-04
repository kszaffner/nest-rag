import {
  MAX_CONTEXT_PASSAGES,
  MAX_PASSAGE_LENGTH_IN_CHARACTERS,
  MAX_SYSTEM_PROMPT_LENGTH_IN_CHARACTERS,
  MAX_TOTAL_CONTEXT_LENGTH_IN_CHARACTERS,
  MAX_USER_MESSAGE_LENGTH_IN_CHARACTERS,
} from './llm-input-limits.js';
import type {
  ContextPassage,
  LlmGenerationRequest,
} from './llm-provider.interface.js';
import {
  MOCK_MODEL_NAME,
  MOCK_NO_ANSWER_TEXT,
  MockLlmProvider,
} from './mock-llm.provider.js';

const LEAVE_PASSAGE: ContextPassage = {
  sourceId: 'leave-policy#0',
  text: 'Every full-time employee receives 26 days of paid annual leave.',
};
const VPN_PASSAGE: ContextPassage = {
  sourceId: 'it-vpn-access#2',
  text: 'Ask for the VPN-Standard role in the IT Service Desk.',
};

function createRequest(
  overrides: Partial<LlmGenerationRequest> = {},
): LlmGenerationRequest {
  return {
    systemPrompt: 'Answer only from the context.',
    userMessage: 'How many vacation days do I have?',
    context: [LEAVE_PASSAGE],
    ...overrides,
  };
}

describe('MockLlmProvider', () => {
  const provider = new MockLlmProvider();

  describe('answers', () => {
    it('quotes the first passage and lists all sources', async () => {
      const response = await provider.generate(
        createRequest({ context: [LEAVE_PASSAGE, VPN_PASSAGE] }),
      );

      expect(response.text).toContain(LEAVE_PASSAGE.text);
      expect(response.text).not.toContain(VPN_PASSAGE.text);
      expect(response.text).toContain('2 passage(s)');
      expect(response.text).toContain('leave-policy#0, it-vpn-access#2');
    });

    it('says it found nothing when there is no context', async () => {
      const response = await provider.generate(createRequest({ context: [] }));

      expect(response.text).toBe(MOCK_NO_ANSWER_TEXT);
    });

    it('shortens a long passage and flattens its line breaks', async () => {
      const longPassage: ContextPassage = {
        sourceId: 'long#0',
        text: `first line\nsecond line ${'x'.repeat(500)}`,
      };

      const response = await provider.generate(
        createRequest({ context: [longPassage] }),
      );

      expect(response.text).toContain('first line second line');
      expect(response.text).toContain('...');
      expect(response.text).not.toContain('x'.repeat(300));
    });

    it('is deterministic', async () => {
      const firstResponse = await provider.generate(createRequest());
      const secondResponse = await provider.generate(createRequest());

      expect(secondResponse).toEqual(firstResponse);
    });

    it('reports the mock model and no token usage', async () => {
      const response = await provider.generate(createRequest());

      expect(response.model).toBe(MOCK_MODEL_NAME);
      expect(response.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
    });
  });

  describe('input limits', () => {
    it('rejects an empty system prompt and an empty question', async () => {
      await expect(
        provider.generate(createRequest({ systemPrompt: '  ' })),
      ).rejects.toThrow(/systemPrompt must not be empty/);
      await expect(
        provider.generate(createRequest({ userMessage: '' })),
      ).rejects.toThrow(/userMessage must not be empty/);
    });

    it('rejects values that are not strings', async () => {
      await expect(
        provider.generate(
          createRequest({ userMessage: 42 as unknown as string }),
        ),
      ).rejects.toThrow(TypeError);
      await expect(
        provider.generate(
          createRequest({ context: 'text' as unknown as ContextPassage[] }),
        ),
      ).rejects.toThrow(TypeError);
    });

    it('rejects a system prompt and a question that are too long', async () => {
      await expect(
        provider.generate(
          createRequest({
            systemPrompt: 'a'.repeat(
              MAX_SYSTEM_PROMPT_LENGTH_IN_CHARACTERS + 1,
            ),
          }),
        ),
      ).rejects.toThrow(/systemPrompt is longer than/);
      await expect(
        provider.generate(
          createRequest({
            userMessage: 'a'.repeat(MAX_USER_MESSAGE_LENGTH_IN_CHARACTERS + 1),
          }),
        ),
      ).rejects.toThrow(/userMessage is longer than/);
    });

    it('accepts a question of exactly the maximum length', async () => {
      const response = await provider.generate(
        createRequest({
          userMessage: 'a'.repeat(MAX_USER_MESSAGE_LENGTH_IN_CHARACTERS),
        }),
      );

      expect(response.text).toContain('[mock]');
    });

    it('rejects too many passages', async () => {
      const tooManyPassages = Array.from(
        { length: MAX_CONTEXT_PASSAGES + 1 },
        (_, passageIndex) => ({
          sourceId: `doc#${passageIndex}`,
          text: 'short passage',
        }),
      );

      await expect(
        provider.generate(createRequest({ context: tooManyPassages })),
      ).rejects.toThrow(/more than 20 passages/);
    });

    it('rejects a passage that is too long', async () => {
      const tooLongPassage: ContextPassage = {
        sourceId: 'long#0',
        text: 'a'.repeat(MAX_PASSAGE_LENGTH_IN_CHARACTERS + 1),
      };

      await expect(
        provider.generate(createRequest({ context: [tooLongPassage] })),
      ).rejects.toThrow(/context passage is longer than/);
    });

    it('rejects a context that is too long in total', async () => {
      const passageLength = MAX_PASSAGE_LENGTH_IN_CHARACTERS;
      const passageCount =
        Math.floor(MAX_TOTAL_CONTEXT_LENGTH_IN_CHARACTERS / passageLength) + 1;
      const passages = Array.from(
        { length: passageCount },
        (_, passageIndex) => ({
          sourceId: `doc#${passageIndex}`,
          text: 'a'.repeat(passageLength),
        }),
      );

      await expect(
        provider.generate(createRequest({ context: passages })),
      ).rejects.toThrow(/in total/);
    });

    it('rejects a passage with an empty source id', async () => {
      await expect(
        provider.generate(
          createRequest({ context: [{ sourceId: '', text: 'some text' }] }),
        ),
      ).rejects.toThrow(/context source id must not be empty/);
    });

    it('does not repeat the rejected content in the error message', async () => {
      const secretQuestion = `${'secret '.repeat(1000)}`;

      const error = await provider
        .generate(createRequest({ userMessage: secretQuestion }))
        .catch((caughtError: Error) => caughtError);

      expect((error as Error).message).not.toContain('secret');
    });
  });
});
