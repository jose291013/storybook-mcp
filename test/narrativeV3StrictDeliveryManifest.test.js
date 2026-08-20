import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { getWordsTargetByAge } from "../src/config/readingGuidance.js";
import { compileDeliveryManifestV2, loadDeliveryManifestV2 } from "../src/contracts/deliveryManifestV2.js";
import { recordImageCandidateSet } from "../src/contracts/illustrationEvidenceV1.js";
import { parseStrictIllustrationEvaluationWire } from "../src/contracts/illustrationEvidenceV2.js";
import { parseManuscriptWire } from "../src/contracts/manuscriptV1.js";
import { compileManuscriptFactEvidence } from "../src/contracts/manuscriptFactEvidenceV1.js";
import { compileNarrativeBookSpecV3 } from "../src/contracts/narrativeBookSpecV3.js";
import { compileObjectLifecycleProjection } from "../src/contracts/objectLifecycleProjection.js";
import { compileVisualStoryboard } from "../src/contracts/visualStoryboardV1.js";
import { compileVisualContinuityPlan } from "../src/contracts/visualContinuityPlanV1.js";
import { buildNarrativeV3ObjectFixture } from "../src/services/narrativeV3ObjectLifecycleMatrix.js";
import { JsonNarrativeV3RunStore } from "../src/services/narrativeV3StateMachine.js";

const DOMAINS = [
  "asset_integrity", "identity_cardinality", "forbidden_cast", "wardrobe",
  "equipment", "physical_medium", "location_boundary", "main_action",
  "object_cardinality", "landmarks", "style_continuity",
];

function fixture() {
  const source = buildNarrativeV3ObjectFixture({ language: "ES", universeId: "dinosaur_valley", pageCount: 32 });
  const projection = compileObjectLifecycleProjection({ graph: source.graph });
  const spec = compileNarrativeBookSpecV3({ intent: source.intent, graph: source.graph, objectProjection: projection, profileBindings: source.profileBindings });
  const manuscript = parseManuscriptWire({
    spec,
    wire: {
      schema_version: 1,
      contract_id: "calitiki.manuscript-wire.v1",
      source_spec_digest: spec.validation.artifactDigest,
      language: spec.book.language,
      pages: spec.pages.filter((page) => page.kind !== "scene_image").map((page) => {
        const guidance = getWordsTargetByAge(spec.book.audienceAge, page.kind === "scene_text" ? "text" : page.kind);
        return { page_number: page.pageNumber, text: Array(guidance.target).fill("aventura").join(" ") };
      }),
    },
  });
  const factEvidence = compileManuscriptFactEvidence({ spec, manuscript });
  const storyboard = compileVisualStoryboard({ spec, manuscript, factEvidence });
  const continuityPlan = compileVisualContinuityPlan({ spec, storyboard });
  const candidateSet = recordImageCandidateSet({
    storyboard,
    continuityPlan,
    candidates: storyboard.beats.map((beat) => ({
      sceneNumber: beat.sceneNumber,
      beatDigest: beat.beatDigest,
      attempt: 1,
      providerModel: "synthetic-image-v2",
      providerResponseId: `delivery-${beat.sceneNumber}`,
      asset: {
        storageKey: `private/narrative-v3/delivery/scene-${beat.sceneNumber}.webp`,
        sha256: crypto.createHash("sha256").update(`delivery-${beat.sceneNumber}`).digest("hex"),
        mimeType: "image/webp",
        width: 2048,
        height: 2048,
        byteLength: 140000 + beat.sceneNumber,
      },
    })),
  });
  const wire = {
    schema_version: 2,
    contract_id: "calitiki.illustration-evaluation-wire.v2",
    source_storyboard_digest: storyboard.validation.artifactDigest,
    source_candidate_set_digest: candidateSet.validation.artifactDigest,
    decisions: candidateSet.candidates.map((candidate) => ({
      scene_number: candidate.sceneNumber,
      candidate_digest: candidate.candidateDigest,
      domains: Object.fromEntries(DOMAINS.map((domain) => [domain, { status: "pass", evidence_code: "verified" }])),
    })),
  };
  return { spec, manuscript, factEvidence, storyboard, candidateSet, wire };
}

test("DeliveryManifest.v2 exposes every page only after strict evidence and exact fact ancestry pass", () => {
  const input = fixture();
  const decisions = parseStrictIllustrationEvaluationWire({ storyboard: input.storyboard, candidateSet: input.candidateSet, wire: input.wire });
  const manifest = compileDeliveryManifestV2({ ...input, decisions });
  assert.equal(manifest.book.ready, true);
  assert.equal(manifest.pages.length, 32);
  assert.equal(manifest.pages.filter((page) => page.privateAsset).length, input.storyboard.beats.length);
  assert.ok(manifest.pages.every((page) => page.factEvidenceDigest));
  assert.deepEqual(loadDeliveryManifestV2(structuredClone(manifest)), manifest);
});

test("a rejected or uncertain scene can never compile a deliverable book", () => {
  for (const assessment of [
    { status: "fail", evidence_code: "duplicated_required_identity" },
    { status: "uncertain", evidence_code: "insufficient_evidence" },
  ]) {
    const input = fixture();
    input.wire.decisions[0].domains.identity_cardinality = assessment;
    const decisions = parseStrictIllustrationEvaluationWire({ storyboard: input.storyboard, candidateSet: input.candidateSet, wire: input.wire });
    assert.throws(
      () => compileDeliveryManifestV2({ ...input, decisions }),
      (error) => error.code === "strict_delivery_illustrations_incomplete",
    );
  }
});

test("foreign manuscript facts and tampered page digests fail closed", () => {
  const input = fixture();
  const decisions = parseStrictIllustrationEvaluationWire({ storyboard: input.storyboard, candidateSet: input.candidateSet, wire: input.wire });
  const foreignFacts = structuredClone(input.factEvidence);
  foreignFacts.sources.manuscript.artifactDigest = "f".repeat(64);
  assert.throws(() => compileDeliveryManifestV2({ ...input, factEvidence: foreignFacts, decisions }));
  const manifest = structuredClone(compileDeliveryManifestV2({ ...input, decisions }));
  manifest.pages[0].factEvidenceDigest = "0".repeat(64);
  assert.throws(() => loadDeliveryManifestV2(manifest));
});

test("the durable V2 delivery step requires all five exact ordered authorities", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-v3-delivery-v2-"));
  try {
    const store = new JsonNarrativeV3RunStore(path.join(directory, "runs.json"));
    await assert.rejects(store.enqueue({
      projectId: crypto.randomUUID(), runKey: "invalid-delivery-order",
      steps: [{
        stepKey: "deliver-v2", stepType: "assemble_delivery_manifest_v2",
        inputs: [
          ["narrative_book_spec_v3", "a"], ["manuscript", "b"], ["visual_storyboard", "c"],
          ["manuscript_fact_evidence", "d"], ["illustration_decision_set_v2", "e"],
        ].map(([artifactType, digest]) => ({ artifactId: crypto.randomUUID(), artifactType, artifactDigest: digest.repeat(64) })),
      }],
    }), (error) => error.code === "invalid_step_inputs");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("migration 032 adds only the isolated strict delivery artifact and step", async () => {
  const migration = await fs.readFile("db/migrations/032_narrative_v3_strict_delivery_manifest.sql", "utf8");
  assert.match(migration, /'delivery_manifest_v2'/);
  assert.match(migration, /'assemble_delivery_manifest_v2'/);
  assert.doesNotMatch(migration, /book_projects\s+ADD|UPDATE\s+book_projects/i);
});
