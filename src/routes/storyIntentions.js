import express from "express";
import crypto from "node:crypto";
import { createStoryIntentions } from "../services/storyIntentions.js";
import { ensureDraftOwner } from "../services/draftIdentity.js";
import {
  completeIntentionIdeationRound,
  intentionIdeationFingerprint,
  releaseIntentionIdeationRound,
  reserveIntentionIdeationRound,
} from "../services/intentionIdeationBudget.js";
import {
  guideStorySensitivity,
  observeStorySensitivity,
  storySensitivityMode,
  storySensitivityResponse,
} from "../services/storySensitivity.js";
import { localizedSafetyResources } from "../services/safetyResources.js";
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
      return res.status(result.intervention.status).json(childSafetyResponse(result.intervention, locale));
    }
    const sensitivity = await guideStorySensitivity({
      creatorSituation,
      childAge,
      locale,
    }, {
      mode: storySensitivityMode(),
      onError: (error) => console.warn("story-sensitivity guided fallback", {
        error: String(error?.message || error),
      }),
    });
    if (sensitivity.guidance?.status) {
      return res.status(sensitivity.guidance.status).json(storySensitivityResponse(sensitivity.guidance, locale));
    }
    return res.json({
      allowed: true,
      ...(result.profile ? { childSafetyProfile: result.profile } : {}),
      ...(sensitivity.profile ? { sensitivityProfile: sensitivity.profile } : {}),
      ...(sensitivity.guidance ? { sensitivityGuidance: sensitivity.guidance } : {}),
    });
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
  const intentionSessionId = /^[A-Za-z0-9_-]{8,80}$/.test(String(body.intentionSessionId || ""))
    ? String(body.intentionSessionId)
    : "legacy";
  const requestId = /^[A-Za-z0-9_-]{8,80}$/.test(String(body.requestId || ""))
    ? String(body.requestId)
    : crypto.randomUUID();
  const previousInterpretations = (Array.isArray(body.previousInterpretations)
    ? body.previousInterpretations
    : [])
    .slice(0, 6)
    .map((item) => ({
      title: String(item?.title || "").trim().slice(0, 140),
      understanding: String(item?.understanding || "").trim().slice(0, 700),
      first_step: String(item?.first_step || "").trim().slice(0, 400),
    }))
    .filter((item) => item.title && item.understanding);

  if (!Number.isInteger(childAge) || childAge < 1 || childAge > 14) {
    return res.status(400).json({ error: "Enter a valid child age before requesting help" });
  }
  if (!creatorSituation) {
    return res.status(400).json({ error: "Describe the situation before requesting help" });
  }
  if (!consumeAttempt(req.ip || "unknown")) return res.status(429).json({ error: "Too many intention requests" });

  let ideationBudget = null;
  let reservationIdentity = null;
  try {
    const owner = ensureDraftOwner(req, res);
    const input = {
      creatorSituation,
      childAge,
      locale,
      intentionSessionId,
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
      return res.status(intervention.status).json(childSafetyResponse(intervention, locale));
    }
    const sensitivityMode = storySensitivityMode();
    let sensitivityTrace = null;
    const sensitivityDependencies = {
      mode: sensitivityMode,
      onTrace: (trace) => {
        sensitivityTrace = trace;
      },
      onError: (error) => console.warn("story-sensitivity assessment fallback", {
        mode: sensitivityMode,
        error: String(error?.message || error),
      }),
    };
    const guided = sensitivityMode === "guided"
      ? await guideStorySensitivity(input, sensitivityDependencies)
      : null;
    if (guided?.guidance?.status) {
      res.set("Cache-Control", "no-store");
      return res.status(guided.guidance.status).json(storySensitivityResponse(guided.guidance, locale));
    }
    reservationIdentity = {
      ownerHash: owner.ownerHash,
      inputFingerprint: intentionIdeationFingerprint(input),
      requestId,
    };
    ideationBudget = await reserveIntentionIdeationRound(reservationIdentity);
    if (!ideationBudget.allowed) {
      res.set("Cache-Control", "no-store");
      if (ideationBudget.busy) {
        return res.status(409).json({
          code: "intention_ideation_in_progress",
          error: "Another intention perspective batch is already being prepared",
          ...ideationBudget,
        });
      }
      return res.status(409).json({
        code: "intention_ideation_limit_reached",
        error: "The three intention perspective rounds have already been generated",
        ...ideationBudget,
      });
    }
    const sensitivityPromise = sensitivityMode === "observe"
      ? observeStorySensitivity(input, sensitivityDependencies)
      : Promise.resolve(guided?.profile || null);
    const intentions = await createStoryIntentions({
      ...input,
      roundNumber: ideationBudget.roundNumber,
      previousInterpretations,
      sensitivityContract: guided?.contract || null,
    });
    if (!Array.isArray(intentions) || intentions.length !== 3) {
      throw new Error("The intention batch did not contain exactly three perspectives");
    }
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
    ideationBudget = await completeIntentionIdeationRound(reservationIdentity);
    reservationIdentity = null;
    res.set("Cache-Control", "no-store");
    res.json({
      intentions,
      ...ideationBudget,
      ...(sensitivityProfile ? { sensitivityProfile } : {}),
      ...(guided?.guidance ? { sensitivityGuidance: guided.guidance } : {}),
      ...(childSafetyProfile ? { childSafetyProfile } : {}),
    });
  } catch (error) {
    if (reservationIdentity) {
      await releaseIntentionIdeationRound(reservationIdentity).catch(() => null);
    }
    console.error("story-intentions failed", error);
    res.status(502).json({
      error: "Story intentions are temporarily unavailable",
      ...(ideationBudget ? {
        roundNumber: ideationBudget.roundNumber,
        roundsRemaining: ideationBudget.roundsRemaining,
        maximumRounds: ideationBudget.maximumRounds,
      } : {}),
    });
  }
});

router.get("/safety-resources", (req, res) => {
  const locale = ["FR", "ES", "EN"].includes(String(req.query.locale || "").toUpperCase())
    ? String(req.query.locale).toUpperCase()
    : "FR";
  res.set("Cache-Control", "public, max-age=3600");
  res.json(localizedSafetyResources({
    countryCode: req.query.country,
    locale,
  }));
});

export default router;
