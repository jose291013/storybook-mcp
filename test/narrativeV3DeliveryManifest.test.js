import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { getWordsTargetByAge } from "../src/config/readingGuidance.js";
import { compileDeliveryManifest, loadDeliveryManifest } from "../src/contracts/deliveryManifestV1.js";
import { parseIllustrationEvaluationWire, recordImageCandidateSet } from "../src/contracts/illustrationEvidenceV1.js";
import { parseManuscriptWire } from "../src/contracts/manuscriptV1.js";
import { compileNarrativeBookSpecV3 } from "../src/contracts/narrativeBookSpecV3.js";
import { compileObjectLifecycleProjection } from "../src/contracts/objectLifecycleProjection.js";
import { compileVisualStoryboard } from "../src/contracts/visualStoryboardV1.js";
import { compileVisualContinuityPlan } from "../src/contracts/visualContinuityPlanV1.js";
import { buildNarrativeV3ObjectFixture } from "../src/services/narrativeV3ObjectLifecycleMatrix.js";
import { JsonNarrativeV3RunStore } from "../src/services/narrativeV3StateMachine.js";

function fixture() {
  const source = buildNarrativeV3ObjectFixture({ language: "ES", universeId: "dinosaur_valley" });
  const projection = compileObjectLifecycleProjection({ graph: source.graph });
  const spec = compileNarrativeBookSpecV3({ intent: source.intent, graph: source.graph, objectProjection: projection, profileBindings: source.profileBindings });
  const manuscript = parseManuscriptWire({
    spec,
    wire: {
      schema_version: 1, contract_id: "calitiki.manuscript-wire.v1",
      source_spec_digest: spec.validation.artifactDigest, language: spec.book.language,
      pages: spec.pages.filter((page) => ["opening_text", "scene_text", "closing_text"].includes(page.kind)).map((page) => {
        const guidance = getWordsTargetByAge(spec.book.audienceAge, page.kind === "scene_text" ? "text" : page.kind);
        return { page_number: page.pageNumber, text: Array(guidance.target).fill("historia").join(" ") };
      }),
    },
  });
  const storyboard = compileVisualStoryboard({ spec, manuscript });
  const continuityPlan = compileVisualContinuityPlan({ spec, storyboard });
  const candidates = recordImageCandidateSet({
    storyboard,
    continuityPlan,
    candidates: storyboard.beats.map((beat) => ({
      sceneNumber: beat.sceneNumber, beatDigest: beat.beatDigest, attempt: 1,
      providerModel: "synthetic-image-v1", providerResponseId: `delivery-image-${beat.sceneNumber}`,
      asset: {
        storageKey: `private/narrative-v3/delivery/scene-${beat.sceneNumber}.webp`,
        sha256: crypto.createHash("sha256").update(`delivery-${beat.sceneNumber}`).digest("hex"),
        mimeType: "image/webp", width: 2048, height: 2048, byteLength: 120000 + beat.sceneNumber,
      },
    })),
  });
  const cleanWire = {
    schema_version: 1, contract_id: "calitiki.illustration-evaluation-wire.v1",
    source_storyboard_digest: storyboard.validation.artifactDigest,
    source_candidate_set_digest: candidates.validation.artifactDigest,
    decisions: candidates.candidates.map((candidate) => ({ scene_number: candidate.sceneNumber, candidate_digest: candidate.candidateDigest, issues: [] })),
  };
  const decisions = parseIllustrationEvaluationWire({ storyboard, candidateSet: candidates, wire: cleanWire });
  return { spec, manuscript, storyboard, continuityPlan, candidates, cleanWire, decisions };
}

test("DeliveryManifest.v1 covers every physical page from exact immutable text and accepted image decisions", () => {
  const input = fixture();
  const manifest = compileDeliveryManifest(input);
  assert.equal(manifest.book.ready, true);
  assert.equal(manifest.pages.length, input.spec.book.pageCount);
  manifest.pages.forEach((page, index) => {
    assert.equal(page.pageNumber, index + 1);
    assert.equal(Boolean(page.privateAsset), page.kind === "scene_image");
    if (page.privateAsset) assert.match(page.privateAsset.storageKey, /^private\/narrative-v3\//);
  });
  assert.equal(Object.isFrozen(manifest), true);
});

test("delivery fails closed while one confirmed objective image defect remains", () => {
  const input = fixture();
  const rejectedWire = structuredClone(input.cleanWire);
  rejectedWire.decisions[4].issues.push({ code: "wrong_physical_medium", certainty: "confirmed" });
  const rejected = parseIllustrationEvaluationWire({ storyboard: input.storyboard, candidateSet: input.candidates, wire: rejectedWire });
  assert.throws(() => compileDeliveryManifest({ ...input, decisions: rejected }), (error) => error.code === "delivery_illustrations_incomplete");
});

test("delivery compilation is byte-identical and persisted page changes fail closed", () => {
  const input = fixture();
  const manifest = compileDeliveryManifest(input);
  assert.deepEqual(compileDeliveryManifest(structuredClone(input)), manifest);
  assert.deepEqual(loadDeliveryManifest(structuredClone(manifest)), manifest);
  const changed = structuredClone(manifest);
  changed.pages[1].sourceItemDigest = "a".repeat(64);
  assert.throws(() => loadDeliveryManifest(changed), (error) => error.code === "delivery_page_digest_mismatch");
});

test("the delivery durable step requires all four exact ordered source artifacts", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-v3-delivery-step-"));
  try {
    const store = new JsonNarrativeV3RunStore(path.join(directory, "runs.json"));
    await assert.rejects(store.enqueue({
      projectId: crypto.randomUUID(), runKey: "invalid-delivery-parent",
      steps: [{
        stepKey: "deliver", stepType: "assemble_delivery_manifest",
        inputs: [
          { artifactId: crypto.randomUUID(), artifactType: "narrative_book_spec_v3", artifactDigest: "a".repeat(64) },
          { artifactId: crypto.randomUUID(), artifactType: "visual_storyboard", artifactDigest: "b".repeat(64) },
          { artifactId: crypto.randomUUID(), artifactType: "manuscript", artifactDigest: "c".repeat(64) },
          { artifactId: crypto.randomUUID(), artifactType: "illustration_decision_set", artifactDigest: "d".repeat(64) },
        ],
      }],
    }), (error) => error.code === "invalid_step_inputs");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("migration 025 adds only the isolated delivery manifest artifact and step", async () => {
  const migration = await fs.readFile("db/migrations/025_narrative_v3_delivery_manifest.sql", "utf8");
  assert.match(migration, /'delivery_manifest'/);
  assert.match(migration, /'assemble_delivery_manifest'/);
  assert.doesNotMatch(migration, /book_projects\s+ADD|UPDATE\s+book_projects/i);
});
