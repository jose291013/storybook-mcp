import fs from "fs/promises";
import sharp from "sharp";
import { createOpenAIClient } from "./openaiClient.js";
import { getDeliveryStorage } from "./deliveryStorage.js";
import { storageBodyToBuffer } from "./previewAssetStorage.js";
import { canonicalDigest } from "../contracts/narrativeV3Canonical.js";

export const WARDROBE_VISUAL_AUTHORITY_VERSION = 1;
export const WARDROBE_VISUAL_AUTHORITY_POLICY_VERSION = 4;
export const WARDROBE_AUTHORITY_MODE_DIRECT_IDENTITY_OUTFIT = "direct_identity_outfit";
export const WARDROBE_AUTHORITY_MODE_GARMENT_ONLY = "garment_only_sheet";
export const WARDROBE_EVIDENCE_MODE_BROAD_ATTRIBUTES = "broad_garment_attributes";
export const WARDROBE_EVIDENCE_MODE_EXACT_DESIGN = "exact_garment_design";

function text(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function authorityProjection(value) {
  const copy = structuredClone(value);
  delete copy.validation.artifactDigest;
  return copy;
}

function fail(code, message, issues = []) {
  const error = new Error(message);
  error.code = code;
  error.artifactType = "wardrobe_visual_authority_v1";
  error.issues = issues;
  throw error;
}

export function compileWardrobeVisualAuthorityPlan(sceneRenderContracts = []) {
  const entries = new Map();
  for (const contract of Array.isArray(sceneRenderContracts) ? sceneRenderContracts : []) {
    if (contract?.contract_id !== "calitiki.scene-render-contract.v1") continue;
    for (const character of contract.cast?.required || []) {
      if (text(character?.kind) !== "human") continue;
      const stateId = text(character?.outfit?.state_id);
      const description = text(character?.outfit?.description);
      if (!stateId || !description) {
        fail("wardrobe_visual_authority_state_incomplete", "A visible human outfit has no complete render authority.");
      }
      const characterId = text(character.character_id);
      const authorityKey = `${characterId}:${stateId}`;
      const existing = entries.get(authorityKey) || {
        authorityId: `wardrobe_${canonicalDigest({ characterId, stateId, description }).slice(0, 20)}`,
        characterId,
        characterName: text(character.name),
        stateId,
        description,
        source: text(character?.outfit?.source),
        authorityMode: text(character?.outfit?.source) === "private_identity_binding"
          ? WARDROBE_AUTHORITY_MODE_DIRECT_IDENTITY_OUTFIT
          : WARDROBE_AUTHORITY_MODE_GARMENT_ONLY,
        evidenceMode: text(character?.outfit?.source) === "private_identity_binding"
          ? WARDROBE_EVIDENCE_MODE_BROAD_ATTRIBUTES
          : WARDROBE_EVIDENCE_MODE_EXACT_DESIGN,
        semanticSignature: canonicalDigest({
          characterId,
          stateId,
          description,
          evidenceMode: text(character?.outfit?.source) === "private_identity_binding"
            ? WARDROBE_EVIDENCE_MODE_BROAD_ATTRIBUTES
            : WARDROBE_EVIDENCE_MODE_EXACT_DESIGN,
        }),
        sceneNumbers: [],
        imagePageNumbers: [],
      };
      if (existing.description !== description) {
        fail("wardrobe_visual_authority_description_conflict", `Outfit ${stateId} has two visual descriptions.`);
      }
      const authorityMode = text(character?.outfit?.source) === "private_identity_binding"
        ? WARDROBE_AUTHORITY_MODE_DIRECT_IDENTITY_OUTFIT
        : WARDROBE_AUTHORITY_MODE_GARMENT_ONLY;
      if (existing.authorityMode !== authorityMode) {
        fail("wardrobe_visual_authority_source_conflict", `Outfit ${stateId} has two incompatible authority sources.`);
      }
      existing.sceneNumbers.push(Number(contract.source?.scene_number || 0));
      existing.imagePageNumbers.push(Number(contract.source?.image_page_number || 0));
      entries.set(authorityKey, existing);
    }
  }
  const authorities = [...entries.values()]
    .map((entry) => ({
      ...entry,
      sceneNumbers: [...new Set(entry.sceneNumbers.filter(Number.isInteger))].sort((a, b) => a - b),
      imagePageNumbers: [...new Set(entry.imagePageNumbers.filter(Number.isInteger))].sort((a, b) => a - b),
    }))
    .sort((a, b) => a.authorityId.localeCompare(b.authorityId));
  const value = {
    version: WARDROBE_VISUAL_AUTHORITY_VERSION,
    authorities,
    validation: { artifactDigest: "" },
  };
  value.validation.artifactDigest = canonicalDigest(authorityProjection(value));
  return Object.freeze(structuredClone(value));
}

export function acceptedWardrobeAuthorityAssets(plan, checkpoint = null) {
  if (!checkpoint || checkpoint.version !== WARDROBE_VISUAL_AUTHORITY_VERSION) return new Map();
  if (checkpoint.policyVersion === WARDROBE_VISUAL_AUTHORITY_POLICY_VERSION
    && checkpoint.planDigest === plan?.validation?.artifactDigest) {
    return checkpointWardrobeAuthorityAssets(checkpoint);
  }
  // Older policies generated a face-and-clothes composite. Those pixels are
  // deliberately incompatible with this split authority contract and must
  // never become the identity source of a resumed book.
  return new Map();
}

export function checkpointWardrobeAuthorityAssets(checkpoint = null) {
  if (!checkpoint || checkpoint.version !== WARDROBE_VISUAL_AUTHORITY_VERSION
    || checkpoint.policyVersion !== WARDROBE_VISUAL_AUTHORITY_POLICY_VERSION) return new Map();
  return new Map((checkpoint.assets || [])
    .filter((asset) => asset?.status === "accepted" && asset?.storageKey)
    .map((asset) => [text(asset.authorityId), structuredClone(asset)]));
}

export function assertWardrobeVisualAuthorityCoverage(plan, assets) {
  const accepted = assets instanceof Map ? assets : new Map();
  const missing = (plan?.authorities || []).filter((entry) => !accepted.has(entry.authorityId));
  if (missing.length) {
    fail(
      "wardrobe_visual_authority_incomplete",
      "A required private outfit model sheet is not yet accepted.",
      missing.map((entry) => ({ path: `/authorities/${entry.authorityId}`, message: "Missing accepted wardrobe pixel authority." })),
    );
  }
  return true;
}

/**
 * Prove that generation and private QA consume the same outfit authority with
 * one explicit comparison rule. A checkpoint is not sealed merely because a
 * file exists: its immutable character/state/source binding must still match.
 */
export function assertWardrobeVisualAuthoritySatisfiability(plan, assets) {
  assertWardrobeVisualAuthorityCoverage(plan, assets);
  const accepted = assets instanceof Map ? assets : new Map();
  const bindings = [];
  for (const entry of plan?.authorities || []) {
    const asset = accepted.get(entry.authorityId);
    const problems = [];
    if (text(asset?.characterId) !== entry.characterId) problems.push("character_binding_mismatch");
    if (text(asset?.stateId) !== entry.stateId) problems.push("outfit_state_binding_mismatch");
    if (text(asset?.authorityMode) !== entry.authorityMode) problems.push("authority_mode_mismatch");
    if (text(asset?.evidenceMode) !== entry.evidenceMode) problems.push("evidence_mode_mismatch");
    if (text(asset?.semanticSignature) !== entry.semanticSignature) problems.push("semantic_signature_mismatch");
    if (entry.authorityMode === WARDROBE_AUTHORITY_MODE_DIRECT_IDENTITY_OUTFIT
      && (asset?.directSource !== true || asset?.identityBearing !== true)) {
      problems.push("ordinary_identity_source_mismatch");
    }
    if (entry.authorityMode === WARDROBE_AUTHORITY_MODE_GARMENT_ONLY
      && asset?.identityBearing === true) {
      problems.push("garment_authority_contains_identity");
    }
    if (problems.length) {
      fail(
        "wardrobe_visual_authority_unsatisfiable",
        "A wardrobe authority cannot be used consistently by generation and verification.",
        problems.map((message) => ({ path: `/authorities/${entry.authorityId}`, message })),
      );
    }
    bindings.push({
      authorityId: entry.authorityId,
      characterId: entry.characterId,
      stateId: entry.stateId,
      authorityMode: entry.authorityMode,
      evidenceMode: entry.evidenceMode,
      semanticSignature: entry.semanticSignature,
    });
  }
  return Object.freeze({
    version: 1,
    planDigest: plan.validation.artifactDigest,
    bindingDigest: canonicalDigest(bindings),
    bindings,
  });
}

export function wardrobeAuthorityPrompt(entry) {
  if (entry.authorityMode !== WARDROBE_AUTHORITY_MODE_GARMENT_ONLY) {
    fail("wardrobe_visual_authority_direct_source", "An ordinary outfit must use its private identity source directly.");
  }
  return `Create one private GARMENT-ONLY model sheet for a personalized children's book.
Show exactly one complete outfit on one anonymous headless mannequin against a plain warm off-white studio background.
There must be no person, face, head, hair, skin, hands, named character or identity resemblance. The mannequin is only a neutral support for the clothing.
The rendering family, artistic medium, proportions and surface treatment must match the PRIMARY APPROVED STYLE ANCHOR.
EXACT ACTIVE OUTFIT (${entry.stateId}): ${entry.description}
Show the complete garment system clearly from neckline or hood to footwear, including every required protective accessory. Do not show another outfit, spare clothing, props, scenery, text, labels, logos, inset views, duplicate mannequins or a before/after comparison.`;
}

export function directWardrobeAuthorityAsset(entry, identityReference) {
  if (entry?.authorityMode !== WARDROBE_AUTHORITY_MODE_DIRECT_IDENTITY_OUTFIT) return null;
  const storageKey = text(identityReference?.storageKey);
  if (!storageKey) {
    fail(
      "wardrobe_visual_authority_reference_missing",
      "The ordinary outfit cannot be sealed without its durable private identity source.",
      [{ path: `/authorities/${entry.authorityId}`, message: "Missing durable private identity reference." }],
    );
  }
  return {
    version: WARDROBE_VISUAL_AUTHORITY_VERSION,
    authorityId: entry.authorityId,
    characterId: entry.characterId,
    characterName: entry.characterName,
    stateId: entry.stateId,
    description: entry.description,
    authorityMode: entry.authorityMode,
    evidenceMode: entry.evidenceMode,
    semanticSignature: entry.semanticSignature,
    identityBearing: true,
    directSource: true,
    status: "accepted",
    storageKey,
    previewUrl: text(identityReference?.previewUrl),
    sha256: "",
    advisoryIssueCodes: [],
  };
}

async function referenceSource(reference) {
  if (!reference) return null;
  if (Buffer.isBuffer(reference.buffer)) return reference.buffer;
  if (reference.storageKey) {
    const asset = await getDeliveryStorage().get(reference.storageKey);
    return storageBodyToBuffer(asset.body);
  }
  if (reference.path) return fs.readFile(reference.path);
  return null;
}

function extractText(response) {
  if (response?.output_text) return response.output_text;
  return (response?.output || []).flatMap((item) => item?.content || [])
    .map((item) => item?.text || item?.output_text || "").join("\n");
}

function parseJson(value) {
  const source = String(value || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(source); } catch { return null; }
}

export async function inspectWardrobeVisualAuthority({
  imagePath,
  entry,
  styleReference,
  client = null,
}) {
  if (entry?.authorityMode !== WARDROBE_AUTHORITY_MODE_GARMENT_ONLY) {
    return { approved: false, issueCodes: ["wardrobe_authority_direct_source_required"] };
  }
  const [candidate, style] = await Promise.all([
    fs.readFile(imagePath),
    referenceSource(styleReference),
  ]);
  if (!candidate || !style) {
    return { approved: false, issueCodes: ["wardrobe_authority_reference_missing"] };
  }
  const compact = async (source, detail = 840) => sharp(source).rotate().resize(detail, detail, {
    fit: "inside",
    withoutEnlargement: true,
  }).jpeg({ quality: 86 }).toBuffer();
  const [candidateJpeg, styleJpeg] = await Promise.all([
    compact(candidate, 1024), compact(style),
  ]);
  const qaClient = client || createOpenAIClient({ kind: "qa" });
  const response = await qaClient.responses.create({
    model: process.env.IMAGE_QA_MODEL || process.env.VISION_MODEL || "gpt-4.1-mini",
    input: [{ role: "user", content: [
      { type: "input_text", text: `You validate one private wardrobe model sheet before any book page may use it.
Image 1 is the candidate garment-only sheet. Image 2 is the approved book style anchor.
Approve only if Image 1 shows exactly one complete outfit on one anonymous headless mannequin, contains no person or identity-bearing face/body, matches the exact outfit state, and uses the same broad rendering family as Image 2.
OUTFIT STATE: ${entry.stateId}
OUTFIT DESCRIPTION: ${entry.description}
Return only JSON: {"garment_only":"pass|fail|uncertain","cardinality":"pass|fail|uncertain","wardrobe":"pass|fail|uncertain","style":"pass|fail|uncertain"}.` },
      { type: "input_image", image_url: `data:image/jpeg;base64,${candidateJpeg.toString("base64")}`, detail: "high" },
      { type: "input_image", image_url: `data:image/jpeg;base64,${styleJpeg.toString("base64")}`, detail: "low" },
    ] }],
    max_output_tokens: 220,
  });
  const result = parseJson(extractText(response)) || {};
  const blockingDomains = ["garment_only", "cardinality", "wardrobe"];
  const issueCodes = blockingDomains.filter((domain) => result[domain] !== "pass")
    .map((domain) => `wardrobe_authority_${domain}_${result[domain] === "fail" ? "failed" : "uncertain"}`);
  // This private sheet is a garment authority, not a customer
  // deliverable. Its pixels are later combined with the approved style anchor
  // for every scene, whose ordinary evidence gate remains strictly responsible
  // for rendering-family continuity. Blocking a complete book because this
  // neutral sheet is only an approximate style match wastes image attempts
  // without improving the wardrobe authority it is meant to establish.
  const advisoryIssueCodes = result.style === "pass"
    ? []
    : [`wardrobe_authority_style_${result.style === "fail" ? "failed" : "uncertain"}`];
  return { approved: issueCodes.length === 0, issueCodes, advisoryIssueCodes };
}

export function wardrobeVisualReferencesForScene(sceneRenderContract, assets) {
  const accepted = assets instanceof Map ? assets : new Map();
  return (sceneRenderContract?.cast?.required || []).flatMap((character) => {
    const authority = [...accepted.values()].find((asset) => (
      text(asset.characterId) === text(character.character_id)
      && text(asset.stateId) === text(character.outfit?.state_id)
    ));
    if (!authority?.storageKey) return [];
    return [{
      storageKey: authority.storageKey,
      kind: "wardrobe",
      label: authority.identityBearing
        ? `${character.name}: LOCKED IDENTITY AND ORDINARY WARDROBE AUTHORITY for ${character.outfit.state_id}; REQUIRED OUTFIT ATTRIBUTES: ${authority.description}. Preserve this person's identity and the broad ordinary garment categories, dominant colors and footwear visible in this exact source. Remove logos and ignore harmless texture, fit or hidden-detail differences; never substitute an adventure or protective outfit. Do not copy the photo background or rendering style`
        : `${character.name}: LOCKED GARMENT-ONLY WARDROBE AUTHORITY for ${character.outfit.state_id}; copy this exact garment design, colors, material and footwear onto the separately supplied identity`,
      authorityId: authority.authorityId,
      characterId: text(character.character_id),
      characterName: text(character.name),
      outfitStateId: text(character.outfit.state_id),
      description: text(authority.description),
      authorityMode: text(authority.authorityMode),
      evidenceMode: text(authority.evidenceMode),
      semanticSignature: text(authority.semanticSignature),
      identityBearing: authority.identityBearing === true,
    }];
  });
}

export function wardrobeVisualReferencesFromCheckpoint(sceneRenderContract, checkpoint = null) {
  return wardrobeVisualReferencesForScene(
    sceneRenderContract,
    checkpointWardrobeAuthorityAssets(checkpoint),
  );
}

function uniqueReferences(references = []) {
  const seen = new Set();
  return references.filter((reference) => {
    const key = `${text(reference?.kind)}:${text(reference?.authorityId || reference?.characterId || reference?.storageKey || reference?.path)}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function wardrobeRepairReferencePlan({
  repairPolicy = null,
  sceneReferences = [],
  repairSource = null,
} = {}) {
  const targets = Array.isArray(repairPolicy?.wardrobeTargets) ? repairPolicy.wardrobeTargets : [];
  const wardrobeOnly = Array.isArray(repairPolicy?.targetDomains)
    && repairPolicy.targetDomains.length === 1
    && repairPolicy.targetDomains[0] === "wardrobe";
  if (!wardrobeOnly || !targets.length) return null;
  const references = Array.isArray(sceneReferences) ? sceneReferences : [];
  const wardrobeReferences = references.filter((reference) => reference?.kind === "wardrobe");
  const targetReferences = targets.map((target) => wardrobeReferences.find((reference) => (
    text(reference.characterId) === text(target.characterId)
    && text(reference.outfitStateId) === text(target.outfitStateId)
    && text(reference.authorityId) === text(target.wardrobeAuthorityId)
    && (!text(target.semanticSignature)
      || text(reference.semanticSignature) === text(target.semanticSignature))
  )));
  const targetSemanticsComplete = targetReferences.every((reference, index) => {
    if (!reference) return false;
    const target = targets[index];
    if (!text(reference.characterName)) return false;
    if (text(target?.evidenceMode) === WARDROBE_EVIDENCE_MODE_BROAD_ATTRIBUTES
      && !text(reference.description)) return false;
    return true;
  });
  const continuity = references.find((reference) => reference?.kind === "continuity");
  const singleTarget = targets.length === 1;
  const monotonicTargetedEdit = singleTarget
    && repairPolicy?.monotonicProgress?.eligibleForTargetedEdit === true;
  if (!targetSemanticsComplete
    || (!continuity && !monotonicTargetedEdit)
    || (singleTarget && !repairSource)) {
    return { version: 1, complete: false, mode: "quarantine", references: [] };
  }
  const selectedWardrobes = singleTarget ? targetReferences : wardrobeReferences;
  const identityBearingCharacters = new Set(selectedWardrobes
    .filter((reference) => reference.identityBearing === true)
    .map((reference) => text(reference.characterId)));
  const selectedCharacters = new Set(selectedWardrobes.map((reference) => text(reference.characterId)));
  const uncoveredIdentities = references.filter((reference) => (
    reference?.kind === "identity"
    && !identityBearingCharacters.has(text(reference.characterId))
    && (!singleTarget || selectedCharacters.has(text(reference.characterId)))
  ));
  return {
    version: 1,
    complete: true,
    mode: monotonicTargetedEdit
      ? "monotonic_targeted_edit"
      : singleTarget
        ? "targeted_edit"
        : "canonical_scene_recompose",
    references: uniqueReferences([
      ...(singleTarget && repairSource ? [repairSource] : []),
      ...(!monotonicTargetedEdit && continuity ? [continuity] : []),
      ...selectedWardrobes,
      ...uncoveredIdentities,
    ]),
  };
}
