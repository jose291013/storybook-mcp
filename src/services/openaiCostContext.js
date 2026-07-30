import { AsyncLocalStorage } from "node:async_hooks";

const storage = new AsyncLocalStorage();

function clean(value, maximum = 160) {
  return String(value || "").trim().slice(0, maximum);
}

export function withOpenAICostContext(context, callback) {
  const normalized = {
    projectId: clean(context?.projectId, 80),
    runId: clean(context?.runId, 160),
    workflow: clean(context?.workflow || "book_generation", 80),
    attemptKind: clean(context?.attemptKind || "normal", 40),
    stage: clean(context?.stage, 160),
    getStage: typeof context?.getStage === "function" ? context.getStage : null,
    getAttemptKind: typeof context?.getAttemptKind === "function" ? context.getAttemptKind : null,
  };
  return storage.run(normalized, callback);
}

export function currentOpenAICostContext() {
  const context = storage.getStore();
  if (!context?.projectId) return null;
  let stage = context.stage;
  let attemptKind = context.attemptKind;
  try {
    if (context.getStage) stage = context.getStage() || stage;
    if (context.getAttemptKind) attemptKind = context.getAttemptKind() || attemptKind;
  } catch {
    // Cost attribution must never interrupt a customer generation.
  }
  return {
    projectId: context.projectId,
    runId: context.runId,
    workflow: context.workflow,
    stage: clean(stage, 160),
    attemptKind: clean(attemptKind || "normal", 40),
  };
}

export function inferAttemptKind(stage, fallback = "normal") {
  const value = String(stage || "").toLowerCase();
  if (/modification|customer.change/.test(value)) return "customer_change";
  if (/quality|repair|recheck|targeted/.test(value)) return "quality_repair";
  if (/retry|attempt:[2-9]|attempt:[1-9][0-9]/.test(value)) return "technical_retry";
  return fallback;
}
