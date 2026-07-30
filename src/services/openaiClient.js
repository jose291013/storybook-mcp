import OpenAI from "openai";
import { safelyRecordOpenAIResponse } from "./openaiCostLedger.js";

const clients = new Map();

function instrumentNamespace(target, path = []) {
  return new Proxy(target, {
    get(object, property) {
      const value = Reflect.get(object, property);
      if (typeof value === "function") {
        return async (...args) => {
          const response = await value.apply(object, args);
          // Economic telemetry is deliberately non-blocking: a slow or
          // unavailable ledger must never delay a customer generation.
          void safelyRecordOpenAIResponse({
            endpoint: [...path, String(property)].join("."),
            request: args[0] || {},
            response,
          });
          return response;
        };
      }
      if (value && typeof value === "object") {
        return instrumentNamespace(value, [...path, String(property)]);
      }
      return value;
    },
  });
}

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
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout, maxRetries });
    clients.set(cacheKey, instrumentNamespace(client));
  }
  return clients.get(cacheKey);
}

