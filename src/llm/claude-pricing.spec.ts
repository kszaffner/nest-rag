import { CLAUDE_MODEL_PRICES, estimateCostInUsd } from './claude-pricing.js';

describe('estimateCostInUsd', () => {
  it('prices input and output tokens separately', () => {
    // 1 million input tokens cost $0.10 and 1 million output tokens $0.50.
    const cost = estimateCostInUsd('claude-haiku-5-5', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });

    expect(cost).toBeCloseTo(0.6);
  });

  it('gives a tiny cost for a typical question', () => {
    // About 1500 tokens in and 200 out, like one RAG answer.
    const cost = estimateCostInUsd('claude-haiku-5-5', {
      inputTokens: 1_500,
      outputTokens: 200,
    });

    // (1500 * 0.10 + 200 * 0.50) / 1 000 000 = 0.00025
    expect(cost).toBeCloseTo(0.00025);
  });

  it('costs nothing when no tokens were used', () => {
    expect(
      estimateCostInUsd('claude-haiku-5-5', {
        inputTokens: 0,
        outputTokens: 0,
      }),
    ).toBe(0);
  });

  it('knows the price of the previous Haiku generation', () => {
    const cost = estimateCostInUsd('claude-haiku-4-5', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });

    expect(cost).toBeCloseTo(6);
  });

  it('matches a model name with a date suffix', () => {
    const cost = estimateCostInUsd('claude-haiku-4-5-20251001', {
      inputTokens: 1_000_000,
      outputTokens: 0,
    });

    expect(cost).toBeCloseTo(1);
  });

  it('does not match a different model that only starts with the same letters', () => {
    const usage = { inputTokens: 1_000, outputTokens: 1_000 };

    expect(estimateCostInUsd('claude-haiku-5-50', usage)).toBeUndefined();
  });

  it('returns undefined for a model without a known price', () => {
    const usage = { inputTokens: 1_000, outputTokens: 1_000 };

    expect(estimateCostInUsd('llama3.2:1b', usage)).toBeUndefined();
    expect(estimateCostInUsd('mock', usage)).toBeUndefined();
  });

  it('has a positive price for every listed model', () => {
    for (const price of Object.values(CLAUDE_MODEL_PRICES)) {
      expect(price.inputUsdPerMillionTokens).toBeGreaterThan(0);
      expect(price.outputUsdPerMillionTokens).toBeGreaterThan(0);
    }
  });
});
