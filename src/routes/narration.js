import express from "express";
import { normalizePageCount } from "../config/bookOptions.js";
import { localizedNarrationCatalog, narrationChoice, NARRATION_CATALOG_VERSION } from "../config/narrationOptions.js";
import { readWooCustomer } from "../services/draftIdentity.js";
import { commerceOrderStore } from "../services/commerceOrderStore.js";
import { getDeliveryStorage } from "../services/deliveryStorage.js";
import { generateNarrationAudio, generatePaidNarration, narrationAsset } from "../services/narrationFulfillment.js";
import { NARRATION_ACTION, narrationCheckoutAllowed, narrationNextAction } from "../services/narrationLifecycle.js";
import { projectStore } from "../services/projectStore.js";
import { signCommercePayload, woocommerceCheckoutBridgeUrl } from "../services/commerceToken.js";

const router = express.Router();
const SAFE_ID = /^[A-Za-z0-9_-]{6,128}$/;
const sampleGenerations = new Map();
const SAMPLE_TEXT = {
  fr: "Dans la forêt enchantée, une petite lumière dorée invita les amis à avancer avec courage.",
  es: "En el bosque encantado, una pequeña luz dorada invitó a los amigos a avanzar con valentía.",
  en: "In the enchanted forest, a little golden light invited the friends to move forward bravely.",
};

function requireIdentity(req, res) {
  try { const identity = readWooCustomer(req); if (!identity) throw new Error(); return identity; }
  catch { res.status(401).json({ error: "Authentication required" }); return null; }
}

async function ownedPaidProject(req, res) {
  const identity = requireIdentity(req, res); if (!identity) return null;
  if (!SAFE_ID.test(String(req.params.id || ""))) { res.status(400).json({ error: "Invalid project" }); return null; }
  const project = await projectStore.getForCustomer(req.params.id, identity);
  if (!project) { res.status(404).json({ error: "Project not found" }); return null; }
  if (!await commerceOrderStore.hasPaidEbookPurchase({ projectId: project.id, customerId: project.customerId })) {
    res.status(403).json({ error: "Purchase the digital book before adding AI narration" }); return null;
  }
  return { project, identity };
}

function languageFor(project) {
  const raw = String(project.finalBlueprint?.language || project.questionnaire?.language || project.locale || "FR").toLowerCase();
  return raw.startsWith("es") ? "es-ES" : raw.startsWith("en") ? "en-GB" : "fr-FR";
}

function pipePrivateAudio(res, asset) {
  res.set({ "Cache-Control": "private, no-store", "Content-Type": asset.contentType || "audio/mpeg", "X-Content-Type-Options": "nosniff" });
  if (asset.byteSize > 0) res.set("Content-Length", String(asset.byteSize));
  if (Buffer.isBuffer(asset.body)) return res.end(asset.body);
  asset.body.on("error", () => { if (!res.headersSent) res.status(502); res.end(); });
  asset.body.pipe(res);
}

async function cachedNarrationSample({ key, text, language, voiceId, styleId }) {
  const storage = getDeliveryStorage();
  try { return await storage.get(key); }
  catch {
    if (!sampleGenerations.has(key)) {
      sampleGenerations.set(key, (async () => {
        const audio = await generateNarrationAudio({ text, language, voiceId, styleId });
        await storage.put({ key, body: audio, contentType: "audio/mpeg" });
      })().finally(() => sampleGenerations.delete(key)));
    }
    await sampleGenerations.get(key);
    return storage.get(key);
  }
}

router.get("/projects/:id/narration", async (req, res) => {
  try {
    const owned = await ownedPaidProject(req, res); if (!owned) return;
    const language = languageFor(owned.project);
    const record = await commerceOrderStore.findLatestNarration({ projectId: owned.project.id, customerId: owned.project.customerId });
    const active = await commerceOrderStore.findReadyNarration({ projectId: owned.project.id, customerId: owned.project.customerId });
    const nextAction = narrationNextAction(record);
    if (record?.paymentStatus === "paid" && ["queued", "generating"].includes(record.fulfillmentStatus)) {
      setImmediate(() => generatePaidNarration({ orderId: record.orderId, projectId: record.projectId, wooCustomerId: record.wooCustomerId, pageCount: record.pageCount }).catch(() => null));
    }
    res.set("Cache-Control", "private, no-store").json({
      project: { id: owned.project.id, title: owned.project.title || owned.project.finalBlueprint?.cover?.title || "Calitiki", pageCount: normalizePageCount(owned.project.questionnaire?.page_count || owned.project.productConfiguration?.page_count || 24), language },
      freeDeviceVoice: true,
      nextAction,
      hasActiveNarration: Boolean(active),
      aiNarration: record ? { status: record.fulfillmentStatus, paymentStatus: record.paymentStatus, voiceId: record.configuration?.voiceId, styleId: record.configuration?.styleId, error: record.fulfillmentStatus === "failed" ? record.deliveryError : "" } : null,
      catalog: localizedNarrationCatalog(language),
      disclosure: "La voix proposée est générée par une intelligence artificielle.",
    });
  } catch (error) { res.status(500).json({ error: String(error?.message || error) }); }
});

router.get("/projects/:id/narration-sample", async (req, res) => {
  try {
    const owned = await ownedPaidProject(req, res); if (!owned) return;
    const voiceId = String(req.query.voiceId || ""); const styleId = String(req.query.styleId || "");
    if (!narrationChoice(voiceId, styleId)) return res.status(400).json({ error: "Invalid narration choice" });
    const language = languageFor(owned.project); const locale = language.slice(0, 2);
    const key = `narration-samples/${NARRATION_CATALOG_VERSION}/${locale}/${voiceId}-${styleId}.mp3`;
    const asset = await cachedNarrationSample({ key, text: SAMPLE_TEXT[locale] || SAMPLE_TEXT.fr, language, voiceId, styleId });
    return pipePrivateAudio(res, asset);
  } catch (error) { res.status(502).json({ error: String(error?.message || error) }); }
});

router.post("/projects/:id/narration-checkout-link", async (req, res) => {
  try {
    const owned = await ownedPaidProject(req, res); if (!owned) return;
    const existing = await commerceOrderStore.findLatestNarration({ projectId: owned.project.id, customerId: owned.project.customerId });
    if (!narrationCheckoutAllowed(existing)) {
      const nextAction = narrationNextAction(existing);
      return res.status(409).json({
        error: nextAction === NARRATION_ACTION.RETRY
          ? "Retry the paid narration without another purchase"
          : "AI narration generation is already in progress for this book",
        code: nextAction === NARRATION_ACTION.RETRY ? "narration_retry_available" : "narration_generation_in_progress",
      });
    }
    const voiceId = String(req.body?.voiceId || ""); const styleId = String(req.body?.styleId || "");
    if (!narrationChoice(voiceId, styleId)) return res.status(400).json({ error: "Invalid narration choice" });
    const pageCount = normalizePageCount(owned.project.questionnaire?.page_count || owned.project.productConfiguration?.page_count || 24);
    const payload = {
      sub: String(owned.identity.wooCustomerId), projectId: owned.project.id, productType: "narration", pageCount,
      projectTitle: String(owned.project.title || owned.project.finalBlueprint?.cover?.title || "Livre personnalisé").slice(0, 160),
      rebateCents: 0, reservationId: "", narrationVoiceId: voiceId, narrationStyleId: styleId,
      exp: Math.floor(Date.now() / 1000) + 10 * 60,
    };
    res.set("Cache-Control", "no-store").json({ checkoutUrl: woocommerceCheckoutBridgeUrl(signCommercePayload(payload)), pageCount, rebateCents: 0 });
  } catch (error) { res.status(500).json({ error: String(error?.message || error) }); }
});

router.post("/projects/:id/narration-retry", async (req, res) => {
  try {
    const owned = await ownedPaidProject(req, res); if (!owned) return;
    const existing = await commerceOrderStore.findLatestNarration({ projectId: owned.project.id, customerId: owned.project.customerId });
    if (narrationNextAction(existing) !== NARRATION_ACTION.RETRY) {
      return res.status(409).json({ error: "This narration is not awaiting a technical retry", code: "narration_retry_not_available" });
    }
    const identity = {
      orderId: existing.orderId,
      projectId: existing.projectId,
      productType: "narration",
      wooCustomerId: existing.wooCustomerId,
    };
    await commerceOrderStore.updateDelivery(identity, { fulfillmentStatus: "queued", deliveryError: "" });
    setImmediate(() => generatePaidNarration({
      orderId: existing.orderId,
      projectId: existing.projectId,
      wooCustomerId: existing.wooCustomerId,
      pageCount: existing.pageCount,
    }).catch(() => null));
    res.set("Cache-Control", "no-store").status(202).json({ ok: true, status: "generating" });
  } catch (error) { res.status(500).json({ error: String(error?.message || error) }); }
});

router.get("/projects/:id/narration-assets/:filename", async (req, res) => {
  try {
    const owned = await ownedPaidProject(req, res); if (!owned) return;
    const record = await commerceOrderStore.findReadyNarration({ projectId: owned.project.id, customerId: owned.project.customerId });
    const scene = narrationAsset(record, req.params.filename);
    if (!scene) return res.status(404).end();
    return pipePrivateAudio(res, await getDeliveryStorage().get(scene.storageKey));
  } catch { if (!res.headersSent) res.status(404); res.end(); }
});

export default router;
