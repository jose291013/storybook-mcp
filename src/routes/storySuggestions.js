import express from "express";
import { findUniverse } from "../config/bookOptions.js";
import { normalizeStoryIntentions } from "../services/storyIntentions.js";
import { createStorySuggestions } from "../services/storySuggestions.js";
import {
  childSafetyIntervention,
  childSafetyMode,
  childSafetyResponse,
  evaluateChildSafety,
} from "../services/childSafety.js";

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
  const creatorSituation = String(body.creatorSituation || "").trim().slice(0, 1600);
  const selectedIntention = body.selectedIntention && typeof body.selectedIntention === "object"
    ? normalizeStoryIntentions({ intentions: [body.selectedIntention] })[0]
    : null;
  const locale = ["FR", "ES", "EN"].includes(body.locale) ? body.locale : "FR";
  const universe = findUniverse(String(body.universeId || ""));

  if (!heroName || !age || !favoriteActivities || !personality || !creatorSituation || !selectedIntention?.id) {
    return res.status(400).json({ error: "Confirm the parent intention before requesting story suggestions" });
  }
  if (!consumeAttempt(req.ip || "unknown")) return res.status(429).json({ error: "Too many inspiration requests" });

  try {
    const activeChildSafetyMode = childSafetyMode();
    const childSafetyProfile = await evaluateChildSafety({
      text: [
        creatorSituation,
        selectedIntention?.title,
        selectedIntention?.understanding,
        selectedIntention?.desired_change,
        selectedIntention?.protective_doubt,
        selectedIntention?.first_step,
        selectedIntention?.message,
      ].filter(Boolean).join("\n"),
      childAge: Number(age),
      locale,
      scope: "story_suggestions",
    }, {
      mode: activeChildSafetyMode,
      onTrace: (trace) => console.info("child-safety assessed", trace),
      onError: (error) => console.warn("child-safety deterministic fallback", {
        scope: "story_suggestions",
        error: String(error?.message || error),
      }),
    });
    const intervention = childSafetyIntervention(childSafetyProfile, activeChildSafetyMode);
    if (intervention) {
      return res.status(intervention.status).json(childSafetyResponse(intervention, locale));
    }
    const suggestions = await createStorySuggestions({
      heroName,
      age,
      favoriteActivities,
      personality,
      creatorSituation,
      selectedIntention,
      locale,
      universeId: universe.id,
      universe: universe.name,
      universeStoryContract: universe.storyContract,
    });
    res.set("Cache-Control", "no-store");
    res.json({
      suggestions,
      universeId: universe.id,
      ...(childSafetyProfile ? { childSafetyProfile } : {}),
    });
  } catch (error) {
    console.error("story-suggestions failed", error);
    res.status(502).json({ error: "Story suggestions are temporarily unavailable" });
  }
});

export default router;
