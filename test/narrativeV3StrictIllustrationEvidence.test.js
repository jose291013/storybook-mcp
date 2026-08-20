import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { getWordsTargetByAge } from "../src/config/readingGuidance.js";
import { recordImageCandidateSet } from "../src/contracts/illustrationEvidenceV1.js";
import {
  loadIllustrationDecisionSetV2,
  parseStrictIllustrationEvaluationWire,
} from "../src/contracts/illustrationEvidenceV2.js";
import { parseManuscriptWire } from "../src/contracts/manuscriptV1.js";
import { compileManuscriptFactEvidence } from "../src/contracts/manuscriptFactEvidenceV1.js";
import { compileNarrativeBookSpecV3 } from "../src/contracts/narrativeBookSpecV3.js";
import { compileObjectLifecycleProjection } from "../src/contracts/objectLifecycleProjection.js";
import { compileVisualStoryboard } from "../src/contracts/visualStoryboardV1.js";
import { compileVisualContinuityPlan } from "../src/contracts/visualContinuityPlanV1.js";
import { buildNarrativeV3ObjectFixture } from "../src/services/narrativeV3ObjectLifecycleMatrix.js";
import { JsonNarrativeV3RunStore } from "../src/services/narrativeV3StateMachine.js";

function fixture() {
  const source = buildNarrativeV3ObjectFixture({ language: "FR", universeId: "starry_space" });
  const projection = compileObjectLifecycleProjection({ graph: source.graph });
  const spec = compileNarrativeBookSpecV3({ intent: source.intent, graph: source.graph, objectProjection: projection, profileBindings: source.profileBindings });
  const manuscript = parseManuscriptWire({
    spec,
    wire: {
      schema_version: 1,
      contract_id: "calitiki.manuscript-wire.v1",
      source_spec_digest: spec.validation.artifactDigest,
      language: spec.book.language,
      pages: spec.pages.filter((page) => ["opening_text", "scene_text", "closing_text"].includes(page.kind)).map((page) => {
        const guidance = getWordsTargetByAge(spec.book.audienceAge, page.kind === "scene_text" ? "text" : page.kind);
        return { page_number: page.pageNumber, text: Array(guidance.target).fill("histoire").join(" ") };
      }),
    },
  });
  const factEvidence = compileManuscriptFactEvidence({ spec, manuscript });
  const storyboard = compileVisualStoryboard({ spec, manuscript, factEvidence });
  const continuityPlan = compileVisualContinuityPlan({ spec, storyboard });
  const candidates = recordImageCandidateSet({
    storyboard,
    continuityPlan,
    candidates: storyboard.beats.map((beat) => ({
      sceneNumber: beat.sceneNumber,
      beatDigest: beat.beatDigest,
      attempt: 1,
      providerModel: "gpt-image-2",
      providerResponseId: `strict-image-${beat.sceneNumber}`,
      asset: {
        storageKey: `private/narrative-v3/strict/scene-${beat.sceneNumber}.webp`,
        sha256: crypto.createHash("sha256").update(`strict-image-${beat.sceneNumber}`).digest("hex"),
        mimeType: "image/webp",
        width: 2048,
        height: 2048,
        byteLength: 120000 + beat.sceneNumber,
      },
    })),
  });
  return { storyboard, candidates };
}

function passingDomains() {
  return Object.fromEntries([
    "asset_integrity", "identity_cardinality", "forbidden_cast", "wardrobe",
    "equipment", "physical_medium", "location_boundary", "main_action",
    "object_cardinality", "landmarks", "style_continuity",
  ].map((domain) => [domain, { status: "pass", evidence_code: "verified" }]));
}

function wireFor(storyboard, candidates) {
  return {
    schema_version: 2,
    contract_id: "calitiki.illustration-evaluation-wire.v2",
    source_storyboard_digest: storyboard.validation.artifactDigest,
    source_candidate_set_digest: candidates.validation.artifactDigest,
    decisions: candidates.candidates.map((candidate) => ({
      scene_number: candidate.sceneNumber,
      candidate_digest: candidate.candidateDigest,
      domains: passingDomains(),
    })),
  };
}

test("StrictIllustrationEvidence.v2 accepts an asset only after all eleven objective domains pass", () => {
  const { storyboard, candidates } = fixture();
  const decisions = parseStrictIllustrationEvaluationWire({ storyboard, candidateSet: candidates, wire: wireFor(storyboard, candidates) });
  assert.equal(decisions.validation.acceptedCount, storyboard.beats.length);
  assert.equal(decisions.validation.rejectedCount, 0);
  assert.equal(decisions.validation.quarantinedCount, 0);
  decisions.decisions.forEach((decision) => {
    assert.equal(decision.outcome, "accepted");
    assert.ok(decision.acceptedAsset);
  });
  assert.deepEqual(loadIllustrationDecisionSetV2(structuredClone(decisions)), decisions);
});

test("confirmed objective failure rejects while uncertainty quarantines and never exposes an asset", () => {
  const { storyboard, candidates } = fixture();
  const wire = wireFor(storyboard, candidates);
  wire.decisions[0].domains.identity_cardinality = { status: "fail", evidence_code: "duplicated_required_identity" };
  wire.decisions[1].domains.wardrobe = { status: "uncertain", evidence_code: "insufficient_evidence" };
  const decisions = parseStrictIllustrationEvaluationWire({ storyboard, candidateSet: candidates, wire });
  assert.equal(decisions.decisions[0].outcome, "rejected");
  assert.equal(decisions.decisions[1].outcome, "quarantined");
  assert.equal(decisions.decisions[0].acceptedAsset, null);
  assert.equal(decisions.decisions[1].acceptedAsset, null);
  assert.equal(decisions.validation.rejectedCount, 1);
  assert.equal(decisions.validation.quarantinedCount, 1);
});

test("missing domains and fail-open evidence codes are rejected at the strict boundary", () => {
  const { storyboard, candidates } = fixture();
  const missing = wireFor(storyboard, candidates);
  delete missing.decisions[0].domains.equipment;
  assert.throws(
    () => parseStrictIllustrationEvaluationWire({ storyboard, candidateSet: candidates, wire: missing }),
    (error) => error.artifactType === "illustration_evaluation_wire_v2",
  );
  const falsePass = wireFor(storyboard, candidates);
  falsePass.decisions[0].domains.wardrobe = { status: "pass", evidence_code: "insufficient_evidence" };
  assert.throws(
    () => parseStrictIllustrationEvaluationWire({ storyboard, candidateSet: candidates, wire: falsePass }),
    (error) => error.code === "strict_illustration_pass_unverified",
  );
});

test("the durable strict-decision step requires storyboard then candidate-set parents", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-v3-strict-evidence-"));
  try {
    const store = new JsonNarrativeV3RunStore(path.join(directory, "runs.json"));
    await assert.rejects(store.enqueue({
      projectId: crypto.randomUUID(),
      runKey: "invalid-strict-decision-parent",
      steps: [{
        stepKey: "decide-strict",
        stepType: "decide_illustrations_strict",
        inputs: [
          { artifactId: crypto.randomUUID(), artifactType: "image_candidate_set", artifactDigest: "a".repeat(64) },
          { artifactId: crypto.randomUUID(), artifactType: "visual_storyboard", artifactDigest: "b".repeat(64) },
        ],
      }],
    }), (error) => error.code === "invalid_step_inputs");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("migration 031 widens only isolated V3 evidence artifacts and steps", async () => {
  const migration = await fs.readFile("db/migrations/031_narrative_v3_strict_illustration_evidence.sql", "utf8");
  assert.match(migration, /'illustration_decision_set_v2'/);
  assert.match(migration, /'decide_illustrations_strict'/);
  assert.doesNotMatch(migration, /book_projects\s+ADD|UPDATE\s+book_projects/i);
});
