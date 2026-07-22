import crypto from "crypto";
import express from "express";
import { creditStore } from "../services/creditStore.js";
import { listCustomerCreations } from "../services/customerCreationLibrary.js";

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

router.get("/commerce/wallet", async (req, res) => {
  const wooCustomerId = String(req.query?.wooCustomerId || "");
  const timestamp = Number.parseInt(req.query?.timestamp, 10);
  const secret = String(process.env.WOOCOMMERCE_BRIDGE_SECRET || "");
  const expected = crypto.createHmac("sha256", secret).update(`wallet|${wooCustomerId}|${timestamp}`).digest("hex");
  if (secret.length < 32 || !safeEqual(req.get("x-calitiki-signature"), expected)) return res.status(401).json({ error: "Invalid wallet signature" });
  if (!wooCustomerId || !Number.isInteger(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300) return res.status(400).json({ error: "Wallet request has expired" });
  try {
    const identity = { wooCustomerId, email: "" };
    const [summary, history] = await Promise.all([creditStore.summary(identity), creditStore.history(identity, 50)]);
    res.set("Cache-Control", "private, no-store");
    res.json({ ...summary, history, buyCreditsUrl: process.env.WOOCOMMERCE_CREDITS_URL || "" });
  } catch (error) { res.status(500).json({ error: String(error?.message || error) }); }
});

router.get("/commerce/creations", async (req, res) => {
  const wooCustomerId = String(req.query?.wooCustomerId || "");
  const timestamp = Number.parseInt(req.query?.timestamp, 10);
  const secret = String(process.env.WOOCOMMERCE_BRIDGE_SECRET || "");
  const expected = crypto.createHmac("sha256", secret).update(`creations|${wooCustomerId}|${timestamp}`).digest("hex");
  if (secret.length < 32 || !safeEqual(req.get("x-calitiki-signature"), expected)) return res.status(401).json({ error: "Invalid creations signature" });
  if (!wooCustomerId || !Number.isInteger(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300) return res.status(400).json({ error: "Creations request has expired" });
  try {
    const projects = await listCustomerCreations({ wooCustomerId, email: "" });
    res.set("Cache-Control", "private, no-store");
    res.json({ projects });
  } catch (error) { res.status(500).json({ error: String(error?.message || error) }); }
});

export default router;

