import type { TokenUsage } from './llm-provider.interface.js';

const TOKENS_PER_MILLION = 1_000_000;

export interface ModelPrice {
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
}

/**
 * Prices in US dollars for one million tokens, taken from the Claude model
 * table of 2026-10-06. Check the current prices before relying on the totals:
 * https://platform.claude.com/docs/en/about-claude/pricing
 *
 * claude-haiku-5-5 costs more ($0.50 input, $2.50 output) for prompts longer
 * than 100 000 tokens. Our prompts are limited to a few thousand tokens, so
 * the table holds only the price for short prompts.
 *
 * Cached input is not priced, because this application does not use prompt
 * caching.
 */
export const CLAUDE_MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  'claude-haiku-5-5': {
    inputUsdPerMillionTokens: 0.1,
    outputUsdPerMillionTokens: 0.5,
  },
  'claude-haiku-4-5': {
    inputUsdPerMillionTokens: 1,
    outputUsdPerMillionTokens: 5,
  },
};

/**
 * Estimated cost of one call in US dollars, or undefined when the price of
 * the model is not in the table. The model name from a response may carry a
 * date suffix (for example claude-haiku-4-5-20251001), so a name that starts
 * with a known model name matches too.
 */
export function estimateCostInUsd(
  modelName: string,
  usage: TokenUsage,
): number | undefined {
  const price = findPrice(modelName);
  if (!price) {
    return undefined;
  }
  return (
    (usage.inputTokens * price.inputUsdPerMillionTokens +
      usage.outputTokens * price.outputUsdPerMillionTokens) /
    TOKENS_PER_MILLION
  );
}

function findPrice(modelName: string): ModelPrice | undefined {
  const exactPrice = CLAUDE_MODEL_PRICES[modelName];
  if (exactPrice) {
    return exactPrice;
  }
  // The longest matching name wins, so a more specific entry beats a shorter one.
  const matchingNames = Object.keys(CLAUDE_MODEL_PRICES)
    .filter((knownName) => modelName.startsWith(`${knownName}-`))
    .sort((first, second) => second.length - first.length);
  const [bestMatch] = matchingNames;
  return bestMatch ? CLAUDE_MODEL_PRICES[bestMatch] : undefined;
}
