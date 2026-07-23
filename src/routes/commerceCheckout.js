import crypto from "crypto";
import express from "express";
import { normalizePageCount } from "../config/bookOptions.js";
import { isProductEnabled } from "../config/productAvailability.js";
import { creditStore } from "../services/creditStore.js";
import { previewRevisionStore } from "../services/previewRevisionStore.js";
import { commerceOrderStore } from "../services/commerceOrderStore.js";
import { freshEbookDeliveryLink, fulfillPaidBookOrder } from "../services/ebookFulfillment.js";
import { narrationChoice } from "../config/narrationOptions.js";
import { registerPaidNarration } from "../services/narrationFulfillment.js";
import { generationCheckpoint } from "../services/previewGenerationCheckpoint.js";
import { readWooCustomer } from "../services/draftIdentity.js";
import { projectStore } from "../services/projectStore.js";
import { signCommercePayload, verifyBookOrderWebhook, verifyDeliveryLinkRequest, woocommerceCheckoutBridgeUrl } from "../services/commerceToken.js";

const router = express.Router();

function identityFromRequest(req) {
  try { return readWooCustomer(req); }
  catch { return null; }
}

router.post("/commerce/checkout-link", async (req, res) => {
  const identity = identityFromRequest(req);
  if (!identity) return res.status(401).json({ error: "Authentication required" });
  const projectId = String(req.body?.projectId || "");
  const productType = String(req.body?.productType || "").toLowerCase();
  if (!projectId || !["ebook", "print"].includes(productType)) return res.status(400).json({ error: "Invalid checkout selection" });
  if (!isProductEnabled(productType)) return res.status(409).json({ error: "This product format is coming soon" });
  try {
    const project = await projectStore.getForCustomer(projectId, identity);
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (!project.previewResult || !["preview_ready", "purchased"].includes(project.status)) return res.status(409).json({ error: "Generate and validate the preview before purchase" });
    if (project.status !== "purchased" && await previewRevisionStore.activeForProject(project.id)) {
      return res.status(409).json({ error: "Approve or reject the pending preview modification before checkout" });
    }
    const pageCount = normalizePageCount(project.questionnaire?.page_count || project.productConfiguration?.page_count || project.productConfiguration?.pageCount || 24);
    // Older technical retries could complete after their original wallet
    // reservation had been released. Settle that successful preview before
    // building an unpaid checkout, but never alter an already purchased book.
    const previewReservationId = generationCheckpoint(project)?.creditReservationId;
    if (project.status === "preview_ready" && previewReservationId) {
      await creditStore.capturePreview(previewReservationId);
    }
    const reservation = await creditStore.reserveProjectRebate(identity, { projectId, idempotencyKey: `checkout:${projectId}:${productType}:${crypto.randomUUID()}` });
    const payload = {
      sub: String(identity.wooCustomerId), projectId, productType, pageCount,
      projectTitle: String(project.title || project.finalBlueprint?.cover?.title || "Livre personnalisé").slice(0, 160),
      rebateCents: Number(reservation.amountCents || 0), reservationId: String(reservation.id || ""),
      exp: Math.floor(Date.now() / 1000) + 10 * 60,
    };
    const token = signCommercePayload(payload);
    res.set("Cache-Control", "no-store");
    res.json({ checkoutUrl: woocommerceCheckoutBridgeUrl(token), rebateCents: payload.rebateCents, productType, pageCount });
  } catch (error) { res.status(500).json({ error: String(error?.message || error) }); }
});

router.post("/commerce/book-order-status", async (req, res) => {
  const orderId = String(req.body?.orderId || ""); const customerId = String(req.body?.wooCustomerId || "");
  const projectId = String(req.body?.projectId || ""); const reservationId = String(req.body?.reservationId || "");
  const productType = String(req.body?.productType || "").toLowerCase(); const pageCount = Number(req.body?.pageCount || 0);
  const orderTotalCents = Number(req.body?.orderTotalCents || 0); const status = String(req.body?.status || "").toLowerCase();
  const narrationVoiceId = String(req.body?.narrationVoiceId || "");
  const narrationStyleId = String(req.body?.narrationStyleId || "");
  const signaturePayload = {
    orderId, customerId, projectId, reservationId, productType, pageCount, orderTotalCents, status,
    narrationVoiceId, narrationStyleId, signature: req.get("X-Calitiki-Signature"),
  };
  if (!orderId || !customerId || !projectId || !["ebook", "print", "narration"].includes(productType) || !["paid", "cancelled", "failed", "refunded"].includes(status)) return res.status(400).json({ error: "Invalid book order status" });
  if (productType === "narration" && !narrationChoice(narrationVoiceId, narrationStyleId)) return res.status(400).json({ error: "Invalid narration choice" });
  if (!verifyBookOrderWebhook(signaturePayload)) return res.status(401).json({ error: "Invalid signature" });
  try {
    // AI narration is an independent, non-refundable generation option. It never
    // consumes or releases the preview-credit reservation used by book products.
    const reservation = productType === "narration"
      ? null
      : status === "paid"
        ? await creditStore.captureCheckout(reservationId, orderId)
        : await creditStore.releaseCheckout(reservationId, orderId);
    if (status !== "paid") {
      await commerceOrderStore.recordStatus({ orderId, projectId, productType, wooCustomerId: customerId, status }).catch(() => null);
      return res.json({ ok: true, reservationStatus: reservation?.status || "none", fulfillment: { status: "revoked", productType } });
    }
    if (productType === "narration") {
      const fulfillment = await registerPaidNarration({
        orderId, projectId, pageCount, orderTotalCents, wooCustomerId: customerId,
        voiceId: narrationVoiceId, styleId: narrationStyleId,
      });
      return res.json({ ok: true, reservationStatus: "not_applicable", fulfillment });
    }
    const fulfillment = await fulfillPaidBookOrder({
      orderId, projectId, productType, pageCount, orderTotalCents, wooCustomerId: customerId, email: String(req.body?.email || ""),
    });
    res.json({ ok: true, reservationStatus: reservation?.status || "none", fulfillment });
  } catch (error) { res.status(500).json({ error: String(error?.message || error) }); }
});

router.get("/commerce/ebook-download-link", async (req, res) => {
  const orderId = String(req.query.orderId || ""); const customerId = String(req.query.wooCustomerId || "");
  const projectId = String(req.query.projectId || ""); const timestamp = Number(req.query.timestamp || 0);
  if (!verifyDeliveryLinkRequest({ orderId, customerId, projectId, timestamp, signature: req.get("X-Calitiki-Signature") })) return res.status(401).json({ error: "Invalid signature" });
  try {
    const delivery = await freshEbookDeliveryLink({ orderId, projectId, wooCustomerId: customerId });
    if (!delivery) return res.status(404).json({ error: "Ebook delivery not ready" });
    res.set("Cache-Control", "no-store");
    res.json({ delivery });
  } catch (error) { res.status(500).json({ error: String(error?.message || error) }); }
});

export default router;
