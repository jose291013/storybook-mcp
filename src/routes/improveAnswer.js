import express from "express";
import { improveQuestionnaireAnswer } from "../services/improveAnswer.js";

export const IMPROVABLE_QUESTION_IDS = new Set([
  "favorite_activities",
  "personality",
  "dream",
  "challenge",
  "message",
  "signature_object",
  "important_people",
  "extra_notes",
]);

const attemptsByIp = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 20;

function consumeAttempt(ip) {
  const now = Date.now();
  const recent = (attemptsByIp.get(ip) || []).filter((timestamp) => now - timestamp < WINDOW_MS);
  if (recent.length >= MAX_ATTEMPTS) return false;
  recent.push(now);
  attemptsByIp.set(ip, recent);
  return true;
}

const router = express.Router();

router.post("/improve-answer", async (req, res) => {
  const questionId = String(req.body?.questionId || "").trim();
  const question = String(req.body?.question || "").trim().slice(0, 500);
  const answer = String(req.body?.answer || "").trim();
  const locale = ["FR", "ES", "EN"].includes(req.body?.locale) ? req.body.locale : "FR";

  if (!IMPROVABLE_QUESTION_IDS.has(questionId)) return res.status(400).json({ error: "Unsupported question" });
  if (!answer) return res.status(400).json({ error: "Write an answer before improving it" });
  if (answer.length > 1800) return res.status(400).json({ error: "Answer is too long" });
  if (!consumeAttempt(req.ip || "unknown")) {
    return res.status(429).json({ error: "Too many improvement requests", code: "improve_rate_limited" });
  }

  try {
    const improvedAnswer = await improveQuestionnaireAnswer({ question, answer, locale });
    res.json({ improvedAnswer });
  } catch (error) {
    console.error("improve-answer failed", {
      status: Number(error?.status || error?.statusCode || 0) || undefined,
      type: error?.type || error?.error?.type || undefined,
      code: error?.code || undefined,
      requestId: error?.request_id || error?.requestId || undefined,
      message: String(error?.message || error),
    });
    res.status(502).json({
      error: "Answer improvement is temporarily unavailable",
      code: "improve_temporarily_unavailable",
    });
  }
});

export default router;
