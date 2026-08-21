import { parseManuscriptWire } from "../contracts/manuscriptV1.js";
import { compileManuscriptFactEvidence } from "../contracts/manuscriptFactEvidenceV1.js";
import { compileVisualStoryboard } from "../contracts/visualStoryboardV1.js";
import { compileVisualContinuityPlan } from "../contracts/visualContinuityPlanV1.js";
import { recordImageCandidateSet } from "../contracts/illustrationEvidenceV1.js";
import { parseStrictIllustrationEvaluationWire } from "../contracts/illustrationEvidenceV2.js";
import { compileDeliveryManifestV2 } from "../contracts/deliveryManifestV2.js";
import { canonicalDigest } from "../contracts/narrativeV3Canonical.js";
import { narrativeV3ArtifactStore } from "./narrativeV3ArtifactStore.js";
import { generationRunStore } from "./generationRunStore.js";

export const NARRATIVE_V3_PRODUCTION_RENDERING_AUTHORITY_VERSION = 2;
export const NARRATIVE_V3_PRODUCTION_TEXT_AUTHORITY_VERSION = 1;

const TEXT_AUTHORITY_ARTIFACT_TYPES = Object.freeze([
  "manuscript", "manuscript_fact_evidence", "visual_storyboard", "visual_continuity_plan",
]);

function artifactRef(artifact) {
  return { artifactId: artifact.id, artifactType: artifact.artifactType, payloadDigest: artifact.payloadDigest };
}

function sameParents(artifact, parents) {
  return canonicalDigest(artifact?.parents || []) === canonicalDigest(parents || []);
}

function recoverableDerivedArtifactError(error) {
  const code = String(error?.code || "");
  return ["narrative_v3_contract_invalid", "stored_artifact_invalid"].includes(code)
    || code.startsWith("artifact_parent_");
}

async function persistArtifact({
  projectId, artifactType, payload, parents, artifactStore, runId, replaceInvalidCurrent = false,
}) {
  const pointer = await artifactStore.getCurrentPointer(projectId, artifactType);
  if (pointer) {
    try {
      const current = await artifactStore.getArtifact(pointer.artifactId);
      if (current?.payloadDigest === payload.validation.artifactDigest && sameParents(current, parents)) return current;
    } catch (error) {
      if (!replaceInvalidCurrent || !recoverableDerivedArtifactError(error)) throw error;
      console.warn("[narrative-v3] superseding invalid derived artifact", JSON.stringify({
        projectId,
        artifactType,
        artifactId: pointer.artifactId,
        errorCode: String(error?.code || "narrative_v3_contract_invalid"),
        issueCount: Array.isArray(error?.issues) ? error.issues.length : 0,
      }));
    }
  }
  const created = await artifactStore.createArtifact({
    projectId,
    artifactType,
    payload,
    parents,
    provenance: {
      producer: "narrative_v3_production_rendering_authority",
      producerVersion: `v${NARRATIVE_V3_PRODUCTION_RENDERING_AUTHORITY_VERSION}`,
      runId,
      operationId: `seal-${artifactType}`,
    },
  });
  const promoted = await artifactStore.promoteArtifact({
    projectId,
    artifactType,
    artifactId: created.artifact.id,
    expectedPointerRevision: Number(pointer?.pointerRevision || 0),
  });
  if (promoted.promoted) return created.artifact;
  const winnerPointer = await artifactStore.getCurrentPointer(projectId, artifactType);
  const winner = winnerPointer ? await artifactStore.getArtifact(winnerPointer.artifactId) : null;
  if (winner?.payloadDigest === payload.validation.artifactDigest && sameParents(winner, parents)) return winner;
  const error = new Error(`Narrative V3 ${artifactType} pointer changed during production sealing.`);
  error.code = "narrative_v3_production_pointer_conflict";
  error.artifactType = artifactType;
  throw error;
}

function normalizedPageTexts(pageTexts, draftPages) {
  const values = new Map();
  if (pageTexts instanceof Map) {
    for (const [pageNumber, text] of pageTexts) values.set(Number(pageNumber), String(text || "").trim());
  } else if (pageTexts && typeof pageTexts === "object") {
    for (const [pageNumber, text] of Object.entries(pageTexts)) values.set(Number(pageNumber), String(text || "").trim());
  }
  for (const page of Array.isArray(draftPages) ? draftPages : []) {
    if (page.page_type !== "image") values.set(Number(page.page_number), String(page.text || "").trim());
  }
  return values;
}

function manuscriptWire(spec, { pageTexts, draftPages } = {}) {
  const textByNumber = normalizedPageTexts(pageTexts, draftPages);
  return {
    schema_version: 1,
    contract_id: "calitiki.manuscript-wire.v1",
    source_spec_digest: spec.validation.artifactDigest,
    language: spec.book.language,
    pages: spec.pages
      .filter((page) => ["opening_text", "scene_text", "closing_text"].includes(page.kind))
      .map((page) => ({ page_number: page.pageNumber, text: textByNumber.get(page.pageNumber) || "" })),
  };
}

async function currentSpecArtifact({ projectId, spec, artifactStore }) {
  const pointer = await artifactStore.getCurrentPointer(projectId, "narrative_book_spec_v3");
  const artifact = pointer ? await artifactStore.getArtifact(pointer.artifactId) : null;
  if (!artifact || artifact.payloadDigest !== spec?.validation?.artifactDigest) {
    const error = new Error("The production preview does not descend from the current immutable Narrative V3 specification.");
    error.code = "narrative_v3_production_spec_mismatch";
    error.artifactType = "narrative_book_spec_v3";
    throw error;
  }
  return artifact;
}

export async function prepareNarrativeV3ProductionTextAuthority({
  projectId, runId, spec, pageTexts, draftPages, artifactStore = narrativeV3ArtifactStore,
} = {}) {
  const specArtifact = await currentSpecArtifact({ projectId, spec, artifactStore });
  const manuscript = parseManuscriptWire({ spec, wire: manuscriptWire(spec, { pageTexts, draftPages }) });
  const manuscriptArtifact = await persistArtifact({
    projectId, artifactType: "manuscript", payload: manuscript,
    parents: [artifactRef(specArtifact)], artifactStore, runId, replaceInvalidCurrent: true,
  });
  const factEvidence = compileManuscriptFactEvidence({ spec, manuscript });
  const factArtifact = await persistArtifact({
    projectId, artifactType: "manuscript_fact_evidence", payload: factEvidence,
    parents: [artifactRef(specArtifact), artifactRef(manuscriptArtifact)], artifactStore, runId,
    replaceInvalidCurrent: true,
  });
  const storyboard = compileVisualStoryboard({ spec, manuscript, factEvidence });
  const storyboardArtifact = await persistArtifact({
    projectId, artifactType: "visual_storyboard", payload: storyboard,
    parents: [artifactRef(specArtifact), artifactRef(manuscriptArtifact), artifactRef(factArtifact)],
    artifactStore, runId, replaceInvalidCurrent: true,
  });
  const continuityPlan = compileVisualContinuityPlan({ spec, storyboard });
  const continuityArtifact = await persistArtifact({
    projectId, artifactType: "visual_continuity_plan", payload: continuityPlan,
    parents: [artifactRef(specArtifact), artifactRef(storyboardArtifact)], artifactStore, runId,
    replaceInvalidCurrent: true,
  });
  return Object.freeze({
    version: NARRATIVE_V3_PRODUCTION_TEXT_AUTHORITY_VERSION,
    status: "prepared",
    sourceSpecDigest: spec.validation.artifactDigest,
    manuscript,
    factEvidence,
    storyboard,
    continuityPlan,
    artifacts: Object.freeze({
      manuscript: manuscriptArtifact,
      factEvidence: factArtifact,
      storyboard: storyboardArtifact,
      continuityPlan: continuityArtifact,
    }),
    artifactDigest: continuityPlan.validation.artifactDigest,
  });
}

async function assertPreparedTextAuthority({ projectId, spec, textAuthority, artifactStore }) {
  if (textAuthority?.status !== "prepared"
    || Number(textAuthority?.version || 0) !== NARRATIVE_V3_PRODUCTION_TEXT_AUTHORITY_VERSION
    || textAuthority?.sourceSpecDigest !== spec?.validation?.artifactDigest) {
    const error = new Error("Strict Narrative V3 text authority must be prepared before illustration generation.");
    error.code = "narrative_v3_text_authority_required";
    error.artifactType = "manuscript";
    throw error;
  }
  for (const artifactType of TEXT_AUTHORITY_ARTIFACT_TYPES) {
    const key = artifactType === "manuscript_fact_evidence" ? "factEvidence"
      : artifactType === "visual_storyboard" ? "storyboard"
        : artifactType === "visual_continuity_plan" ? "continuityPlan" : "manuscript";
    const expected = textAuthority.artifacts?.[key];
    const pointer = await artifactStore.getCurrentPointer(projectId, artifactType);
    if (!expected || pointer?.artifactId !== expected.id || pointer?.artifactDigest !== expected.payloadDigest) {
      const error = new Error(`Strict Narrative V3 text authority changed before visual delivery (${artifactType}).`);
      error.code = "narrative_v3_text_authority_changed";
      error.artifactType = artifactType;
      throw error;
    }
  }
}

async function acceptedCandidatesByPage({ projectId, draftPages, runStore }) {
  const expectedStorageKeys = new Map((Array.isArray(draftPages) ? draftPages : [])
    .filter((page) => page.page_type === "image" && page.imageStorageKey)
    .map((page) => [Number(page.page_number), String(page.imageStorageKey)]));
  const selected = new Map();
  const candidates = typeof runStore.listCandidatesForProject === "function"
    ? await runStore.listCandidatesForProject(projectId) : [];
  for (const candidate of candidates) {
    const pageNumber = Number(candidate.pageNumber);
    if (candidate.status !== "accepted"
      || candidate.metadata?.strictEvidence?.approved !== true
      || !expectedStorageKeys.has(pageNumber)
      || candidate.storageKey !== expectedStorageKeys.get(pageNumber)) continue;
    selected.set(pageNumber, candidate);
  }
  return selected;
}

function candidateInput({ storyboard, acceptedByPage }) {
  return storyboard.beats.map((beat) => {
    const candidate = acceptedByPage.get(beat.imagePageNumber);
    const asset = candidate?.metadata?.asset || {};
    if (!candidate || !candidate.storageKey || !candidate.metadata?.strictEvidence?.domains) {
      const error = new Error(`Strict V3 evidence is missing for the retained image on page ${beat.imagePageNumber}.`);
      error.code = "narrative_v3_production_evidence_missing";
      error.artifactType = "image_candidate_set";
      error.pageNumber = beat.imagePageNumber;
      throw error;
    }
    return {
      sceneNumber: beat.sceneNumber,
      beatDigest: beat.beatDigest,
      attempt: Math.max(1, Math.min(3, Number(candidate.candidateNumber || 1))),
      providerModel: String(candidate.metadata?.providerModel || "gpt-image-2"),
      providerResponseId: String(candidate.id),
      asset: {
        storageKey: candidate.storageKey,
        sha256: String(asset.sha256 || ""),
        mimeType: String(asset.mimeType || ""),
        width: Number(asset.width || 0),
        height: Number(asset.height || 0),
        byteLength: Number(asset.byteLength || 0),
      },
      strictDomains: structuredClone(candidate.metadata.strictEvidence.domains),
    };
  });
}

export async function sealNarrativeV3ProductionPreview({
  projectId, runId, spec, draftPages, textAuthority,
  artifactStore = narrativeV3ArtifactStore, runStore = generationRunStore,
} = {}) {
  const specArtifact = await currentSpecArtifact({ projectId, spec, artifactStore });
  await assertPreparedTextAuthority({ projectId, spec, textAuthority, artifactStore });
  const { manuscript, factEvidence, storyboard, continuityPlan, artifacts } = textAuthority;
  const manuscriptArtifact = artifacts.manuscript;
  const factArtifact = artifacts.factEvidence;
  const storyboardArtifact = artifacts.storyboard;
  const continuityArtifact = artifacts.continuityPlan;
  const rawCandidates = candidateInput({
    storyboard,
    acceptedByPage: await acceptedCandidatesByPage({ projectId, draftPages, runStore }),
  });
  const candidateSet = recordImageCandidateSet({
    storyboard, continuityPlan,
    candidates: rawCandidates.map(({ strictDomains, ...candidate }) => candidate),
  });
  const candidateArtifact = await persistArtifact({
    projectId, artifactType: "image_candidate_set", payload: candidateSet,
    parents: [artifactRef(storyboardArtifact), artifactRef(continuityArtifact)], artifactStore, runId,
    replaceInvalidCurrent: true,
  });
  const wire = {
    schema_version: 2,
    contract_id: "calitiki.illustration-evaluation-wire.v2",
    source_storyboard_digest: storyboard.validation.artifactDigest,
    source_candidate_set_digest: candidateSet.validation.artifactDigest,
    decisions: candidateSet.candidates.map((candidate, index) => ({
      scene_number: candidate.sceneNumber,
      candidate_digest: candidate.candidateDigest,
      domains: rawCandidates[index].strictDomains,
    })),
  };
  const decisions = parseStrictIllustrationEvaluationWire({ storyboard, candidateSet, wire });
  const decisionArtifact = await persistArtifact({
    projectId, artifactType: "illustration_decision_set_v2", payload: decisions,
    parents: [artifactRef(storyboardArtifact), artifactRef(candidateArtifact)], artifactStore, runId,
    replaceInvalidCurrent: true,
  });
  const manifest = compileDeliveryManifestV2({ spec, manuscript, factEvidence, storyboard, decisions });
  const manifestArtifact = await persistArtifact({
    projectId, artifactType: "delivery_manifest_v2", payload: manifest,
    parents: [artifactRef(specArtifact), artifactRef(manuscriptArtifact), artifactRef(factArtifact),
      artifactRef(storyboardArtifact), artifactRef(decisionArtifact)],
    artifactStore, runId, replaceInvalidCurrent: true,
  });
  return Object.freeze({
    version: NARRATIVE_V3_PRODUCTION_RENDERING_AUTHORITY_VERSION,
    status: "sealed",
    sceneCount: storyboard.beats.length,
    artifactDigest: manifest.validation.artifactDigest,
    manifestArtifactId: manifestArtifact.id,
  });
}
