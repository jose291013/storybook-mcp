import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { calculateOpenAICost, extractBillableUsage, OPENAI_PRICE_VERSION } from "../src/services/openaiPricing.js";
import { currentOpenAICostContext, withOpenAICostContext } from "../src/services/openaiCostContext.js";
import { internalCostsSignature } from "../src/routes/internalCosts.js";

test("GPT-5.6 cost calculation separates regular, cached and cache-write tokens", () => {
  const usage = extractBillableUsage({
    usage: {
      input_tokens: 100000,
      output_tokens: 10000,
      input_tokens_details: { cached_tokens: 20000, cache_write_tokens: 30000 },
    },
  });
  const result = calculateOpenAICost({
    model: "gpt-5.6-sol",
    endpoint: "responses.create",
    serviceTier: "standard",
    usage,
  });
  assert.equal(result.priceVersion, OPENAI_PRICE_VERSION);
  assert.equal(result.pricingComplete, true);
  assert.equal(result.costUsdMicros, 747500);
});

test("provider default tier uses the standard price table", () => {
  const result = calculateOpenAICost({
    model: "gpt-5.6-luna",
    endpoint: "responses.create",
    serviceTier: "default",
    usage: { inputTokens: 1000000, outputTokens: 0 },
  });
  assert.equal(result.costUsdMicros, 2000000);
  assert.equal(result.pricingComplete, true);
});

test("GPT Image 2 calculation uses separate text, image and output-image rates", () => {
  const usage = extractBillableUsage({
    usage: {
      input_tokens: 1200,
      output_tokens: 4000,
      input_tokens_details: {
        text_tokens: 200,
        image_tokens: 1000,
        cached_tokens_details: { image_tokens: 250 },
      },
      output_tokens_details: { image_tokens: 4000 },
    },
  });
  const result = calculateOpenAICost({
    model: "gpt-image-2",
    endpoint: "images.edit",
    usage,
  });
  assert.equal(result.pricingComplete, true);
  assert.equal(result.costUsdMicros, 127500);
});

test("unknown prices remain visible as incomplete rather than silently estimated", () => {
  const result = calculateOpenAICost({
    model: "future-model",
    endpoint: "responses.create",
    usage: { inputTokens: 100, outputTokens: 100 },
  });
  assert.equal(result.costUsdMicros, 0);
  assert.equal(result.pricingComplete, false);
});

test("private cost context remains isolated across asynchronous work", async () => {
  await withOpenAICostContext({
    projectId: "project-1",
    runId: "run-1",
    workflow: "preview",
    getStage: () => "draft:page:7:attempt:2",
  }, async () => {
    await Promise.resolve();
    assert.deepEqual(currentOpenAICostContext(), {
      projectId: "project-1",
      runId: "run-1",
      workflow: "preview",
      stage: "draft:page:7:attempt:2",
      attemptKind: "normal",
    });
  });
  assert.equal(currentOpenAICostContext(), null);
});

test("internal report signature binds timestamp and project id", () => {
  const secret = "s".repeat(64);
  assert.notEqual(
    internalCostsSignature({ timestamp: 123, projectId: "project-a" }, secret),
    internalCostsSignature({ timestamp: 123, projectId: "project-b" }, secret),
  );
});

test("cost ledger schema is private, content-free and survives project deletion", async () => {
  const migration = await fs.readFile("db/migrations/013_openai_cost_ledger.sql", "utf8");
  const route = await fs.readFile("src/routes/internalCosts.js", "utf8");
  const customerLibrary = await fs.readFile("src/services/customerCreationLibrary.js", "utf8");
  const creatorApp = await fs.readFile("public/app.js", "utf8");
  const bridge = await fs.readFile("wordpress/calitiki-bridge/calitiki-bridge.php", "utf8");
  const customerCreations = bridge.slice(
    bridge.indexOf("public static function render_account_creations"),
    bridge.indexOf("public static function delete_creation"),
  );
  assert.match(migration, /CREATE TABLE IF NOT EXISTS openai_cost_events/);
  assert.doesNotMatch(migration, /REFERENCES book_projects/);
  assert.doesNotMatch(
    migration,
    /^\s*(prompt|questionnaire|photo|generated_content)\s+[a-z]/im,
  );
  assert.match(route, /WOOCOMMERCE_BRIDGE_SECRET/);
  assert.match(route, /X-Robots-Tag/);
  assert.doesNotMatch(customerLibrary, /costUsd|cost_usd|openai_cost/);
  assert.doesNotMatch(creatorApp, /internal\/book-costs|costUsdMicros|openai_cost/);
  assert.doesNotMatch(customerCreations, /internal\/book-costs|Cout IA|costUsdMicros/);
});
