import express from "express";
import { findUniverse } from "../config/bookOptions.js";
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
  const heroName = String(body.heroName || "").trim().slice(0, 120);
  const age = String(body.age || "").trim().slice(0, 20);
  const favoriteActivities = String(body.favoriteActivities || "").trim().slice(0, 800);
  const personality = String(body.personality || "").trim().slice(0, 800);
  const creatorSituation = String(body.creatorSituation || "").trim().slice(0, 1600);
  const locale = ["FR", "ES", "EN"].includes(body.locale) ? body.locale : "FR";
  const universe = findUniverse(String(body.universeId || ""));

  if (!heroName || !age || !favoriteActivities || !personality || !creatorSituation) {
    return res.status(400).json({ error: "Complete the child information and describe the situation before requesting help" });
  }
  if (!consumeAttempt(req.ip || "unknown")) return res.status(429).json({ error: "Too many intention requests" });

  try {
    const intentions = await createStoryIntentions({
      heroName,
      age,
      favoriteActivities,
      personality,
      creatorSituation,
      locale,
      universeId: universe.id,
      universe: universe.name,
      universeStoryContract: universe.storyContract,
    });
    res.set("Cache-Control", "no-store");
    res.json({ intentions, universeId: universe.id });
  } catch (error) {
    console.error("story-intentions failed", error);
    res.status(502).json({ error: "Story intentions are temporarily unavailable" });
  }
});

export default router;
