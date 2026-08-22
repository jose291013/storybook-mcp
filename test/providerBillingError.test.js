import test from "node:test";
import assert from "node:assert/strict";
import {
  isProviderBillingUnavailable,
  publicPreviewFailureReason,
  tagProviderBillingUnavailable,
} from "../src/services/providerBillingError.js";
import { isTransientOpenAIError } from "../src/services/openaiErrorPolicy.js";

test("OpenAI quota and billing failures receive one bounded provider classification", () => {
  const messageError = new Error("You have no credits remaining. Add credits to continue using the API.");
  assert.equal(isProviderBillingUnavailable(messageError), true);
  assert.equal(tagProviderBillingUnavailable(messageError), messageError);
  assert.equal(messageError.code, "preview_provider_billing_unavailable");
  assert.equal(messageError.artifactType, "provider_billing");

  assert.equal(isProviderBillingUnavailable({ status: 429, error: { code: "insufficient_quota" } }), true);
  assert.equal(isProviderBillingUnavailable({ status: 402 }), true);
  assert.equal(isProviderBillingUnavailable({ status: 429, code: "rate_limit_exceeded" }), false);
  assert.equal(isProviderBillingUnavailable(new Error("Request timed out.")), false);
  assert.equal(isTransientOpenAIError({ status: 429, error: { code: "insufficient_quota" } }), false);
  assert.equal(isTransientOpenAIError({ status: 429, code: "rate_limit_exceeded" }), true);
});

test("only the bounded provider-billing reason reaches the customer project surface", () => {
  assert.equal(publicPreviewFailureReason({
    continuitySnapshot: { generationCheckpoint: { failureReason: "preview_provider_billing_unavailable" } },
  }), "preview_provider_billing_unavailable");
  assert.equal(publicPreviewFailureReason({
    continuitySnapshot: { generationCheckpoint: { failureReason: "raw_provider_secret" } },
  }), "");
});
