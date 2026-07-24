import express from "express";
import { findUniverse } from "../config/bookOptions.js";
import { createStorySuggestions } from "../services/storySuggestions.js";

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

router.post("/story-suggestions", async (req, res) => {
  const body = req.body || {};
  const heroName = String(body.heroName || "").trim().slice(0, 120);
  const age = String(body.age || "").trim().slice(0, 20);
  const favoriteActivities = String(body.favoriteActivities || "").trim().slice(0, 800);
  const personality = String(body.personality || "").trim().slice(0, 800);
  const locale = ["FR", "ES", "EN"].includes(body.locale) ? body.locale : "FR";
  const universe = findUniverse(String(body.universeId || ""));

  if (!heroName || !age || !favoriteActivities || !personality) {
    return res.status(400).json({ error: "Complete the child's essential information before requesting suggestions" });
  }
  if (!consumeAttempt(req.ip || "unknown")) return res.status(429).json({ error: "Too many inspiration requests" });

  try {
    const suggestions = await createStorySuggestions({
      heroName,
      age,
      favoriteActivities,
      personality,
      locale,
      universeId: universe.id,
      universe: universe.name,
      universeStoryContract: universe.storyContract,
    });
    res.set("Cache-Control", "no-store");
    res.json({ suggestions, universeId: universe.id });
  } catch (error) {
    console.error("story-suggestions failed", error);
    res.status(502).json({ error: "Story suggestions are temporarily unavailable" });
  }
});

export default router;
