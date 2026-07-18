import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import woocommerceAuthRouter from "../src/routes/woocommerceAuth.js";
import { verifyWooAuthState } from "../src/services/draftIdentity.js";

test("an installed reader can securely renew its WooCommerce session for the remembered project", async () => {
  const previousSecret = process.env.WOOCOMMERCE_BRIDGE_SECRET;
  const previousBridgeUrl = process.env.WOOCOMMERCE_BRIDGE_URL;
  process.env.WOOCOMMERCE_BRIDGE_SECRET = "reader-reconnect-secret-with-enough-entropy";
  process.env.WOOCOMMERCE_BRIDGE_URL = "https://calitiki.example/?calitiki_connect=1";

  const app = express();
  app.use("/api", woocommerceAuthRouter);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/woocommerce/reader?projectId=project-291013`, {
      redirect: "manual",
    });
    assert.equal(response.status, 302);
    const destination = new URL(response.headers.get("location"));
    assert.equal(destination.origin, "https://calitiki.example");
    assert.equal(destination.searchParams.get("calitiki_connect"), "1");
    const state = verifyWooAuthState(destination.searchParams.get("state"));
    assert.equal(state.projectId, "project-291013");
    assert.equal(state.destination, "interactive_reader");

    const invalid = await fetch(`http://127.0.0.1:${port}/api/auth/woocommerce/reader?projectId=../../secret`, {
      redirect: "manual",
    });
    assert.equal(invalid.status, 400);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (previousSecret === undefined) delete process.env.WOOCOMMERCE_BRIDGE_SECRET;
    else process.env.WOOCOMMERCE_BRIDGE_SECRET = previousSecret;
    if (previousBridgeUrl === undefined) delete process.env.WOOCOMMERCE_BRIDGE_URL;
    else process.env.WOOCOMMERCE_BRIDGE_URL = previousBridgeUrl;
  }
});
