import express from "express";
import { createStoryIntentions } from "../services/storyIntentions.js";
import { observeStorySensitivity, storySensitivityMode } from "../services/storySensitivity.js";
import {
  childSafetyIntervention,
  childSafetyMode,
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

async function assessChildSafetyRequest({ creatorSituation, childAge, locale, scope }) {
  const mode = childSafetyMode();
  const profile = await evaluateChildSafety({
    text: creatorSituation,
    childAge,
    locale,
    scope,
  }, {
    mode,
    onTrace: (trace) => console.info("child-safety assessed", trace),
    onError: (error) => console.warn("child-safety deterministic fallback", {
      scope,
      error: String(error?.message || error),
    }),
  });
  return {
    mode,
    profile,
    intervention: childSafetyIntervention(profile, mode),
  };
}

router.post("/story-safety", async (req, res) => {
  const body = req.body || {};
  const creatorSituation = String(body.creatorSituation || "").trim().slice(0, 1600);
  const childAge = Number(body.childAge);
  const locale = ["FR", "ES", "EN"].includes(body.locale) ? body.locale : "FR";
  if (!Number.isInteger(childAge) || childAge < 1 || childAge > 14 || !creatorSituation) {
    return res.status(400).json({ error: "Enter the child age and situation before continuing" });
  }
  if (!consumeAttempt(req.ip || "unknown")) return res.status(429).json({ error: "Too many safety requests" });
  try {
    const result = await assessChildSafetyRequest({
      creatorSituation,
      childAge,
      locale,
      scope: "custom_story_intention",
    });
    res.set("Cache-Control", "no-store");
    if (result.intervention) {
      return res.status(result.intervention.status).json({
        error: result.intervention.code,
        ...result.intervention,
      });
    }
    return res.json({ allowed: true, ...(result.profile ? { childSafetyProfile: result.profile } : {}) });
  } catch (error) {
    console.error("story-safety failed", error);
    return res.status(503).json({ error: "Child safety verification is temporarily unavailable" });
  }
});

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
    const childSafety = await assessChildSafetyRequest({
      creatorSituation,
      childAge,
      locale,
      scope: "story_intention",
    });
    const childSafetyProfile = childSafety.profile;
    const intervention = childSafety.intervention;
    if (intervention) {
      res.set("Cache-Control", "no-store");
      return res.status(intervention.status).json({
        error: intervention.code,
        ...intervention,
      });
    }
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
    res.json({
      intentions,
      ...(sensitivityProfile ? { sensitivityProfile } : {}),
      ...(childSafetyProfile ? { childSafetyProfile } : {}),
    });
  } catch (error) {
    console.error("story-intentions failed", error);
    res.status(502).json({ error: "Story intentions are temporarily unavailable" });
  }
});

export default router;
