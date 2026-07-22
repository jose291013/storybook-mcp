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

test("whole-book planning has a dedicated longer timeout without hidden retries", () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousRequestTimeout = process.env.OPENAI_REQUEST_TIMEOUT_MS;
  const previousStoryTimeout = process.env.OPENAI_STORY_TIMEOUT_MS;
  const previousStoryRetries = process.env.OPENAI_STORY_MAX_RETRIES;
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_REQUEST_TIMEOUT_MS = "180000";
  delete process.env.OPENAI_STORY_TIMEOUT_MS;
  delete process.env.OPENAI_STORY_MAX_RETRIES;
  try {
    const defaultClient = createOpenAIClient({ kind: "story" });
    assert.equal(defaultClient.timeout, 360000);
    assert.equal(defaultClient.maxRetries, 0);

    process.env.OPENAI_STORY_TIMEOUT_MS = "420000";
    process.env.OPENAI_STORY_MAX_RETRIES = "0";
    const configuredClient = createOpenAIClient({ kind: "story" });
    assert.equal(configuredClient.timeout, 420000);
    assert.equal(configuredClient.maxRetries, 0);
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
    if (previousRequestTimeout === undefined) delete process.env.OPENAI_REQUEST_TIMEOUT_MS; else process.env.OPENAI_REQUEST_TIMEOUT_MS = previousRequestTimeout;
    if (previousStoryTimeout === undefined) delete process.env.OPENAI_STORY_TIMEOUT_MS; else process.env.OPENAI_STORY_TIMEOUT_MS = previousStoryTimeout;
    if (previousStoryRetries === undefined) delete process.env.OPENAI_STORY_MAX_RETRIES; else process.env.OPENAI_STORY_MAX_RETRIES = previousStoryRetries;
  }
});

