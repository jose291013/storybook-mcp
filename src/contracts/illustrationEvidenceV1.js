import { canonicalDigest } from "./narrativeV3Canonical.js";
import { assertNarrativeV3Schema, NarrativeV3ContractError } from "./narrativeV3SchemaRegistry.js";
import { loadVisualStoryboard } from "./visualStoryboardV1.js";
import { loadVisualContinuityPlan } from "./visualContinuityPlanV1.js";

export const IMAGE_CANDIDATE_SET_VERSION = 1;
export const IMAGE_CANDIDATE_SET_ID = "calitiki.image-candidate-set.v1";
export const IMAGE_CANDIDATE_RECORDER_VERSION = 1;
export const ILLUSTRATION_EVALUATION_WIRE_ID = "calitiki.illustration-evaluation-wire.v1";
export const ILLUSTRATION_DECISION_SET_VERSION = 1;
export const ILLUSTRATION_DECISION_SET_ID = "calitiki.illustration-decision-set.v1";
export const ILLUSTRATION_DECISION_PARSER_VERSION = 1;

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(freeze);
  return value;
}

function fail(code, artifactType, path, message) {
  throw new NarrativeV3ContractError({ code, artifactType, issues: [{ path, message }] });
}

function rootDigest(value) {
  const copy = structuredClone(value);
  delete copy.validation.artifactDigest;
  return canonicalDigest(copy);
}

function itemDigest(value, field) {
  const copy = structuredClone(value);
  delete copy[field];
  return canonicalDigest(copy);
}

export function imageCandidateSetDigest(value) {
  return rootDigest(value);
}

export function imageCandidateDigest(value) {
  return itemDigest(value, "candidateDigest");
}

export function illustrationDecisionSetDigest(value) {
  return rootDigest(value);
}

export function illustrationDecisionDigest(value) {
  return itemDigest(value, "decisionDigest");
}

function assertCandidateSet(candidateSet) {
  const keys = ["providerResponseId", "candidateDigest"].map((field) => candidateSet.candidates.map((entry) => entry[field]));
  keys.push(candidateSet.candidates.map((entry) => entry.asset.storageKey));
  keys.push(candidateSet.candidates.map((entry) => entry.asset.sha256));
  if (keys.some((entries) => new Set(entries).size !== entries.length)) {
    fail("image_candidate_duplicate", "image_candidate_set_v1", "/candidates", "Each scene needs one distinct provider response and private image asset.");
  }
  candidateSet.candidates.forEach((candidate, index) => {
    if (candidate.sceneNumber !== index + 1) fail("image_candidate_order_invalid", "image_candidate_set_v1", `/candidates/${index}`, "Candidates must remain in exact storyboard order.");
    if (candidate.candidateDigest !== imageCandidateDigest(candidate)) fail("image_candidate_digest_mismatch", "image_candidate_set_v1", `/candidates/${index}/candidateDigest`, "The candidate digest is stale.");
  });
}

export function recordImageCandidateSet({
  storyboard: rawStoryboard,
  continuityPlan: rawContinuityPlan,
  candidates: rawCandidates,
  revision = 1,
} = {}) {
  const storyboard = loadVisualStoryboard(rawStoryboard);
  const continuityPlan = loadVisualContinuityPlan(rawContinuityPlan);
  if (continuityPlan.sources.visualStoryboard.artifactDigest !== storyboard.validation.artifactDigest) {
    fail("image_candidate_continuity_mismatch", "image_candidate_set_v1", "/sourceStoryboard", "Image candidates must be generated from the exact continuity plan for this storyboard.");
  }
  if (!Number.isSafeInteger(Number(revision)) || Number(revision) < 1) fail("image_candidate_revision_invalid", "image_candidate_set_v1", "/revision", "A positive candidate-set revision is required.");
  if (!Array.isArray(rawCandidates) || rawCandidates.length !== storyboard.beats.length) {
    fail("image_candidate_count_mismatch", "image_candidate_set_v1", "/candidates", "Every storyboard beat needs exactly one generated candidate.");
  }
  const candidates = storyboard.beats.map((beat, index) => {
    const source = rawCandidates[index] || {};
    if (Number(source.sceneNumber) !== beat.sceneNumber || source.beatDigest !== beat.beatDigest) {
      fail("image_candidate_beat_mismatch", "image_candidate_set_v1", `/candidates/${index}`, "The image candidate does not belong to this exact storyboard beat.");
    }
    const candidate = {
      sceneNumber: beat.sceneNumber,
      beatDigest: beat.beatDigest,
      attempt: Number(source.attempt),
      providerModel: String(source.providerModel || ""),
      providerResponseId: String(source.providerResponseId || ""),
      asset: structuredClone(source.asset),
      candidateDigest: "",
    };
    candidate.candidateDigest = imageCandidateDigest(candidate);
    return candidate;
  });
  const value = {
    schemaVersion: IMAGE_CANDIDATE_SET_VERSION,
    contractId: IMAGE_CANDIDATE_SET_ID,
    revision: Number(revision),
    sourceStoryboard: { contractId: storyboard.contractId, schemaVersion: storyboard.schemaVersion, artifactDigest: storyboard.validation.artifactDigest },
    candidates,
    validation: { recorderVersion: IMAGE_CANDIDATE_RECORDER_VERSION, artifactDigest: "" },
  };
  value.validation.artifactDigest = imageCandidateSetDigest(value);
  assertNarrativeV3Schema("image_candidate_set_v1", value);
  assertCandidateSet(value);
  return freeze(structuredClone(value));
}

export function loadImageCandidateSet(value) {
  assertNarrativeV3Schema("image_candidate_set_v1", value);
  assertCandidateSet(value);
  if (value.validation.artifactDigest !== imageCandidateSetDigest(value)) fail("image_candidate_set_digest_mismatch", "image_candidate_set_v1", "/validation/artifactDigest", "The digest does not belong to this exact candidate set.");
  return freeze(structuredClone(value));
}

function assertDecisionSet(value) {
  if (value.validation.acceptedCount + value.validation.rejectedCount !== value.decisions.length) {
    fail("illustration_decision_count_mismatch", "illustration_decision_set_v1", "/validation", "Decision counters must cover every scene.");
  }
  value.decisions.forEach((decision, index) => {
    const confirmed = decision.evidence.some((entry) => entry.certainty === "confirmed");
    if (decision.sceneNumber !== index + 1) fail("illustration_decision_order_invalid", "illustration_decision_set_v1", `/decisions/${index}`, "Decisions must remain in exact storyboard order.");
    if ((confirmed && decision.outcome !== "rejected") || (!confirmed && decision.outcome !== "accepted")) {
      fail("illustration_decision_outcome_invalid", "illustration_decision_set_v1", `/decisions/${index}/outcome`, "Only confirmed objective evidence may reject an image.");
    }
    if ((decision.outcome === "accepted") !== Boolean(decision.acceptedAsset)) {
      fail("illustration_decision_asset_invalid", "illustration_decision_set_v1", `/decisions/${index}/acceptedAsset`, "Only an accepted decision may expose its exact private asset.");
    }
    if (decision.decisionDigest !== illustrationDecisionDigest(decision)) fail("illustration_decision_digest_mismatch", "illustration_decision_set_v1", `/decisions/${index}/decisionDigest`, "The decision digest is stale.");
  });
}

export function parseIllustrationEvaluationWire({ storyboard: rawStoryboard, candidateSet: rawCandidateSet, wire: rawWire, revision = 1 } = {}) {
  const storyboard = loadVisualStoryboard(rawStoryboard);
  const candidateSet = loadImageCandidateSet(rawCandidateSet);
  assertNarrativeV3Schema("illustration_evaluation_wire_v1", rawWire);
  if (candidateSet.sourceStoryboard.artifactDigest !== storyboard.validation.artifactDigest
    || rawWire.source_storyboard_digest !== storyboard.validation.artifactDigest
    || rawWire.source_candidate_set_digest !== candidateSet.validation.artifactDigest) {
    fail("illustration_evaluation_source_mismatch", "illustration_decision_set_v1", "/sources", "The evaluation does not belong to this exact storyboard and candidate set.");
  }
  if (!Number.isSafeInteger(Number(revision)) || Number(revision) < 1) fail("illustration_decision_revision_invalid", "illustration_decision_set_v1", "/revision", "A positive decision-set revision is required.");
  const returned = new Map();
  rawWire.decisions.forEach((entry, index) => {
    if (returned.has(entry.scene_number)) fail("illustration_evaluation_duplicate", "illustration_decision_set_v1", `/decisions/${index}`, "A scene may be evaluated only once.");
    returned.set(entry.scene_number, entry);
  });
  if (returned.size !== storyboard.beats.length) fail("illustration_evaluation_count_mismatch", "illustration_decision_set_v1", "/decisions", "Every storyboard beat must be evaluated exactly once.");
  const decisions = storyboard.beats.map((beat, index) => {
    const evaluation = returned.get(beat.sceneNumber);
    const candidate = candidateSet.candidates[index];
    if (!evaluation || evaluation.candidate_digest !== candidate.candidateDigest || candidate.beatDigest !== beat.beatDigest) {
      fail("illustration_evaluation_candidate_mismatch", "illustration_decision_set_v1", `/decisions/${index}`, "The evaluation does not identify the exact candidate for this beat.");
    }
    const evidence = structuredClone(evaluation.issues);
    const outcome = evidence.some((entry) => entry.certainty === "confirmed") ? "rejected" : "accepted";
    const decision = {
      sceneNumber: beat.sceneNumber,
      beatDigest: beat.beatDigest,
      candidateDigest: candidate.candidateDigest,
      outcome,
      evidence,
      acceptedAsset: outcome === "accepted" ? structuredClone(candidate.asset) : null,
      decisionDigest: "",
    };
    decision.decisionDigest = illustrationDecisionDigest(decision);
    return decision;
  });
  const acceptedCount = decisions.filter((entry) => entry.outcome === "accepted").length;
  const value = {
    schemaVersion: ILLUSTRATION_DECISION_SET_VERSION,
    contractId: ILLUSTRATION_DECISION_SET_ID,
    revision: Number(revision),
    sources: {
      visualStoryboard: { contractId: storyboard.contractId, schemaVersion: storyboard.schemaVersion, artifactDigest: storyboard.validation.artifactDigest },
      imageCandidateSet: { contractId: candidateSet.contractId, schemaVersion: candidateSet.schemaVersion, artifactDigest: candidateSet.validation.artifactDigest },
    },
    decisions,
    validation: { parserVersion: ILLUSTRATION_DECISION_PARSER_VERSION, acceptedCount, rejectedCount: decisions.length - acceptedCount, artifactDigest: "" },
  };
  value.validation.artifactDigest = illustrationDecisionSetDigest(value);
  assertNarrativeV3Schema("illustration_decision_set_v1", value);
  assertDecisionSet(value);
  return freeze(structuredClone(value));
}

export function loadIllustrationDecisionSet(value) {
  assertNarrativeV3Schema("illustration_decision_set_v1", value);
  assertDecisionSet(value);
  if (value.validation.artifactDigest !== illustrationDecisionSetDigest(value)) fail("illustration_decision_set_digest_mismatch", "illustration_decision_set_v1", "/validation/artifactDigest", "The digest does not belong to this exact decision set.");
  return freeze(structuredClone(value));
}
