import type {
  LlmGenerationRequest,
  LlmProvider,
  LlmStreamEvent,
} from './llm-provider.interface.js';

/**
 * Streams the answer of any provider. A provider with its own `stream` is
 * used as it is. For the others the whole answer is generated first and then
 * sent as one piece, so the caller does not need to know the difference.
 */
export async function* streamFromProvider(
  provider: LlmProvider,
  request: LlmGenerationRequest,
): AsyncGenerator<LlmStreamEvent> {
  if (provider.stream) {
    yield* provider.stream(request);
    return;
  }

  const response = await provider.generate(request);
  yield { type: 'delta', text: response.text };
  yield {
    type: 'end',
    model: response.model,
    usage: response.usage,
    ...(response.wasTruncated !== undefined && {
      wasTruncated: response.wasTruncated,
    }),
  };
}
