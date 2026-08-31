import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { normalizeImageProviderError } from "../src/services/imageRunner.js";
import { isTransientOpenAIError } from "../src/services/openaiErrorPolicy.js";
import { isProviderBillingUnavailable } from "../src/services/providerBillingError.js";
import {
  isPreviewProviderInterruption,
  tagPreviewProviderInterruption,
} from "../src/services/providerInterruption.js";

test("image transport normalization preserves the provider evidence needed for recovery", () => {
  const upstream = Object.assign(new Error("Provider request failed"), {
    status: 500,
    type: "server_error",
    headers: { "x-openai-ide-root-error-code": "service_auth_failure" },
    request_id: "req_transport_test",
    error: {
      message: "Unable to verify model access right now. Please retry.",
      type: "server_error",
    },
  });

  const normalized = normalizeImageProviderError(upstream);
  assert.equal(normalized.message, "Unable to verify model access right now. Please retry.");
  assert.equal(normalized.status, 500);
  assert.equal(normalized.type, "server_error");
  assert.equal(normalized.request_id, "req_transport_test");
  assert.equal(normalized.headers, upstream.headers);
  assert.equal(normalized.error, upstream.error);
  assert.equal(normalized.cause, upstream);
  assert.equal(normalized.provider, "openai");
  assert.equal(normalized.providerOperation, "image_generation");
  assert.equal(isTransientOpenAIError(normalized), true);
  assert.equal(isPreviewProviderInterruption(normalized), true);

  assert.equal(tagPreviewProviderInterruption(normalized, "image_generation"), normalized);
  assert.equal(normalized.code, "preview_interrupted");
  assert.equal(normalized.artifactType, "image_generation");
});

test("the observed model-access message is recoverable even without an HTTP status", () => {
  const error = new Error("Unable to verify model access right now. Please retry.");
  assert.equal(isTransientOpenAIError(error), true);
  assert.equal(isPreviewProviderInterruption(error), true);
});

test("provider billing remains terminal and is never rewritten as a transport interruption", () => {
  const normalized = normalizeImageProviderError({
    status: 429,
    error: {
      code: "insufficient_quota",
      message: "You have no credits remaining. Add credits to continue using the API.",
    },
  });

  assert.equal(isProviderBillingUnavailable(normalized), true);
  assert.equal(isPreviewProviderInterruption(normalized), false);
  assert.equal(tagPreviewProviderInterruption(normalized), normalized);
  assert.notEqual(normalized.code, "preview_interrupted");
});

test("wardrobe creation gets one transport retry without spending a visual QA attempt", async () => {
  const route = await fs.readFile("src/routes/preview.js", "utf8");
  assert.match(route, /let transportRetryUsed = false;/);
  assert.match(route, /isPreviewProviderInterruption\(error\)/);
  assert.match(route, /phase: "transport-retry"/);
  assert.match(route, /error: "temporary_provider_interruption"/);
  assert.match(route, /tagPreviewProviderInterruption\(/);
  assert.match(route, /classifiedError\?\.code === "preview_interrupted"/);
});
