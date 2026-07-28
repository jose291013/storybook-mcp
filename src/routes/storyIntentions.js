import express from "express";
import { createStoryIntentions } from "../services/storyIntentions.js";
import { observeStorySensitivity, storySensitivityMode } from "../services/storySensitivity.js";

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
    const input = {
      creatorSituation,
      childAge,
      locale,
    };
    const sensitivityMode = storySensitivityMode();
    let sensitivityTrace = null;
    const sensitivityPromise = observeStorySensitivity(input, {
      mode: sensitivityMode,
      onTrace: (trace) => {
        sensitivityTrace = trace;
      },
      onError: (error) => console.warn("story-sensitivity observation fallback", {
        mode: sensitivityMode,
        error: String(error?.message || error),
      }),
    });
    const intentions = await createStoryIntentions(input);
    const sensitivityProfile = await sensitivityPromise;
    if (sensitivityProfile) {
      console.info("story-sensitivity observed", {
        version: sensitivityProfile.version,
        level: sensitivityProfile.level,
        category: sensitivityProfile.category,
        restricted: sensitivityProfile.restricted,
        source: sensitivityProfile.source,
        deterministicLevel: sensitivityTrace?.deterministicLevel ?? null,
        deterministicRestricted: sensitivityTrace?.deterministicRestricted ?? null,
        classifierLevel: sensitivityTrace?.classifierLevel ?? null,
        classifierRestricted: sensitivityTrace?.classifierRestricted ?? null,
      });
    }
    res.set("Cache-Control", "no-store");
    res.json({ intentions, ...(sensitivityProfile ? { sensitivityProfile } : {}) });
  } catch (error) {
    console.error("story-intentions failed", error);
    res.status(502).json({ error: "Story intentions are temporarily unavailable" });
  }
});

export default router;
