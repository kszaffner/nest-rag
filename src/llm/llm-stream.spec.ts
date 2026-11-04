import type { LlmProvider, LlmStreamEvent } from './llm-provider.interface.js';
import { streamFromProvider } from './llm-stream.js';
import { MockLlmProvider } from './mock-llm.provider.js';

const REQUEST = {
  systemPrompt: 'rules',
  userMessage: 'question',
  context: [{ sourceId: 'doc#0', text: 'Some passage text.' }],
};

async function collect(events: AsyncIterable<LlmStreamEvent>) {
  const collected: LlmStreamEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

describe('streamFromProvider', () => {
  it('sends the whole answer as one piece when the provider cannot stream', async () => {
    const provider: LlmProvider = {
      generate: async () => ({
        text: 'whole answer',
        model: 'm',
        usage: { inputTokens: 3, outputTokens: 2 },
        wasTruncated: true,
      }),
    };

    await expect(
      collect(streamFromProvider(provider, REQUEST)),
    ).resolves.toEqual([
      { type: 'delta', text: 'whole answer' },
      {
        type: 'end',
        model: 'm',
        usage: { inputTokens: 3, outputTokens: 2 },
        wasTruncated: true,
      },
    ]);
  });

  it('uses the stream of the provider when it has one', async () => {
    const events = await collect(
      streamFromProvider(new MockLlmProvider(), REQUEST),
    );

    expect(
      events.filter((event) => event.type === 'delta').length,
    ).toBeGreaterThan(1);
    expect(events.at(-1)?.type).toBe('end');
  });
});

describe('MockLlmProvider.stream', () => {
  it('streams the same text as generate', async () => {
    const provider = new MockLlmProvider();
    const events = await collect(provider.stream(REQUEST));
    const streamedText = events
      .map((event) => (event.type === 'delta' ? event.text : ''))
      .join('');

    expect(streamedText).toBe((await provider.generate(REQUEST)).text);
    expect(events.filter((event) => event.type === 'end')).toHaveLength(1);
  });

  it('rejects an invalid request before streaming anything', async () => {
    await expect(
      collect(new MockLlmProvider().stream({ ...REQUEST, userMessage: ' ' })),
    ).rejects.toThrow(RangeError);
  });
});
