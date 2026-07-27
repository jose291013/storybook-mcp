import express from "express";
import { createStoryIntentions } from "../services/storyIntentions.js";

const router = express.Router();
const attemptsByIp = new Map();
const WINDOW_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 6;

function consumeAttempt(ip) {
  const now = Date.now();
  const recent = (attemptsByIp.get(ip) || []).filter((timestamp) => now - timestamp < WINDOW_MS);
  if (recent.length >= MAX_ATTEMPTS) return false;
  recent.push(now);
  attemptsByIp.set(ip, recent);
  return true;
}

router.post("/story-intentions", async (req, res) => {
  const body = req.body || {};
  const creatorSituation = String(body.creatorSituation || "").trim().slice(0, 1600);
  const childAge = Number(body.childAge);
  const locale = ["FR", "ES", "EN"].includes(body.locale) ? body.locale : "FR";

  if (!Number.isInteger(childAge) || childAge < 1 || childAge > 14) {
    return res.status(400).json({ error: "Enter a valid child age before requesting help" });
  }
  if (!creatorSituation) {
    return res.status(400).json({ error: "Describe the situation before requesting help" });
  }
  if (!consumeAttempt(req.ip || "unknown")) return res.status(429).json({ error: "Too many intention requests" });

  try {
    const intentions = await createStoryIntentions({
      creatorSituation,
      childAge,
      locale,
    });
    res.set("Cache-Control", "no-store");
    res.json({ intentions });
  } catch (error) {
    console.error("story-intentions failed", error);
    res.status(502).json({ error: "Story intentions are temporarily unavailable" });
  }
});

export default router;
