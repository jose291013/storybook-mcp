import assert from "node:assert/strict";
import test from "node:test";
import { createOpenAIClient } from "../src/services/openaiClient.js";

test("OpenAI clients use bounded timeouts and disable hidden retries by default", () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousImageTimeout = process.env.OPENAI_IMAGE_TIMEOUT_MS;
  const previousImageRetries = process.env.OPENAI_IMAGE_MAX_RETRIES;
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_IMAGE_TIMEOUT_MS = "45000";
  process.env.OPENAI_IMAGE_MAX_RETRIES = "0";
  try {
    const client = createOpenAIClient({ kind: "image" });
    assert.equal(client.timeout, 45000);
    assert.equal(client.maxRetries, 0);
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
    if (previousImageTimeout === undefined) delete process.env.OPENAI_IMAGE_TIMEOUT_MS; else process.env.OPENAI_IMAGE_TIMEOUT_MS = previousImageTimeout;
    if (previousImageRetries === undefined) delete process.env.OPENAI_IMAGE_MAX_RETRIES; else process.env.OPENAI_IMAGE_MAX_RETRIES = previousImageRetries;
  }
});

