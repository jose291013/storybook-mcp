const VISUAL_PROOF_ACTIONS = new Set(["approve", "regenerate"]);
const RESUMABLE_VISUAL_PROOF_STATUSES = new Set(["approved", "regenerating"]);

function transitionError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * Prepare a cover-proof decision without mutating the project. The caller may
 * persist this value only in the same project update that installs the next
 * durable generation job.
 */
export function prepareVisualProofTransition({
  visualProof = null,
  requestedAction = "",
  resume = false,
  now = new Date().toISOString(),
} = {}) {
  if (!visualProof?.status) return null;
  const status = String(visualProof.status);
  let action = String(requestedAction || "");

  if (status === "awaiting_approval") {
    if (!VISUAL_PROOF_ACTIONS.has(action)) {
      throw transitionError(
        "Approve or regenerate the visual proof before continuing",
        "visual_proof_required",
      );
    }
    if (action === "regenerate" && Number(visualProof.attempts || 1) >= 2) {
      throw transitionError(
        "The included visual-proof retry has already been used",
        "visual_proof_limit",
      );
    }
  } else if (resume && RESUMABLE_VISUAL_PROOF_STATUSES.has(status)) {
    action = status === "approved" ? "approve" : "regenerate";
  } else {
    return null;
  }

  const nextVisualProof = {
    ...visualProof,
    status: action === "approve" ? "approved" : "regenerating",
    ...(action === "approve"
      ? { approvedAt: visualProof.approvedAt || now }
      : { regenerationRequestedAt: visualProof.regenerationRequestedAt || now }),
  };

  return {
    action,
    resumed: resume && status !== "awaiting_approval",
    clearCover: action === "regenerate",
    visualProof: nextVisualProof,
  };
}

export function resumableVisualProofAction(visualProof = null) {
  if (visualProof?.status === "regenerating") return "regenerate";
  if (visualProof?.status === "approved") return "approve";
  return "";
}

export function previewResultForVisualProofTransition(previewResult = null, transition = null) {
  if (!transition?.clearCover) return previewResult;
  return {
    ...(previewResult || {}),
    coverImageUrl: "",
    coverImageStorageKey: "",
    coverPreviewUrl: "",
    coverStorageKey: "",
  };
}
