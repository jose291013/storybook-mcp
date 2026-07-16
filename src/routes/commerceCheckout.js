import crypto from "crypto";
import express from "express";
import { normalizePageCount } from "../config/bookOptions.js";
import { creditStore } from "../services/creditStore.js";
import { readWooCustomer } from "../services/draftIdentity.js";
import { projectStore } from "../services/projectStore.js";
import { signCommercePayload, verifyCommerceWebhookSignature, woocommerceCheckoutBridgeUrl } from "../services/commerceToken.js";

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
  try {
    const project = await projectStore.getForCustomer(projectId, identity);
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (!project.previewResult || !["preview_ready", "purchased"].includes(project.status)) return res.status(409).json({ error: "Generate and validate the preview before purchase" });
    const pageCount = normalizePageCount(project.questionnaire?.page_count || project.productConfiguration?.page_count || project.productConfiguration?.pageCount || 24);
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
  const reservationId = String(req.body?.reservationId || ""); const status = String(req.body?.status || "").toLowerCase();
  if (!orderId || !customerId || !["paid", "cancelled", "failed", "refunded"].includes(status)) return res.status(400).json({ error: "Invalid book order status" });
  if (!verifyCommerceWebhookSignature({ orderId, customerId, reservationId, status, signature: req.get("X-Calitiki-Signature") })) return res.status(401).json({ error: "Invalid signature" });
  try {
    const reservation = status === "paid" ? await creditStore.captureCheckout(reservationId, orderId) : await creditStore.releaseCheckout(reservationId, orderId);
    res.json({ ok: true, reservationStatus: reservation?.status || "none" });
  } catch (error) { res.status(500).json({ error: String(error?.message || error) }); }
});

export default router;
