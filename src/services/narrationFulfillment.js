import path from "path";
import { createOpenAIClient } from "./openaiClient.js";
import { commerceOrderStore } from "./commerceOrderStore.js";
import { getDeliveryStorage } from "./deliveryStorage.js";
import { projectStore } from "./projectStore.js";
import { buildInteractiveBookManifest } from "./interactiveBookManifest.js";
import { NARRATION_CATALOG_VERSION, narrationChoice, narrationInstruction } from "../config/narrationOptions.js";
import { logMemory } from "./runtimeMemory.js";

const MODEL = () => String(process.env.NARRATION_TTS_MODEL || "gpt-4o-mini-tts");
const FORMAT = "mp3";

function safeSceneFilename(sceneId, index) {
  const safe = String(sceneId || `scene-${index + 1}`).replace(/[^A-Za-z0-9_-]/g, "-");
  return `${String(index + 1).padStart(2, "0")}-${safe}.mp3`;
}

export async function generateNarrationAudio({ text, language, voiceId, styleId }, dependencies = {}) {
  if (!narrationChoice(voiceId, styleId)) throw new Error("Invalid narration choice");
  const client = dependencies.openai || createOpenAIClient({ kind: "narration" });
  const response = await client.audio.speech.create({
    model: dependencies.model || MODEL(),
    voice: voiceId,
    input: String(text || "").trim(),
    instructions: narrationInstruction(styleId, language),
    response_format: FORMAT,
  });
  const encoded = await response.arrayBuffer();
  if (!encoded?.byteLength) throw new Error("The narration model returned no audio");
  return Buffer.from(encoded);
}

function orderIdentity(input) {
  return { orderId: String(input.orderId), projectId: String(input.projectId), productType: "narration", wooCustomerId: String(input.wooCustomerId) };
}

export async function generatePaidNarration(input, dependencies = {}) {
  const projects = dependencies.projectStore || projectStore;
  const orders = dependencies.commerceOrderStore || commerceOrderStore;
  const storage = dependencies.deliveryStorage || getDeliveryStorage();
  const identity = orderIdentity(input);
  const project = await projects.getForCustomer(identity.projectId, { wooCustomerId: identity.wooCustomerId, email: input.email || "" });
  if (!project) throw new Error("Narration project not found for this customer");
  const claimed = await orders.claimDelivery(identity, { staleAfterMs: dependencies.staleAfterMs || 10 * 60 * 1000 });
  if (!claimed) return orders.findForCustomer(identity);
  const choice = narrationChoice(claimed.configuration?.voiceId, claimed.configuration?.styleId);
  if (!choice) throw new Error("Paid narration choice is invalid");
  const book = buildInteractiveBookManifest(project);
  const model = dependencies.model || MODEL();
  const previous = claimed.deliveryManifest || {};
  const compatibleCheckpoint = previous.catalogVersion === NARRATION_CATALOG_VERSION
    && previous.model === model
    && previous.voiceId === choice.voice.id
    && previous.styleId === choice.style.id;
  const manifest = compatibleCheckpoint
    ? { ...previous, scenes: Array.isArray(previous.scenes) ? [...previous.scenes] : [] }
    : { version: 1, catalogVersion: NARRATION_CATALOG_VERSION, model, voiceId: choice.voice.id, styleId: choice.style.id, format: FORMAT, scenes: [] };
  logMemory("narration.start", { orderId: identity.orderId, sceneCount: book.scenes.length });
  try {
    for (const [index, scene] of book.scenes.entries()) {
      const filename = safeSceneFilename(scene.id, index);
      const key = `narrations/${project.id}/${identity.orderId}/${filename}`;
      if (manifest.scenes.some((item) => item.sceneId === scene.id && item.storageKey === key)) {
        await orders.updateDelivery(identity, { fulfillmentStatus: "generating", deliveryManifest: manifest });
        continue;
      }
      const audio = await generateNarrationAudio({ text: scene.text, language: book.language, voiceId: choice.voice.id, styleId: choice.style.id }, dependencies);
      await storage.put({ key, body: audio, contentType: "audio/mpeg" });
      manifest.scenes.push({ sceneId: scene.id, filename, storageKey: key, byteSize: audio.length });
      await orders.updateDelivery(identity, { fulfillmentStatus: "generating", deliveryManifest: manifest });
      logMemory("narration.scene", { orderId: identity.orderId, completed: index + 1, total: book.scenes.length });
    }
    const ready = await orders.updateDelivery(identity, {
      fulfillmentStatus: "ready", storageKey: `narrations/${project.id}/${identity.orderId}/`, deliveryManifest: manifest,
      deliveryError: "", readyAt: new Date().toISOString(),
    });
    logMemory("narration.ready", { orderId: identity.orderId, sceneCount: manifest.scenes.length });
    return ready;
  } catch (error) {
    await orders.updateDelivery(identity, { fulfillmentStatus: "failed", deliveryError: String(error?.message || error) }).catch(() => null);
    logMemory("narration.failed", { orderId: identity.orderId, error: String(error?.message || error).slice(0, 160) });
    throw error;
  }
}

export async function registerPaidNarration(input, dependencies = {}) {
  const projects = dependencies.projectStore || projectStore;
  const orders = dependencies.commerceOrderStore || commerceOrderStore;
  const identity = { wooCustomerId: String(input.wooCustomerId), email: String(input.email || "") };
  const project = await projects.getForCustomer(String(input.projectId), identity);
  if (!project) throw new Error("Narration project not found for this customer");
  if (!await orders.hasPaidEbookPurchase({ projectId: project.id, customerId: project.customerId })) throw new Error("Purchase the digital book before adding AI narration");
  const choice = narrationChoice(input.voiceId, input.styleId);
  if (!choice) throw new Error("Invalid narration choice");
  const record = await orders.recordPaid({
    orderId: String(input.orderId), projectId: project.id, customerId: project.customerId, wooCustomerId: identity.wooCustomerId,
    productType: "narration", pageCount: Number(input.pageCount || 0), orderTotalCents: Number(input.orderTotalCents || 0),
    configuration: { voiceId: choice.voice.id, styleId: choice.style.id },
  });
  if (record.fulfillmentStatus === "ready") return { status: "ready", productType: "narration" };
  setImmediate(() => generatePaidNarration({ ...input, projectId: project.id }, dependencies).catch(() => null));
  return { status: "generating", productType: "narration", retryAfterSeconds: 30 };
}

export function narrationAsset(record, filename) {
  if (!record || record.fulfillmentStatus !== "ready") return null;
  const safe = path.posix.basename(String(filename || ""));
  return (record.deliveryManifest?.scenes || []).find((scene) => scene.filename === safe) || null;
}
