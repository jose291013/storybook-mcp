import fs from "fs/promises";
import sharp from "sharp";
import { createOpenAIClient } from "./openaiClient.js";
import { getDeliveryStorage } from "./deliveryStorage.js";
import { storageBodyToBuffer } from "./previewAssetStorage.js";
import { canonicalDigest } from "../contracts/narrativeV3Canonical.js";

export const WARDROBE_VISUAL_AUTHORITY_VERSION = 1;
export const WARDROBE_VISUAL_AUTHORITY_POLICY_VERSION = 1;

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
      // The ordinary outfit already has an exact private pixel authority: the
      // customer identity photo. Adventure outfits need a generated, accepted
      // model sheet because text alone is not a stable pixel authority.
      if (character?.outfit?.source === "private_identity_binding") continue;
      const characterId = text(character.character_id);
      const authorityKey = `${characterId}:${stateId}`;
      const existing = entries.get(authorityKey) || {
        authorityId: `wardrobe_${canonicalDigest({ characterId, stateId, description }).slice(0, 20)}`,
        characterId,
        characterName: text(character.name),
        stateId,
        description,
        source: text(character?.outfit?.source),
        sceneNumbers: [],
        imagePageNumbers: [],
      };
      if (existing.description !== description) {
        fail("wardrobe_visual_authority_description_conflict", `Outfit ${stateId} has two visual descriptions.`);
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
  if (!checkpoint || checkpoint.version !== WARDROBE_VISUAL_AUTHORITY_VERSION
    || checkpoint.policyVersion !== WARDROBE_VISUAL_AUTHORITY_POLICY_VERSION
    || checkpoint.planDigest !== plan?.validation?.artifactDigest) return new Map();
  return checkpointWardrobeAuthorityAssets(checkpoint);
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

export function wardrobeAuthorityPrompt(entry) {
  return `Create one private wardrobe model sheet for a personalized children's-book character.
Show exactly one complete full-body ${entry.characterName} standing in a neutral relaxed pose against a plain warm off-white studio background.
The face and body identity must match the supplied IDENTITY ONLY reference.
The rendering family, artistic medium, proportions and surface treatment must match the PRIMARY APPROVED STYLE ANCHOR.
EXACT ACTIVE OUTFIT (${entry.stateId}): ${entry.description}
Show the complete clothing clearly from head to footwear. Do not show another outfit, spare clothing, props, scenery, text, labels, logos, inset views, duplicate people or a before/after comparison.`;
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
  identityReference,
  styleReference,
  client = null,
}) {
  const [candidate, identity, style] = await Promise.all([
    fs.readFile(imagePath),
    referenceSource(identityReference),
    referenceSource(styleReference),
  ]);
  if (!candidate || !identity || !style) {
    return { approved: false, issueCodes: ["wardrobe_authority_reference_missing"] };
  }
  const compact = async (source, detail = 840) => sharp(source).rotate().resize(detail, detail, {
    fit: "inside",
    withoutEnlargement: true,
  }).jpeg({ quality: 86 }).toBuffer();
  const [candidateJpeg, identityJpeg, styleJpeg] = await Promise.all([
    compact(candidate, 1024), compact(identity), compact(style),
  ]);
  const qaClient = client || createOpenAIClient({ kind: "qa" });
  const response = await qaClient.responses.create({
    model: process.env.IMAGE_QA_MODEL || process.env.VISION_MODEL || "gpt-4.1-mini",
    input: [{ role: "user", content: [
      { type: "input_text", text: `You validate one private wardrobe model sheet before any book page may use it.
Image 1 is the candidate. Image 2 is the exact identity. Image 3 is the approved book style anchor.
Approve only if Image 1 shows exactly one complete person, preserves the identity from Image 2, wears exactly this outfit state, and uses the same broad rendering family as Image 3.
OUTFIT STATE: ${entry.stateId}
OUTFIT DESCRIPTION: ${entry.description}
Return only JSON: {"identity":"pass|fail|uncertain","cardinality":"pass|fail|uncertain","wardrobe":"pass|fail|uncertain","style":"pass|fail|uncertain"}.` },
      { type: "input_image", image_url: `data:image/jpeg;base64,${candidateJpeg.toString("base64")}`, detail: "high" },
      { type: "input_image", image_url: `data:image/jpeg;base64,${identityJpeg.toString("base64")}`, detail: "high" },
      { type: "input_image", image_url: `data:image/jpeg;base64,${styleJpeg.toString("base64")}`, detail: "low" },
    ] }],
    max_output_tokens: 220,
  });
  const result = parseJson(extractText(response)) || {};
  const blockingDomains = ["identity", "cardinality", "wardrobe"];
  const issueCodes = blockingDomains.filter((domain) => result[domain] !== "pass")
    .map((domain) => `wardrobe_authority_${domain}_${result[domain] === "fail" ? "failed" : "uncertain"}`);
  // This private sheet is an identity-and-garment authority, not a customer
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
      label: `${character.name}: LOCKED WARDROBE AUTHORITY for ${character.outfit.state_id}; copy this exact garment design, colors, material and footwear for this person in the current scene`,
      authorityId: authority.authorityId,
      characterId: text(character.character_id),
      outfitStateId: text(character.outfit.state_id),
    }];
  });
}

export function wardrobeVisualReferencesFromCheckpoint(sceneRenderContract, checkpoint = null) {
  return wardrobeVisualReferencesForScene(
    sceneRenderContract,
    checkpointWardrobeAuthorityAssets(checkpoint),
  );
}
