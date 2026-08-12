import crypto from "node:crypto";

function normalized(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function qualityReviewInstructionFingerprint(instruction) {
  return crypto.createHash("sha256").update(normalized(instruction)).digest("hex");
}

export function classifyQualityReviewFailure(error, scope = "illustration") {
  const message = normalized(error?.message || error);
  const requestIncompatible = [
    "conflicts with the approved scene",
    "changed the approved named-character mentions",
    "does not fit the existing page",
    "cannot change the approved",
  ].some((fragment) => message.includes(fragment));
  if (requestIncompatible) {
    return {
      kind: "request_incompatible",
      retrySameInstruction: false,
      suggestedScope: scope === "text" ? "illustration" : "text",
      publicCode: "quality_review_request_incompatible",
    };
  }
  const transient = [
    "timeout", "timed out", "temporarily unavailable", "rate limit", "socket",
    "network", "fetch failed", "econnreset", "storage", "503", "502",
  ].some((fragment) => message.includes(fragment));
  if (transient) {
    return {
      kind: "temporary_failure",
      retrySameInstruction: true,
      suggestedScope: scope,
      publicCode: "quality_review_temporary_failure",
    };
  }
  return {
    kind: "technical_unknown",
    retrySameInstruction: true,
    suggestedScope: scope,
    publicCode: "quality_review_technical_unknown",
  };
}

export function qualityReviewRepairStrategy({ attemptNumber = 1, previousFailureKind = "" } = {}) {
  if (Number(attemptNumber) <= 1) return "standard_scoped_edit";
  return previousFailureKind === "request_incompatible"
    ? "contract_minimal_reformulation"
    : "resilient_source_preserving_retry";
}
