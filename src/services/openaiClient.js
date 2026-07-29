import OpenAI from "openai";

const clients = new Map();

function integerSetting(value, fallback, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function settingFor(kind, suffix, fallback) {
  const specific = process.env[`OPENAI_${String(kind || "").toUpperCase()}_${suffix}`];
  const shared = process.env[`OPENAI_${suffix}`];
  return specific ?? shared ?? fallback;
}

export function createOpenAIClient({ kind = "request" } = {}) {
  if (!process.env.OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");
  const defaultTimeout = kind === "qa"
    ? 60000
    : kind === "scenario"
      ? 600000
      : kind === "story"
        ? 360000
        : 180000;
  const timeout = integerSetting(settingFor(kind, "TIMEOUT_MS", defaultTimeout), defaultTimeout, {
    minimum: 10000,
    maximum: 600000,
  });
  const maxRetries = integerSetting(settingFor(kind, "MAX_RETRIES", 0), 0, {
    minimum: 0,
    maximum: 2,
  });
  const cacheKey = `${kind}:${timeout}:${maxRetries}:${process.env.OPENAI_API_KEY}`;
  if (!clients.has(cacheKey)) {
    clients.set(cacheKey, new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout, maxRetries }));
  }
  return clients.get(cacheKey);
}

