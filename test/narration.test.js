import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  localizedNarrationCatalog,
  narrationChoice,
  narrationInstruction,
} from "../src/config/narrationOptions.js";
import { JsonCommerceOrderStore } from "../src/services/commerceOrderStore.js";
import { attachNarrationToManifest } from "../src/services/interactiveBookManifest.js";
import { generateNarrationAudio } from "../src/services/narrationFulfillment.js";
import { verifyBookOrderWebhook } from "../src/services/commerceToken.js";

test("AI narration exposes four voices and four independent narration styles", () => {
  const catalog = localizedNarrationCatalog("es-ES");
  assert.equal(catalog.voices.length, 4);
  assert.equal(catalog.styles.length, 4);
  assert.equal(narrationChoice("marin", "bedtime").style.id, "bedtime");
  assert.equal(narrationChoice("unknown", "bedtime"), null);
  assert.match(narrationInstruction("adventure", "fr-FR"), /Read only the exact input text/);
  assert.match(narrationInstruction("gentle", "es-ES"), /European Spanish from Spain/);
  assert.match(narrationInstruction("gentle", "es-ES"), /Do not use a Latin American accent/);
});

test("narration audio requests the paid voice and style without rewriting the story", async () => {
  let request;
  const audio = await generateNarrationAudio({
    text: "Noa ouvrit la porte.", language: "fr-FR", voiceId: "coral", styleId: "gentle",
  }, {
    model: "audio-test",
    openai: { audio: { speech: { create: async (value) => {
      request = value;
      return { arrayBuffer: async () => Uint8Array.from(Buffer.from("mp3")).buffer };
    } } } },
  });
  assert.equal(audio.toString(), "mp3");
  assert.equal(request.model, "audio-test");
  assert.equal(request.voice, "coral");
  assert.equal(request.input, "Noa ouvrit la porte.");
  assert.equal(request.response_format, "mp3");
  assert.match(request.instructions, /Read only the exact input text/);
  assert.equal(request.messages, undefined);
});

test("Spanish narration requests Castilian delivery while preserving the exact page text", async () => {
  let request;
  await generateNarrationAudio({
    text: "Noa cruzo el cielo azul. ¿Que encontraria alli?",
    language: "es-ES",
    voiceId: "marin",
    styleId: "adventure",
  }, {
    model: "audio-test",
    openai: { audio: { speech: { create: async (value) => {
      request = value;
      return { arrayBuffer: async () => Uint8Array.of(1, 2, 3).buffer };
    } } } },
  });
  assert.equal(request.input, "Noa cruzo el cielo azul. ¿Que encontraria alli?");
  assert.match(request.instructions, /European Spanish from Spain \(es-ES\)/);
  assert.match(request.instructions, /without answering it/);
});

test("a paid narration order is checkpointed and attached only when ready", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-narration-"));
  try {
    const orders = new JsonCommerceOrderStore(path.join(directory, "orders.json"));
    const paid = await orders.recordPaid({
      orderId: "900", projectId: "project-audio", customerId: "customer-1", wooCustomerId: "42",
      productType: "narration", pageCount: 24, orderTotalCents: 599,
      configuration: { voiceId: "marin", styleId: "adventure" },
    });
    assert.equal(paid.fulfillmentStatus, "queued");
    const claimed = await orders.claimDelivery({ orderId: "900", projectId: "project-audio", productType: "narration", wooCustomerId: "42" });
    assert.equal(claimed.fulfillmentStatus, "generating");
    await orders.updateDelivery({ orderId: "900", projectId: "project-audio", productType: "narration", wooCustomerId: "42" }, {
      fulfillmentStatus: "ready",
      deliveryManifest: { scenes: [{ sceneId: "opening", filename: "01-opening.mp3", storageKey: "private/01-opening.mp3" }] },
    });
    const ready = await orders.findReadyNarration({ projectId: "project-audio", customerId: "customer-1" });
    const book = attachNarrationToManifest({ scenes: [{ id: "opening", text: "Bonjour" }, { id: "scene-1", text: "Suite" }] }, ready, (filename) => `/audio/${filename}`);
    assert.equal(book.narration.synthetic, true);
    assert.equal(book.scenes[0].audio, "/audio/01-opening.mp3");
    assert.equal(book.scenes[1].audio, undefined);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("the WordPress narration line never receives the preview rebate", async () => {
  const plugin = await fs.readFile("wordpress/calitiki-bridge/calitiki-bridge.php", "utf8");
  assert.match(plugin, /calitiki_product_type.*narration/);
  assert.match(plugin, /\$format === 'narration' \? 0 : max/);
  assert.match(plugin, /Générée après paiement · non déduite des crédits d’aperçu/);
  assert.match(plugin, /narrationVoiceId/);
  assert.match(plugin, /narrationStyleId/);
});

test("book webhooks remain compatible during the Bridge rolling deployment", () => {
  const secret = "s".repeat(64);
  const payload = { orderId: "10", customerId: "42", projectId: "book-1", reservationId: "r", productType: "ebook", pageCount: 24, orderTotalCents: 669, status: "paid" };
  const legacy = crypto.createHmac("sha256", secret).update("10|42|book-1|r|ebook|24|669|paid").digest("hex");
  assert.equal(verifyBookOrderWebhook({ ...payload, signature: legacy }, secret), true);
  const narrationLegacy = crypto.createHmac("sha256", secret).update("10|42|book-1||narration|24|499|paid").digest("hex");
  assert.equal(verifyBookOrderWebhook({ ...payload, reservationId: "", productType: "narration", orderTotalCents: 499, signature: narrationLegacy }, secret), false);
});
