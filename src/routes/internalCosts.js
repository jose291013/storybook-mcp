import crypto from "node:crypto";
import express from "express";
import { getBookCostDetails, listBookCostSummaries } from "../services/openaiCostLedger.js";

const router = express.Router();

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function internalCostsSignature({ timestamp, projectId = "" }, secret = process.env.WOOCOMMERCE_BRIDGE_SECRET || "") {
  return crypto.createHmac("sha256", secret).update(`internal-costs|${timestamp}|${projectId}`).digest("hex");
}

function authorize(req, res) {
  const timestamp = Number.parseInt(req.query?.timestamp, 10);
  const projectId = String(req.query?.projectId || "");
  const secret = String(process.env.WOOCOMMERCE_BRIDGE_SECRET || "");
  const expected = internalCostsSignature({ timestamp, projectId }, secret);
  const validTimestamp = Number.isInteger(timestamp)
    && Math.abs(Math.floor(Date.now() / 1000) - timestamp) <= 300;
  if (secret.length < 32 || !validTimestamp || !safeEqual(req.get("x-calitiki-signature"), expected)) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return { projectId };
}

router.get("/internal/book-costs", async (req, res) => {
  const authorized = authorize(req, res);
  if (!authorized) return;
  if (authorized.projectId
    && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(authorized.projectId)) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }
  try {
    const payload = authorized.projectId
      ? await getBookCostDetails(authorized.projectId)
      : { summaries: await listBookCostSummaries({ limit: req.query?.limit }) };
    res.set("Cache-Control", "private, no-store");
    res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    res.json(payload);
  } catch (error) {
    console.error("[cost-ledger] internal report failed", JSON.stringify({
      projectId: authorized.projectId,
      error: String(error?.message || error).slice(0, 300),
    }));
    res.status(500).json({ error: "Internal cost report unavailable" });
  }
});

export default router;
