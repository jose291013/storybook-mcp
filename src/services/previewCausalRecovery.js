import crypto from "crypto";
import { isStrictV3AcceptedImagePage, strictPageIssueCodes } from "./previewPageRecovery.js";

export const PREVIEW_CAUSAL_RECOVERY_VERSION = 7;
export const PREVIEW_CAUSAL_RECOVERY_LIMIT = 3;

function text(value) {
  return String(value || "").trim();
}

function pageNumber(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))].sort();
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function signatureFor(pages) {
  return crypto.createHash("sha256")
    .update(JSON.stringify(stableValue(pages)))
    .digest("hex")
    .slice(0, 24);
}

function normalizedWardrobeTargets(page = {}) {
  const explicitTargets = Array.isArray(page?.qualityRepairPolicy?.wardrobeTargets)
    ? page.qualityRepairPolicy.wardrobeTargets
    : [];
  // A formerly exhausted shared-authority run stored the nominative evidence
  // under wardrobeDiagnostics.failedTargets while its strategy deliberately
  // emitted an empty repair target list. Recover those same canonical ids;
  // never infer a target from prose or from an image.
  const diagnosticTargets = page?.qualityRepairPolicy?.wardrobeDiagnostics?.targetingComplete === true
    && Array.isArray(page?.qualityRepairPolicy?.wardrobeDiagnostics?.failedTargets)
    ? page.qualityRepairPolicy.wardrobeDiagnostics.failedTargets
    : [];
  const sourceTargets = explicitTargets.length ? explicitTargets : diagnosticTargets;
  return sourceTargets.map((target) => ({
      characterId: text(target?.characterId).slice(0, 120),
      outfitStateId: text(target?.outfitStateId).slice(0, 120),
      wardrobeAuthorityId: text(target?.wardrobeAuthorityId).slice(0, 120),
    })).filter((target) => target.characterId && target.outfitStateId)
    .sort((left, right) => `${left.characterId}:${left.outfitStateId}`.localeCompare(`${right.characterId}:${right.outfitStateId}`));
}

function recoveryPage({
  number,
  issueCodes = [],
  wardrobeTargets = [],
  providerSafety = false,
  monotonicTargetedEdit = false,
}) {
  const codes = unique(issueCodes);
  const strategies = unique([
    providerSafety ? "provider_safe_minimal_projection" : "",
    codes.includes("wardrobe_state_mismatch") ? "wardrobe_reference_isolation" : "",
    monotonicTargetedEdit ? "monotonic_targeted_edit" : "",
    !providerSafety && !monotonicTargetedEdit ? "canonical_scene_recompose" : "",
  ]);
  return {
    pageNumber: number,
    issueCodes: codes,
    wardrobeTargets,
    strategies,
  };
}

/**
 * Compile a bounded, non-sensitive recovery prescription from durable QA facts.
 * It intentionally stores only page numbers, canonical ids and issue codes:
 * never customer prose, photos, names or provider prompts.
 */
export function buildPreviewCausalRecovery({ previewResult = {}, priorRecovery = null } = {}) {
  const byPage = new Map();
  for (const deferred of Array.isArray(previewResult?.deferredIllustrationPages)
    ? previewResult.deferredIllustrationPages
    : []) {
    const number = pageNumber(deferred?.pageNumber);
    if (!number) continue;
    byPage.set(number, recoveryPage({
      number,
      issueCodes: [...(deferred?.issueCodes || []), "provider_safety_rejection"],
      providerSafety: true,
    }));
  }
  for (const page of Array.isArray(previewResult?.draftPages) ? previewResult.draftPages : []) {
    const number = pageNumber(page?.page_number);
    if (!number || page?.page_type !== "image" || isStrictV3AcceptedImagePage(page)) continue;
    const existing = byPage.get(number);
    const codes = unique([...(existing?.issueCodes || []), ...strictPageIssueCodes(page)]);
    byPage.set(number, recoveryPage({
      number,
      issueCodes: codes,
      wardrobeTargets: normalizedWardrobeTargets(page),
      providerSafety: existing?.strategies?.some((strategy) => [
        "provider_safe_reexpression",
        "provider_safe_minimal_projection",
      ].includes(strategy)) === true,
      monotonicTargetedEdit: page?.qualityRepairPolicy?.monotonicProgress?.eligibleForTargetedEdit === true,
    }));
  }

  const rawPages = [...byPage.values()].sort((left, right) => left.pageNumber - right.pageNumber);
  const authorityUseCounts = new Map();
  for (const page of rawPages) {
    for (const target of page.wardrobeTargets || []) {
      const authorityId = text(target.wardrobeAuthorityId);
      if (authorityId) authorityUseCounts.set(authorityId, (authorityUseCounts.get(authorityId) || 0) + 1);
    }
  }
  const pages = rawPages.map((page) => {
    const sharedAuthorityIds = unique((page.wardrobeTargets || [])
      .map((target) => target.wardrobeAuthorityId)
      .filter((authorityId) => (authorityUseCounts.get(text(authorityId)) || 0) > 1));
    if (!sharedAuthorityIds.length) return page;
    return {
      ...page,
      sharedAuthorityIds,
      strategies: unique([...(page.strategies || []), "wardrobe_authority_satisfiability_recovery"]),
    };
  });
  if (!pages.length) return null;
  const signature = signatureFor(pages);
  const compatiblePrior = priorRecovery?.version === PREVIEW_CAUSAL_RECOVERY_VERSION ? priorRecovery : null;
  const attemptedSignatures = unique([
    ...(Array.isArray(compatiblePrior?.attemptedSignatures) ? compatiblePrior.attemptedSignatures : []),
    ...(compatiblePrior?.consumedAt && compatiblePrior?.signature ? [compatiblePrior.signature] : []),
  ]).slice(-PREVIEW_CAUSAL_RECOVERY_LIMIT);
  const available = !attemptedSignatures.includes(signature)
    && attemptedSignatures.length < PREVIEW_CAUSAL_RECOVERY_LIMIT;
  return {
    version: PREVIEW_CAUSAL_RECOVERY_VERSION,
    signature,
    pages,
    attemptedSignatures,
    available,
    repeatBlocked: !available,
    preparedAt: new Date().toISOString(),
  };
}

export function consumePreviewCausalRecovery(recovery, consumedAt = new Date().toISOString()) {
  if (!recovery || recovery.version !== PREVIEW_CAUSAL_RECOVERY_VERSION || recovery.available !== true) return null;
  return {
    ...recovery,
    available: false,
    repeatBlocked: false,
    consumedAt,
    attemptedSignatures: unique([...(recovery.attemptedSignatures || []), recovery.signature])
      .slice(-PREVIEW_CAUSAL_RECOVERY_LIMIT),
  };
}

export function previewCausalRecoveryPage(recovery, number) {
  if (!recovery || recovery.version !== PREVIEW_CAUSAL_RECOVERY_VERSION) return null;
  return recovery.pages?.find((page) => page.pageNumber === Number(number)) || null;
}

function wardrobeTargetKey(target = {}) {
  const characterId = text(target.characterId);
  const outfitStateId = text(target.outfitStateId);
  const wardrobeAuthorityId = text(target.wardrobeAuthorityId);
  return characterId && outfitStateId && wardrobeAuthorityId
    ? `${characterId}:${outfitStateId}:${wardrobeAuthorityId}`
    : "";
}

/**
 * Old exhausted checkpoints can contain complete nominative wardrobe evidence
 * while their stored strategy intentionally has no executable target list.
 * Rehydrate that list only when the causal recovery and the complete durable
 * diagnostics agree exactly. No name, prose or image observation is inferred.
 */
export function rehydrateCausalWardrobeRepairPolicy(repairPolicy = null, pageRecovery = null) {
  const policy = repairPolicy && typeof repairPolicy === "object" ? repairPolicy : null;
  if (!policy || !pageRecovery?.strategies?.includes("wardrobe_reference_isolation")) return policy;
  const issueCodes = unique(pageRecovery.issueCodes || []);
  if (!issueCodes.length || issueCodes.some((code) => code !== "wardrobe_state_mismatch")) return policy;
  if (policy?.wardrobeDiagnostics?.targetingComplete !== true) return policy;

  const recoveryTargets = Array.isArray(pageRecovery.wardrobeTargets)
    ? pageRecovery.wardrobeTargets
    : [];
  const diagnosticTargets = Array.isArray(policy?.wardrobeDiagnostics?.failedTargets)
    ? policy.wardrobeDiagnostics.failedTargets
    : [];
  if (!recoveryTargets.length || !diagnosticTargets.length) return policy;

  const diagnosticsByKey = new Map(diagnosticTargets
    .map((target) => [wardrobeTargetKey(target), target])
    .filter(([key]) => key));
  const hydratedTargets = recoveryTargets.map((target) => {
    const diagnostic = diagnosticsByKey.get(wardrobeTargetKey(target));
    if (!diagnostic) return null;
    return {
      characterId: text(diagnostic.characterId).slice(0, 120),
      outfitStateId: text(diagnostic.outfitStateId).slice(0, 120),
      wardrobeAuthorityId: text(diagnostic.wardrobeAuthorityId).slice(0, 120),
      ...(text(diagnostic.evidenceMode) ? { evidenceMode: text(diagnostic.evidenceMode).slice(0, 120) } : {}),
      ...(text(diagnostic.semanticSignature) ? { semanticSignature: text(diagnostic.semanticSignature).slice(0, 160) } : {}),
    };
  });
  if (hydratedTargets.some((target) => !target)) return policy;
  const uniqueTargetKeys = new Set(hydratedTargets.map(wardrobeTargetKey));
  if (uniqueTargetKeys.size !== recoveryTargets.length) return policy;

  return {
    ...policy,
    automaticRepair: true,
    targetCodes: unique([...(policy.targetCodes || []), "wardrobe_state_mismatch"]),
    targetDomains: ["wardrobe"],
    wardrobeTargets: hydratedTargets.sort((left, right) => wardrobeTargetKey(left).localeCompare(wardrobeTargetKey(right))),
    causalRecoveryHydration: {
      version: 1,
      source: "checkpoint_diagnostics",
      targetCount: hydratedTargets.length,
    },
  };
}

function referenceKey(reference = {}) {
  return text(reference.storageKey || reference.path || `${reference.kind}:${reference.authorityId || reference.characterId || reference.label}`);
}

/**
 * A provider-safety recovery gets genuinely new, reference-free input. A
 * wardrobe recovery keeps only canonical identity/wardrobe authorities and
 * removes every scene-bearing pixel source. The approved cover remains in the
 * independent QA evidence set, but it cannot teach the generator an obsolete
 * or adventure outfit while an ordinary outfit is being reconstructed.
 */
export function causalRecoveryReferences(references = [], pageRecovery = null) {
  const source = Array.isArray(references) ? references : [];
  if (!pageRecovery) return source;
  if (pageRecovery.strategies?.some((strategy) => [
    "provider_safe_reexpression",
    "provider_safe_minimal_projection",
  ].includes(strategy))) return [];
  if (!pageRecovery.strategies?.includes("wardrobe_reference_isolation")) return source;
  const monotonicTargetedEdit = pageRecovery.strategies?.includes("monotonic_targeted_edit") === true;
  const allowedKinds = monotonicTargetedEdit
    ? ["repair_source", "wardrobe", "identity"]
    : ["wardrobe", "identity"];
  const allowed = source.filter((reference) => allowedKinds.includes(reference?.kind));
  const wardrobeStorageKeys = new Set(allowed
    .filter((reference) => reference?.kind === "wardrobe")
    .map(referenceKey)
    .filter(Boolean));
  const seen = new Set();
  return allowed.filter((reference) => {
    const key = referenceKey(reference);
    if (!key || seen.has(key)) return false;
    if (reference?.kind === "identity" && wardrobeStorageKeys.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function causalRecoveryPrompt(basePrompt, pageRecovery = null) {
  const normalizedBasePrompt = text(basePrompt);
  if (!pageRecovery) return normalizedBasePrompt;
  const directives = [];
  if (pageRecovery.strategies?.includes("provider_safe_reexpression")
    && !normalizedBasePrompt.includes("CAUSAL RECOVERY MODE — PROVIDER-SAFE RE-EXPRESSION V1:")) {
    directives.push(`CAUSAL RECOVERY MODE — PROVIDER-SAFE RE-EXPRESSION V1:
Create a fresh, calm, non-threatening children's-book composition from the immutable physical snapshot below. Use no supplied person or scene pixels. Preserve the exact cast cardinality, location, wardrobe, object states and central action, but express emotion through posture, gaze, spacing and environment. Avoid alarming close-ups, injury, restraint, peril, weapons, exposed bodies, medical detail, intense physical contact or imitating a real photograph. Every depicted person is an original illustrated character.`);
  }
  if (pageRecovery.strategies?.includes("provider_safe_minimal_projection")
    && !normalizedBasePrompt.includes("CAUSAL RECOVERY MODE — PROVIDER-SAFE MINIMAL PROJECTION V1:")) {
    directives.push("CAUSAL RECOVERY MODE — PROVIDER-SAFE MINIMAL PROJECTION V1: use only the allowlisted pseudonymous setting, exact cast, wardrobe, equipment, objects and main action supplied by the minimal projection. Reader prose, customer names, photo fingerprints, causal history and forbidden-list wording are deliberately absent. Do not invent any omitted event.");
  }
  if (pageRecovery.strategies?.includes("wardrobe_reference_isolation")
    && !normalizedBasePrompt.includes("CAUSAL RECOVERY MODE — WARDROBE-ISOLATED RECOMPOSITION V2:")) {
    const targets = (pageRecovery.wardrobeTargets || [])
      .map((target) => `${target.characterId} must wear only ${target.outfitStateId}`)
      .join("; ");
    const monotonicTargetedEdit = pageRecovery.strategies?.includes("monotonic_targeted_edit") === true;
    directives.push(monotonicTargetedEdit
      ? `CAUSAL RECOVERY MODE — MONOTONIC WARDROBE EDIT V1:
The preserved private candidate is already strictly better than its source and has exactly one verified wardrobe defect left. Edit only that named character in place from the supplied canonical wardrobe authority. Preserve every other person, face, pose, object, camera choice, background, lighting and accepted outfit exactly. ${targets || "Use only the exact per-character outfit state declared below."} Never recompose the scene and never transfer one person's clothing to another person.`
      : `CAUSAL RECOVERY MODE — WARDROBE-ISOLATED RECOMPOSITION V2:
Recompose this one instant from the canonical scene contract. Cover, adjacent-scene and rejected-candidate pixels are deliberately excluded from generation because any of them may carry a conflicting outfit. The locked textual style contract controls the rendering family; the approved cover remains private QA evidence only. Treat each supplied wardrobe authority as exclusive for its named character in this scene. ${targets || "Use only the exact per-character outfit state declared below."} Never transfer one person's clothing to another person and never combine ordinary and adventure outfits.`);
    if (pageRecovery.strategies?.includes("wardrobe_authority_satisfiability_recovery")
      && !normalizedBasePrompt.includes("CAUSAL RECOVERY MODE — SHARED WARDROBE AUTHORITY V1:")) {
      directives.push(`CAUSAL RECOVERY MODE — SHARED WARDROBE AUTHORITY V1:
The same wardrobe authority failed on more than one page, so no scene or cover pixels may reinterpret it. Build each required person directly from that person's supplied authority and the immutable current-scene description. For an ordinary identity-bound outfit, preserve its broad garment categories, dominant colors and footwear; logos, minor texture, folds and hidden details are irrelevant. Never replace ordinary clothes with adventure, protective or universe clothing.`);
    }
  } else if (pageRecovery.strategies?.includes("canonical_scene_recompose")
    && !normalizedBasePrompt.includes("CAUSAL RECOVERY MODE — CANONICAL RECOMPOSITION V1:")) {
    directives.push("CAUSAL RECOVERY MODE — CANONICAL RECOMPOSITION V1: create a new composition from the immutable contract instead of editing or imitating the rejected candidate.");
  }
  return [...directives, normalizedBasePrompt].filter(Boolean).join("\n\n");
}
