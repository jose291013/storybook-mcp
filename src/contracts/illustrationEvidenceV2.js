import { canonicalDigest } from "./narrativeV3Canonical.js";
import { loadImageCandidateSet } from "./illustrationEvidenceV1.js";
import { loadVisualStoryboard } from "./visualStoryboardV1.js";
import { assertNarrativeV3Schema, NarrativeV3ContractError } from "./narrativeV3SchemaRegistry.js";

export const ILLUSTRATION_EVALUATION_WIRE_V2_ID = "calitiki.illustration-evaluation-wire.v2";
export const ILLUSTRATION_DECISION_SET_V2_ID = "calitiki.illustration-decision-set.v2";
export const ILLUSTRATION_DECISION_SET_V2_VERSION = 2;
export const ILLUSTRATION_DECISION_V2_PARSER_VERSION = 2;

export const STRICT_ILLUSTRATION_DOMAINS = Object.freeze([
  ["asset_integrity", "assetIntegrity"],
  ["identity_cardinality", "identityCardinality"],
  ["forbidden_cast", "forbiddenCast"],
  ["wardrobe", "wardrobe"],
  ["equipment", "equipment"],
  ["physical_medium", "physicalMedium"],
  ["location_boundary", "locationBoundary"],
  ["main_action", "mainAction"],
  ["object_cardinality", "objectCardinality"],
  ["landmarks", "landmarks"],
  ["style_continuity", "styleContinuity"],
]);

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(freeze);
  return value;
}

function fail(code, path, message) {
  throw new NarrativeV3ContractError({ code, artifactType: "illustration_decision_set_v2", issues: [{ path, message }] });
}

function rootDigest(value) {
  const copy = structuredClone(value);
  delete copy.validation.artifactDigest;
  return canonicalDigest(copy);
}

function itemDigest(value) {
  const copy = structuredClone(value);
  delete copy.decisionDigest;
  return canonicalDigest(copy);
}

export function illustrationDecisionSetV2Digest(value) {
  return rootDigest(value);
}

export function illustrationDecisionV2Digest(value) {
  return itemDigest(value);
}

function normalizeDomains(raw, path) {
  const result = {};
  for (const [wireKey, canonicalKey] of STRICT_ILLUSTRATION_DOMAINS) {
    const assessment = raw?.[wireKey];
    if (!assessment) fail("strict_illustration_domain_missing", `${path}/${wireKey}`, "Every objective illustration domain needs explicit evidence.");
    if (assessment.status === "pass" && assessment.evidence_code !== "verified") {
      fail("strict_illustration_pass_unverified", `${path}/${wireKey}`, "A passing domain must carry verified evidence.");
    }
    if (assessment.status === "uncertain" && assessment.evidence_code !== "insufficient_evidence") {
      fail("strict_illustration_uncertainty_invalid", `${path}/${wireKey}`, "Uncertainty must be represented only as insufficient evidence.");
    }
    if (assessment.status === "fail" && ["verified", "insufficient_evidence"].includes(assessment.evidence_code)) {
      fail("strict_illustration_failure_unproven", `${path}/${wireKey}`, "A failing domain needs a confirmed objective defect code.");
    }
    result[canonicalKey] = { status: assessment.status, evidenceCode: assessment.evidence_code };
  }
  return result;
}

function outcomeFor(domains) {
  const statuses = Object.values(domains).map((entry) => entry.status);
  if (statuses.includes("fail")) return "rejected";
  if (statuses.includes("uncertain")) return "quarantined";
  return "accepted";
}

function assertDecisionSet(value) {
  const counts = {
    accepted: value.validation.acceptedCount,
    rejected: value.validation.rejectedCount,
    quarantined: value.validation.quarantinedCount,
  };
  if (Object.values(counts).reduce((sum, count) => sum + count, 0) !== value.decisions.length) {
    fail("strict_illustration_decision_count_mismatch", "/validation", "Strict decision counters must cover every scene exactly once.");
  }
  value.decisions.forEach((decision, index) => {
    const expected = outcomeFor(decision.domains);
    if (decision.sceneNumber !== index + 1) fail("strict_illustration_decision_order_invalid", `/decisions/${index}`, "Strict decisions must remain in exact storyboard order.");
    if (decision.outcome !== expected) fail("strict_illustration_outcome_invalid", `/decisions/${index}/outcome`, "Only eleven passing domains may accept a candidate.");
    if ((decision.outcome === "accepted") !== Boolean(decision.acceptedAsset)) fail("strict_illustration_asset_invalid", `/decisions/${index}/acceptedAsset`, "Rejected or uncertain candidates cannot expose a delivery asset.");
    if (decision.decisionDigest !== illustrationDecisionV2Digest(decision)) fail("strict_illustration_decision_digest_mismatch", `/decisions/${index}/decisionDigest`, "The strict decision digest is stale.");
  });
}

export function parseStrictIllustrationEvaluationWire({ storyboard: rawStoryboard, candidateSet: rawCandidateSet, wire: rawWire, revision = 1 } = {}) {
  const storyboard = loadVisualStoryboard(rawStoryboard);
  const candidateSet = loadImageCandidateSet(rawCandidateSet);
  assertNarrativeV3Schema("illustration_evaluation_wire_v2", rawWire);
  if (candidateSet.sourceStoryboard.artifactDigest !== storyboard.validation.artifactDigest
    || rawWire.source_storyboard_digest !== storyboard.validation.artifactDigest
    || rawWire.source_candidate_set_digest !== candidateSet.validation.artifactDigest) {
    fail("strict_illustration_source_mismatch", "/sources", "The strict evaluation does not belong to this exact storyboard and candidate set.");
  }
  if (!Number.isSafeInteger(Number(revision)) || Number(revision) < 1) fail("strict_illustration_revision_invalid", "/revision", "A positive strict evidence revision is required.");
  const returned = new Map();
  rawWire.decisions.forEach((entry, index) => {
    if (returned.has(entry.scene_number)) fail("strict_illustration_evaluation_duplicate", `/decisions/${index}`, "A scene may be evaluated only once.");
    returned.set(entry.scene_number, entry);
  });
  if (returned.size !== storyboard.beats.length) fail("strict_illustration_evaluation_count_mismatch", "/decisions", "Every storyboard beat must receive all strict evidence domains.");
  const decisions = storyboard.beats.map((beat, index) => {
    const evaluation = returned.get(beat.sceneNumber);
    const candidate = candidateSet.candidates[index];
    if (!evaluation || evaluation.candidate_digest !== candidate.candidateDigest || candidate.beatDigest !== beat.beatDigest) {
      fail("strict_illustration_candidate_mismatch", `/decisions/${index}`, "The strict evidence does not identify this exact candidate and beat.");
    }
    const domains = normalizeDomains(evaluation.domains, `/decisions/${index}/domains`);
    const outcome = outcomeFor(domains);
    const decision = {
      sceneNumber: beat.sceneNumber,
      beatDigest: beat.beatDigest,
      candidateDigest: candidate.candidateDigest,
      outcome,
      domains,
      acceptedAsset: outcome === "accepted" ? structuredClone(candidate.asset) : null,
      decisionDigest: "",
    };
    decision.decisionDigest = illustrationDecisionV2Digest(decision);
    return decision;
  });
  const value = {
    schemaVersion: ILLUSTRATION_DECISION_SET_V2_VERSION,
    contractId: ILLUSTRATION_DECISION_SET_V2_ID,
    revision: Number(revision),
    sources: {
      visualStoryboard: { contractId: storyboard.contractId, schemaVersion: storyboard.schemaVersion, artifactDigest: storyboard.validation.artifactDigest },
      imageCandidateSet: { contractId: candidateSet.contractId, schemaVersion: candidateSet.schemaVersion, artifactDigest: candidateSet.validation.artifactDigest },
    },
    decisions,
    validation: {
      parserVersion: ILLUSTRATION_DECISION_V2_PARSER_VERSION,
      acceptedCount: decisions.filter((entry) => entry.outcome === "accepted").length,
      rejectedCount: decisions.filter((entry) => entry.outcome === "rejected").length,
      quarantinedCount: decisions.filter((entry) => entry.outcome === "quarantined").length,
      artifactDigest: "",
    },
  };
  value.validation.artifactDigest = illustrationDecisionSetV2Digest(value);
  assertNarrativeV3Schema("illustration_decision_set_v2", value);
  assertDecisionSet(value);
  return freeze(structuredClone(value));
}

export function loadIllustrationDecisionSetV2(value) {
  assertNarrativeV3Schema("illustration_decision_set_v2", value);
  assertDecisionSet(value);
  if (value.validation.artifactDigest !== illustrationDecisionSetV2Digest(value)) fail("strict_illustration_set_digest_mismatch", "/validation/artifactDigest", "The digest does not belong to this exact strict decision set.");
  return freeze(structuredClone(value));
}
