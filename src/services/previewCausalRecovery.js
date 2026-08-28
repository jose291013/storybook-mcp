import crypto from "crypto";
import { isStrictV3AcceptedImagePage, strictPageIssueCodes } from "./previewPageRecovery.js";

export const PREVIEW_CAUSAL_RECOVERY_VERSION = 3;
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
  return (Array.isArray(page?.qualityRepairPolicy?.wardrobeTargets)
    ? page.qualityRepairPolicy.wardrobeTargets
    : []).map((target) => ({
      characterId: text(target?.characterId).slice(0, 120),
      outfitStateId: text(target?.outfitStateId).slice(0, 120),
      wardrobeAuthorityId: text(target?.wardrobeAuthorityId).slice(0, 120),
    })).filter((target) => target.characterId && target.outfitStateId)
    .sort((left, right) => `${left.characterId}:${left.outfitStateId}`.localeCompare(`${right.characterId}:${right.outfitStateId}`));
}

function recoveryPage({ number, issueCodes = [], wardrobeTargets = [], providerSafety = false }) {
  const codes = unique(issueCodes);
  const strategies = unique([
    providerSafety ? "provider_safe_reexpression" : "",
    codes.includes("wardrobe_state_mismatch") ? "wardrobe_reference_isolation" : "",
    !providerSafety ? "canonical_scene_recompose" : "",
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
      providerSafety: existing?.strategies?.includes("provider_safe_reexpression") === true,
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

function referenceKey(reference = {}) {
  return text(reference.storageKey || reference.path || `${reference.kind}:${reference.authorityId || reference.characterId || reference.label}`);
}

/**
 * A provider-safety recovery gets genuinely new, reference-free input. A
 * wardrobe recovery keeps only canonical style/identity/wardrobe authorities
 * and removes adjacent scenes or rejected candidates that can reintroduce the
 * wrong outfit.
 */
export function causalRecoveryReferences(references = [], pageRecovery = null) {
  const source = Array.isArray(references) ? references : [];
  if (!pageRecovery) return source;
  if (pageRecovery.strategies?.includes("provider_safe_reexpression")) return [];
  if (!pageRecovery.strategies?.includes("wardrobe_reference_isolation")) return source;
  const authorityRecovery = pageRecovery.strategies?.includes("wardrobe_authority_satisfiability_recovery");
  const allowed = source.filter((reference) => (
    authorityRecovery
      ? ["wardrobe", "identity"].includes(reference?.kind)
      : ["continuity", "wardrobe", "identity"].includes(reference?.kind)
  ));
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
  if (pageRecovery.strategies?.includes("wardrobe_reference_isolation")
    && !normalizedBasePrompt.includes("CAUSAL RECOVERY MODE — WARDROBE-ISOLATED RECOMPOSITION V1:")) {
    const targets = (pageRecovery.wardrobeTargets || [])
      .map((target) => `${target.characterId} must wear only ${target.outfitStateId}`)
      .join("; ");
    directives.push(`CAUSAL RECOVERY MODE — WARDROBE-ISOLATED RECOMPOSITION V1:
Recompose this one instant from the canonical scene contract. Adjacent-scene pixels and the rejected candidate are deliberately excluded because they carried a conflicting outfit. Treat each supplied wardrobe authority as exclusive for its named character in this scene. ${targets || "Use only the exact per-character outfit state declared below."} Never transfer one person's clothing to another person and never combine ordinary and adventure outfits.`);
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
