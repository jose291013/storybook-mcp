import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { getWordsTargetByAge } from "../src/config/readingGuidance.js";
import {
  loadIllustrationDecisionSet,
  parseIllustrationEvaluationWire,
  recordImageCandidateSet,
} from "../src/contracts/illustrationEvidenceV1.js";
import { parseManuscriptWire } from "../src/contracts/manuscriptV1.js";
import { compileNarrativeBookSpecV3 } from "../src/contracts/narrativeBookSpecV3.js";
import { compileObjectLifecycleProjection } from "../src/contracts/objectLifecycleProjection.js";
import { compileVisualStoryboard } from "../src/contracts/visualStoryboardV1.js";
import { compileVisualContinuityPlan } from "../src/contracts/visualContinuityPlanV1.js";
import { buildNarrativeV3ObjectFixture } from "../src/services/narrativeV3ObjectLifecycleMatrix.js";
import { JsonNarrativeV3RunStore } from "../src/services/narrativeV3StateMachine.js";

function fixture(raw = {}) {
  const source = buildNarrativeV3ObjectFixture({ language: "FR", universeId: "starry_space", ...raw });
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
  const storyboard = compileVisualStoryboard({ spec, manuscript });
  const continuityPlan = compileVisualContinuityPlan({ spec, storyboard });
  const candidates = recordImageCandidateSet({
    storyboard,
    continuityPlan,
    candidates: storyboard.beats.map((beat) => ({
      sceneNumber: beat.sceneNumber,
      beatDigest: beat.beatDigest,
      attempt: 1,
      providerModel: "gpt-image-2",
      providerResponseId: `image-response-${beat.sceneNumber}`,
      asset: {
        storageKey: `private/narrative-v3/test/scene-${beat.sceneNumber}.webp`,
        sha256: crypto.createHash("sha256").update(`image-${beat.sceneNumber}`).digest("hex"),
        mimeType: "image/webp",
        width: 2048,
        height: 2048,
        byteLength: 100000 + beat.sceneNumber,
      },
    })),
  });
  return { storyboard, continuityPlan, candidates };
}

function wireFor(storyboard, candidates) {
  return {
    schema_version: 1,
    contract_id: "calitiki.illustration-evaluation-wire.v1",
    source_storyboard_digest: storyboard.validation.artifactDigest,
    source_candidate_set_digest: candidates.validation.artifactDigest,
    decisions: candidates.candidates.map((candidate) => ({ scene_number: candidate.sceneNumber, candidate_digest: candidate.candidateDigest, issues: [] })),
  };
}

test("every image candidate is private, unique and bound to one exact storyboard beat", () => {
  const { storyboard, candidates } = fixture();
  assert.equal(candidates.candidates.length, storyboard.beats.length);
  candidates.candidates.forEach((candidate, index) => {
    assert.equal(candidate.beatDigest, storyboard.beats[index].beatDigest);
    assert.match(candidate.asset.storageKey, /^private\/narrative-v3\//);
    assert.doesNotMatch(candidate.asset.storageKey, /^https?:/);
  });
});

test("uncertain QA evidence stays internal and cannot reject an otherwise valid image", () => {
  const { storyboard, candidates } = fixture();
  const wire = wireFor(storyboard, candidates);
  wire.decisions[0].issues.push({ code: "missing_required_character", certainty: "uncertain" });
  const decisions = parseIllustrationEvaluationWire({ storyboard, candidateSet: candidates, wire });
  assert.equal(decisions.decisions[0].outcome, "accepted");
  assert.deepEqual(decisions.decisions[0].acceptedAsset, candidates.candidates[0].asset);
  assert.equal(decisions.validation.rejectedCount, 0);
});

test("only confirmed objective evidence rejects a candidate and withholds its asset", () => {
  const { storyboard, candidates } = fixture();
  const wire = wireFor(storyboard, candidates);
  wire.decisions[2].issues.push({ code: "duplicated_required_identity", certainty: "confirmed" });
  const decisions = parseIllustrationEvaluationWire({ storyboard, candidateSet: candidates, wire });
  assert.equal(decisions.decisions[2].outcome, "rejected");
  assert.equal(decisions.decisions[2].acceptedAsset, null);
  assert.equal(decisions.validation.rejectedCount, 1);
  assert.deepEqual(loadIllustrationDecisionSet(structuredClone(decisions)), decisions);
});

test("subjective review labels and foreign candidates fail at the evaluation boundary", () => {
  const { storyboard, candidates } = fixture();
  const subjective = wireFor(storyboard, candidates);
  subjective.decisions[0].issues.push({ code: "not_beautiful_enough", certainty: "confirmed" });
  assert.throws(() => parseIllustrationEvaluationWire({ storyboard, candidateSet: candidates, wire: subjective }), (error) => error.artifactType === "illustration_evaluation_wire_v1");
  const foreign = wireFor(storyboard, candidates);
  foreign.decisions[1].candidate_digest = "a".repeat(64);
  assert.throws(() => parseIllustrationEvaluationWire({ storyboard, candidateSet: candidates, wire: foreign }), (error) => error.code === "illustration_evaluation_candidate_mismatch");
});

test("candidate ingestion rejects exact asset reuse across scenes", () => {
  const { storyboard, continuityPlan, candidates } = fixture();
  const raw = candidates.candidates.map((candidate) => ({ ...structuredClone(candidate) }));
  raw[1].asset = structuredClone(raw[0].asset);
  assert.throws(() => recordImageCandidateSet({ storyboard, continuityPlan, candidates: raw }), (error) => error.code === "image_candidate_duplicate");
});

test("candidate ingestion refuses a continuity plan from another storyboard", () => {
  const first = fixture({ universeId: "starry_space" });
  const foreign = fixture({ universeId: "wonder_city" });
  assert.throws(
    () => recordImageCandidateSet({
      storyboard: first.storyboard,
      continuityPlan: foreign.continuityPlan,
      candidates: first.candidates.candidates,
    }),
    (error) => error.code === "image_candidate_continuity_mismatch",
  );
});

test("the decision durable step requires exact ordered storyboard and candidate parents", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-v3-decision-step-"));
  try {
    const store = new JsonNarrativeV3RunStore(path.join(directory, "runs.json"));
    await assert.rejects(store.enqueue({
      projectId: crypto.randomUUID(), runKey: "invalid-decision-parent",
      steps: [{
        stepKey: "decide", stepType: "decide_illustrations",
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

test("migration 024 adds only isolated image-candidate and decision artifacts", async () => {
  const migration = await fs.readFile("db/migrations/024_narrative_v3_illustration_evidence.sql", "utf8");
  assert.match(migration, /'image_candidate_set'/);
  assert.match(migration, /'illustration_decision_set'/);
  assert.match(migration, /'record_image_candidates'/);
  assert.match(migration, /'decide_illustrations'/);
  assert.doesNotMatch(migration, /book_projects\s+ADD|UPDATE\s+book_projects/i);
});
