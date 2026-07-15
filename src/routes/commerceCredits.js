import crypto from "crypto";
import express from "express";
import { creditStore } from "../services/creditStore.js";

const router = express.Router();

function safeEqual(left, right) {
  const a = Buffer.from(String(left || "")); const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.post("/commerce/credit-order-paid", async (req, res) => {
  const orderId = String(req.body?.orderId || "");
  const wooCustomerId = String(req.body?.wooCustomerId || "");
  const amountCents = Number.parseInt(req.body?.amountCents, 10);
  const secret = String(process.env.WOOCOMMERCE_BRIDGE_SECRET || "");
  const expected = crypto.createHmac("sha256", secret).update(`${orderId}|${wooCustomerId}|${amountCents}`).digest("hex");
  if (secret.length < 32 || !safeEqual(req.get("x-calitiki-signature"), expected)) return res.status(401).json({ error: "Invalid webhook signature" });
  if (!orderId || !wooCustomerId || !Number.isInteger(amountCents) || amountCents < 50) return res.status(400).json({ error: "Invalid credit order" });
  try {
    const summary = await creditStore.grantPaidOrder({ wooCustomerId, email: String(req.body?.email || "") }, { amountCents, orderId });
    res.json({ ok: true, ...summary });
  } catch (error) { res.status(500).json({ error: String(error?.message || error) }); }
});

export default router;

