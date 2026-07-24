import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { notifyPreviewMilestone, notifyPreviewReady } from "../src/services/previewNotification.js";

test("preview emails use signed, separate ready and milestone endpoints", async () => {
  const previous = {
    bridgeUrl: process.env.WOOCOMMERCE_BRIDGE_URL,
    bridgeSecret: process.env.WOOCOMMERCE_BRIDGE_SECRET,
    baseUrl: process.env.BASE_URL,
    fetch: global.fetch,
  };
  const secret = "n".repeat(64);
  const calls = [];
  process.env.WOOCOMMERCE_BRIDGE_URL = "https://calitiki.example/wp-json";
  process.env.WOOCOMMERCE_BRIDGE_SECRET = secret;
  process.env.BASE_URL = "https://creator.example";
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { sent: true } }),
    };
  };
  const project = {
    id: "project-1",
    generationJobId: "job-1",
    title: "Nolan et la vallée",
    locale: "FR",
  };
  const identity = { wooCustomerId: "42" };
  try {
    await notifyPreviewMilestone({
      project,
      identity,
      event: "cover_ready",
      eventId: "job-1:cover:1",
    });
    await notifyPreviewReady({ project, identity });
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /calitiki_preview_event=1/);
    assert.match(calls[1].url, /calitiki_preview_ready=1/);
    const milestoneBody = JSON.parse(calls[0].options.body);
    assert.equal(milestoneBody.event, "cover_ready");
    assert.equal(milestoneBody.eventId, "job-1:cover:1");
    assert.equal(milestoneBody.readyUrl, "https://creator.example/api/auth/woocommerce/project?projectId=project-1");
    assert.equal(
      calls[0].options.headers["X-Calitiki-Signature"],
      crypto.createHmac("sha256", secret).update(calls[0].options.body).digest("hex"),
    );
    await assert.rejects(
      notifyPreviewMilestone({ project, identity, event: "unknown", eventId: "bad" }),
      /Unsupported preview notification event/,
    );
  } finally {
    global.fetch = previous.fetch;
    if (previous.bridgeUrl === undefined) delete process.env.WOOCOMMERCE_BRIDGE_URL;
    else process.env.WOOCOMMERCE_BRIDGE_URL = previous.bridgeUrl;
    if (previous.bridgeSecret === undefined) delete process.env.WOOCOMMERCE_BRIDGE_SECRET;
    else process.env.WOOCOMMERCE_BRIDGE_SECRET = previous.bridgeSecret;
    if (previous.baseUrl === undefined) delete process.env.BASE_URL;
    else process.env.BASE_URL = previous.baseUrl;
  }
});

test("preview notifications reject an HTML response from an older bridge", async () => {
  const previous = {
    bridgeUrl: process.env.WOOCOMMERCE_BRIDGE_URL,
    bridgeSecret: process.env.WOOCOMMERCE_BRIDGE_SECRET,
    fetch: global.fetch,
  };
  process.env.WOOCOMMERCE_BRIDGE_URL = "https://calitiki.example/";
  process.env.WOOCOMMERCE_BRIDGE_SECRET = "o".repeat(64);
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => { throw new Error("not json"); },
  });
  try {
    await assert.rejects(
      notifyPreviewMilestone({
        project: { id: "project-2", generationJobId: "job-2", locale: "EN" },
        identity: { wooCustomerId: "42" },
        event: "generation_failed",
        eventId: "job-2:generation_failed",
        retryAvailable: true,
      }),
      /returned 200/,
    );
  } finally {
    global.fetch = previous.fetch;
    if (previous.bridgeUrl === undefined) delete process.env.WOOCOMMERCE_BRIDGE_URL;
    else process.env.WOOCOMMERCE_BRIDGE_URL = previous.bridgeUrl;
    if (previous.bridgeSecret === undefined) delete process.env.WOOCOMMERCE_BRIDGE_SECRET;
    else process.env.WOOCOMMERCE_BRIDGE_SECRET = previous.bridgeSecret;
  }
});
