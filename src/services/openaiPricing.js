export const OPENAI_PRICE_VERSION = "openai-standard-2026-07-30";

const TEXT_PRICES = [
  { pattern: /^gpt-5\.6-sol(?:-|$)/, input: 5, cached: 0.5, cacheWrite: 6.25, output: 30, longInput: 10, longCached: 1, longCacheWrite: 12.5, longOutput: 45 },
  { pattern: /^gpt-5\.6-terra(?:-|$)/, input: 2.5, cached: 0.25, cacheWrite: 3.125, output: 15, longInput: 5, longCached: 0.5, longCacheWrite: 6.25, longOutput: 22.5 },
  { pattern: /^gpt-5\.6-luna(?:-|$)/, input: 1, cached: 0.1, cacheWrite: 1.25, output: 6, longInput: 2, longCached: 0.2, longCacheWrite: 2.5, longOutput: 9 },
  { pattern: /^gpt-4\.1-mini(?:-|$)/, input: 0.4, cached: 0.1, cacheWrite: 0.4, output: 1.6 },
  { pattern: /^gpt-4o-mini(?:-|$)/, input: 0.15, cached: 0.075, cacheWrite: 0.15, output: 0.6 },
];

const IMAGE_PRICES = [
  { pattern: /^gpt-image-2(?:-|$)/, textInput: 5, textCached: 1.25, imageInput: 8, imageCached: 2, imageOutput: 30 },
  { pattern: /^gpt-image-1\.5(?:-|$)/, textInput: 5, textCached: 1.25, imageInput: 8, imageCached: 2, imageOutput: 32 },
  { pattern: /^gpt-image-1-mini(?:-|$)/, textInput: 2, textCached: 0.2, imageInput: 2.5, imageCached: 0.25, imageOutput: 8 },
  { pattern: /^gpt-image-1(?:-|$)/, textInput: 5, textCached: 1.25, imageInput: 10, imageCached: 2.5, imageOutput: 40 },
];

function integer(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function nested(object, paths) {
  for (const path of paths) {
    let value = object;
    for (const key of path) value = value?.[key];
    if (value != null) return integer(value);
  }
  return 0;
}

export function extractBillableUsage(response) {
  const usage = response?.usage || {};
  const inputDetails = usage.input_tokens_details || usage.prompt_tokens_details || {};
  const outputDetails = usage.output_tokens_details || usage.completion_tokens_details || {};
  const cachedDetails = inputDetails.cached_tokens_details || {};
  const inputTokens = integer(usage.input_tokens ?? usage.prompt_tokens);
  const outputTokens = integer(usage.output_tokens ?? usage.completion_tokens);
  const cachedInputTokens = nested(usage, [
    ["input_tokens_details", "cached_tokens"],
    ["prompt_tokens_details", "cached_tokens"],
    ["input_cached_tokens"],
  ]);
  const cacheWriteTokens = nested(usage, [
    ["input_tokens_details", "cache_write_tokens"],
    ["prompt_tokens_details", "cache_write_tokens"],
    ["input_cache_write_tokens"],
  ]);
  const inputTextTokens = integer(inputDetails.text_tokens ?? usage.input_text_tokens);
  const inputImageTokens = integer(inputDetails.image_tokens ?? usage.input_image_tokens);
  const cachedTextTokens = integer(cachedDetails.text_tokens ?? usage.input_cached_text_tokens);
  const cachedImageTokens = integer(cachedDetails.image_tokens ?? usage.input_cached_image_tokens);
  const outputTextTokens = integer(outputDetails.text_tokens ?? usage.output_text_tokens);
  const outputImageTokens = integer(outputDetails.image_tokens ?? usage.output_image_tokens);

  return {
    inputTokens,
    outputTokens,
    cachedInputTokens,
    cacheWriteTokens,
    inputTextTokens,
    inputImageTokens,
    cachedTextTokens,
    cachedImageTokens,
    outputTextTokens,
    outputImageTokens,
  };
}

function dollarsToMicros(value) {
  return Math.max(0, Math.round(Number(value || 0) * 1_000_000));
}

function tokenCost(tokens, dollarsPerMillion) {
  return Number(tokens || 0) * Number(dollarsPerMillion || 0) / 1_000_000;
}

export function calculateOpenAICost({ model, endpoint = "", serviceTier = "standard", usage }) {
  const normalizedModel = String(model || "").toLowerCase();
  const rawTier = String(serviceTier || "standard").toLowerCase();
  const normalizedTier = rawTier === "default" ? "standard" : rawTier;
  const billable = {
    inputTokens: integer(usage?.inputTokens),
    outputTokens: integer(usage?.outputTokens),
    cachedInputTokens: integer(usage?.cachedInputTokens),
    cacheWriteTokens: integer(usage?.cacheWriteTokens),
    inputTextTokens: integer(usage?.inputTextTokens),
    inputImageTokens: integer(usage?.inputImageTokens),
    cachedTextTokens: integer(usage?.cachedTextTokens),
    cachedImageTokens: integer(usage?.cachedImageTokens),
    outputImageTokens: integer(usage?.outputImageTokens),
  };
  if (!normalizedModel || normalizedTier !== "standard") {
    return { costUsdMicros: 0, pricingComplete: false, priceVersion: OPENAI_PRICE_VERSION };
  }

  const imagePrice = IMAGE_PRICES.find((price) => price.pattern.test(normalizedModel));
  if (imagePrice && /images\.(generate|edit)/.test(endpoint)) {
    const hasBreakdown = billable.inputTextTokens > 0
      || billable.inputImageTokens > 0
      || billable.outputImageTokens > 0;
    if (!hasBreakdown) {
      return { costUsdMicros: 0, pricingComplete: false, priceVersion: OPENAI_PRICE_VERSION };
    }
    const uncachedText = Math.max(0, billable.inputTextTokens - billable.cachedTextTokens);
    const uncachedImage = Math.max(0, billable.inputImageTokens - billable.cachedImageTokens);
    const cost = tokenCost(uncachedText, imagePrice.textInput)
      + tokenCost(billable.cachedTextTokens, imagePrice.textCached)
      + tokenCost(uncachedImage, imagePrice.imageInput)
      + tokenCost(billable.cachedImageTokens, imagePrice.imageCached)
      + tokenCost(billable.outputImageTokens, imagePrice.imageOutput);
    return {
      costUsdMicros: dollarsToMicros(cost),
      pricingComplete: true,
      priceVersion: OPENAI_PRICE_VERSION,
    };
  }

  const textPrice = TEXT_PRICES.find((price) => price.pattern.test(normalizedModel));
  if (!textPrice || (billable.inputTokens === 0 && billable.outputTokens === 0)) {
    return { costUsdMicros: 0, pricingComplete: false, priceVersion: OPENAI_PRICE_VERSION };
  }
  const longContext = billable.inputTokens > 272000 && textPrice.longInput;
  const rates = longContext ? {
    input: textPrice.longInput,
    cached: textPrice.longCached,
    cacheWrite: textPrice.longCacheWrite,
    output: textPrice.longOutput,
  } : textPrice;
  const regularInput = Math.max(
    0,
    billable.inputTokens - billable.cachedInputTokens - billable.cacheWriteTokens,
  );
  const cost = tokenCost(regularInput, rates.input)
    + tokenCost(billable.cachedInputTokens, rates.cached)
    + tokenCost(billable.cacheWriteTokens, rates.cacheWrite)
    + tokenCost(billable.outputTokens, rates.output);
  return {
    costUsdMicros: dollarsToMicros(cost),
    pricingComplete: true,
    priceVersion: OPENAI_PRICE_VERSION,
  };
}
