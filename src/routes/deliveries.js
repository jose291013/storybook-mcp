import express from "express";
import { commerceOrderStore } from "../services/commerceOrderStore.js";
import { getDeliveryStorage } from "../services/deliveryStorage.js";
import { verifyDeliveryToken } from "../services/deliveryToken.js";

const router = express.Router();

router.get("/deliveries/ebook/:projectId", async (req, res) => {
  try {
    const payload = verifyDeliveryToken(req.query.token);
    if (String(payload.projectId) !== String(req.params.projectId)) return res.status(403).json({ error: "Invalid delivery link" });
    const record = await commerceOrderStore.findForCustomer({
      orderId: payload.orderId, projectId: payload.projectId, wooCustomerId: payload.customerId, productType: "ebook",
    });
    if (!record || record.paymentStatus !== "paid" || record.fulfillmentStatus !== "ready" || record.storageKey !== payload.storageKey) return res.status(404).json({ error: "Ebook delivery unavailable" });
    const asset = await getDeliveryStorage().get(record.storageKey);
    const filename = String(record.downloadFilename || "calitiki-ebook.pdf").replace(/[^A-Za-z0-9._-]/g, "-");
    const headers = {
      "Cache-Control": "private, no-store", "Content-Type": asset.contentType || "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`, "X-Content-Type-Options": "nosniff",
    };
    if (asset.byteSize > 0) headers["Content-Length"] = String(asset.byteSize);
    res.set(headers);
    if (Buffer.isBuffer(asset.body)) return res.end(asset.body);
    if (!asset.body?.pipe) throw new Error("Private storage returned an unsupported stream");
    asset.body.on("error", () => { if (!res.headersSent) res.status(502); res.end(); });
    asset.body.pipe(res);
  } catch (error) {
    const message = String(error?.message || error);
    res.status(message.includes("expired") ? 410 : 403).json({ error: message });
  }
});

export default router;
