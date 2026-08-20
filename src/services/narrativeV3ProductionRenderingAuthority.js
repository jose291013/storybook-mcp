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

export const NARRATIVE_V3_PRODUCTION_RENDERING_AUTHORITY_VERSION = 1;

function artifactRef(artifact) {
  return {
    artifactId: artifact.id,
    artifactType: artifact.artifactType,
    payloadDigest: artifact.payloadDigest,
  };
}

function sameParents(artifact, parents) {
  return canonicalDigest(artifact?.parents || []) === canonicalDigest(parents || []);
}

async function persistArtifact({ projectId, artifactType, payload, parents, artifactStore, runId }) {
  const pointer = await artifactStore.getCurrentPointer(projectId, artifactType);
  if (pointer) {
    const current = await artifactStore.getArtifact(pointer.artifactId);
    if (current?.payloadDigest === payload.validation.artifactDigest && sameParents(current, parents)) return current;
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
  throw error;
}

function manuscriptWire(spec, draftPages) {
  const textByNumber = new Map((Array.isArray(draftPages) ? draftPages : [])
    .filter((page) => page.page_type !== "image")
    .map((page) => [Number(page.page_number), String(page.text || "").trim()]));
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

async function acceptedCandidatesByPage(runId, runStore) {
  const selected = new Map();
  const steps = await runStore.listSteps(runId);
  for (const step of steps) {
    if (!/^image:page:\d+$|^repair:page:\d+$/u.test(String(step.stepKey || ""))) continue;
    for (const candidate of await runStore.listCandidates(step.id)) {
      if (candidate.status !== "accepted" || candidate.metadata?.strictEvidence?.approved !== true) continue;
      selected.set(Number(candidate.pageNumber), candidate);
    }
  }
  return selected;
}

function candidateInput({ storyboard, acceptedByPage }) {
  return storyboard.beats.map((beat) => {
    const candidate = acceptedByPage.get(beat.imagePageNumber);
    const asset = candidate?.metadata?.asset || {};
    if (!candidate || !candidate.storageKey || !candidate.metadata?.strictEvidence?.domains) {
      const error = new Error(`Strict V3 evidence is missing for image page ${beat.imagePageNumber}.`);
      error.code = "narrative_v3_production_evidence_missing";
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
  projectId,
  runId,
  spec,
  draftPages,
  artifactStore = narrativeV3ArtifactStore,
  runStore = generationRunStore,
} = {}) {
  const specPointer = await artifactStore.getCurrentPointer(projectId, "narrative_book_spec_v3");
  const specArtifact = specPointer ? await artifactStore.getArtifact(specPointer.artifactId) : null;
  if (!specArtifact || specArtifact.payloadDigest !== spec?.validation?.artifactDigest) {
    const error = new Error("The production preview does not descend from the current immutable Narrative V3 specification.");
    error.code = "narrative_v3_production_spec_mismatch";
    throw error;
  }

  const manuscript = parseManuscriptWire({ spec, wire: manuscriptWire(spec, draftPages) });
  const manuscriptArtifact = await persistArtifact({
    projectId,
    artifactType: "manuscript",
    payload: manuscript,
    parents: [artifactRef(specArtifact)],
    artifactStore,
    runId,
  });
  const factEvidence = compileManuscriptFactEvidence({ spec, manuscript });
  const factArtifact = await persistArtifact({
    projectId,
    artifactType: "manuscript_fact_evidence",
    payload: factEvidence,
    parents: [artifactRef(specArtifact), artifactRef(manuscriptArtifact)],
    artifactStore,
    runId,
  });
  const storyboard = compileVisualStoryboard({ spec, manuscript, factEvidence });
  const storyboardArtifact = await persistArtifact({
    projectId,
    artifactType: "visual_storyboard",
    payload: storyboard,
    parents: [artifactRef(specArtifact), artifactRef(manuscriptArtifact), artifactRef(factArtifact)],
    artifactStore,
    runId,
  });
  const continuityPlan = compileVisualContinuityPlan({ spec, storyboard });
  const continuityArtifact = await persistArtifact({
    projectId,
    artifactType: "visual_continuity_plan",
    payload: continuityPlan,
    parents: [artifactRef(specArtifact), artifactRef(storyboardArtifact)],
    artifactStore,
    runId,
  });
  const rawCandidates = candidateInput({
    storyboard,
    acceptedByPage: await acceptedCandidatesByPage(runId, runStore),
  });
  const candidateSet = recordImageCandidateSet({
    storyboard,
    continuityPlan,
    candidates: rawCandidates.map(({ strictDomains, ...candidate }) => candidate),
  });
  const candidateArtifact = await persistArtifact({
    projectId,
    artifactType: "image_candidate_set",
    payload: candidateSet,
    parents: [artifactRef(storyboardArtifact), artifactRef(continuityArtifact)],
    artifactStore,
    runId,
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
    projectId,
    artifactType: "illustration_decision_set_v2",
    payload: decisions,
    parents: [artifactRef(storyboardArtifact), artifactRef(candidateArtifact)],
    artifactStore,
    runId,
  });
  const manifest = compileDeliveryManifestV2({ spec, manuscript, factEvidence, storyboard, decisions });
  const manifestArtifact = await persistArtifact({
    projectId,
    artifactType: "delivery_manifest_v2",
    payload: manifest,
    parents: [
      artifactRef(specArtifact),
      artifactRef(manuscriptArtifact),
      artifactRef(factArtifact),
      artifactRef(storyboardArtifact),
      artifactRef(decisionArtifact),
    ],
    artifactStore,
    runId,
  });
  return Object.freeze({
    version: NARRATIVE_V3_PRODUCTION_RENDERING_AUTHORITY_VERSION,
    status: "sealed",
    sceneCount: storyboard.beats.length,
    artifactDigest: manifest.validation.artifactDigest,
    manifestArtifactId: manifestArtifact.id,
  });
}
