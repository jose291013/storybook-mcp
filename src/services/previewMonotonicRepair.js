function text(value) {
  return String(value || "").trim();
}

function wardrobeTargetKey(target = {}) {
  const characterId = text(target.characterId);
  const outfitStateId = text(target.outfitStateId);
  const wardrobeAuthorityId = text(target.wardrobeAuthorityId);
  return characterId && outfitStateId && wardrobeAuthorityId
    ? `${characterId}:${outfitStateId}:${wardrobeAuthorityId}`
    : "";
}

function exactWardrobeOnly(policy = null) {
  return Boolean(
    policy
    && Array.isArray(policy.targetDomains)
    && policy.targetDomains.length === 1
    && policy.targetDomains[0] === "wardrobe"
    && policy.wardrobeDiagnostics?.targetingComplete === true,
  );
}

function failedWardrobeTargets(policy = null) {
  if (!exactWardrobeOnly(policy)) return [];
  const targets = Array.isArray(policy.wardrobeDiagnostics?.failedTargets)
    ? policy.wardrobeDiagnostics.failedTargets
    : [];
  const normalized = targets.map((target) => ({
    characterId: text(target.characterId).slice(0, 120),
    outfitStateId: text(target.outfitStateId).slice(0, 120),
    wardrobeAuthorityId: text(target.wardrobeAuthorityId).slice(0, 120),
    ...(text(target.evidenceMode) ? { evidenceMode: text(target.evidenceMode).slice(0, 120) } : {}),
    ...(text(target.semanticSignature) ? { semanticSignature: text(target.semanticSignature).slice(0, 160) } : {}),
  }));
  const keys = normalized.map(wardrobeTargetKey);
  if (keys.some((key) => !key) || new Set(keys).size !== keys.length) return [];
  return normalized;
}

/**
 * A rejected strict-V3 candidate may still be a strictly better private repair
 * base. Promote it only when complete nominative evidence proves that its
 * remaining wardrobe targets are a non-empty strict subset of the previous
 * targets and no other domain is unresolved. Nothing is inferred from prose
 * or pixels, and the candidate remains quarantined until the full QA gate
 * passes.
 */
export function monotonicWardrobeRepairProgress(previousPolicy = null, candidatePolicy = null) {
  const previousTargets = failedWardrobeTargets(previousPolicy);
  const remainingTargets = failedWardrobeTargets(candidatePolicy);
  if (previousTargets.length < 2 || remainingTargets.length !== 1) return null;

  const previousKeys = new Set(previousTargets.map(wardrobeTargetKey));
  const remainingKeys = remainingTargets.map(wardrobeTargetKey);
  if (!remainingKeys.every((key) => previousKeys.has(key))) return null;

  const unresolvedClassifications = Array.isArray(candidatePolicy?.classifications)
    ? candidatePolicy.classifications
    : [];
  if (unresolvedClassifications.some((entry) => text(entry?.domain) !== "wardrobe")) return null;

  return {
    policy: {
      ...candidatePolicy,
      automaticRepair: true,
      targetCodes: ["wardrobe_state_mismatch"],
      targetDomains: ["wardrobe"],
      wardrobeTargets: remainingTargets,
      monotonicProgress: {
        version: 1,
        source: "strict_v3_private_qa",
        previousTargetCount: previousTargets.length,
        remainingTargetCount: remainingTargets.length,
        eligibleForTargetedEdit: true,
      },
    },
    previousTargetCount: previousTargets.length,
    remainingTargetCount: remainingTargets.length,
    resolvedTargetCount: previousTargets.length - remainingTargets.length,
  };
}
