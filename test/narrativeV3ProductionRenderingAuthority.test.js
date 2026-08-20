import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { getWordsTargetByAge } from "../src/config/readingGuidance.js";
import { JsonGenerationRunStore } from "../src/services/generationRunStore.js";
import { JsonNarrativeV3ArtifactStore } from "../src/services/narrativeV3ArtifactStore.js";
import { runNarrativeV3ObjectLifecycleFixture } from "../src/services/narrativeV3ObjectLifecycleMatrix.js";
import { sealNarrativeV3ProductionPreview } from "../src/services/narrativeV3ProductionRenderingAuthority.js";
import { JsonNarrativeV3RunStore } from "../src/services/narrativeV3StateMachine.js";

const DOMAIN_NAMES = [
  "asset_integrity", "identity_cardinality", "forbidden_cast", "wardrobe",
  "equipment", "physical_medium", "location_boundary", "main_action",
  "object_cardinality", "landmarks", "style_continuity",
];

test("the real production worker seals a V3 manifest only from accepted private candidates with eleven verified domains", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-v3-production-authority-"));
  try {
    const projectId = crypto.randomUUID();
    const artifactStore = new JsonNarrativeV3ArtifactStore(path.join(directory, "artifacts.json"));
    const stateRunStore = new JsonNarrativeV3RunStore(path.join(directory, "v3-runs.json"));
    await runNarrativeV3ObjectLifecycleFixture({
      projectId,
      artifactStore,
      runStore: stateRunStore,
      fixture: { language: "FR", universeId: "coral_ocean", pageCount: 32 },
    });
    const specPointer = await artifactStore.getCurrentPointer(projectId, "narrative_book_spec_v3");
    const spec = (await artifactStore.getArtifact(specPointer.artifactId)).payload;
    const storyboardPointer = await artifactStore.getCurrentPointer(projectId, "visual_storyboard");
    const storyboard = (await artifactStore.getArtifact(storyboardPointer.artifactId)).payload;
    const runStore = new JsonGenerationRunStore(path.join(directory, "generation-runs.json"));
    const runId = crypto.randomUUID();
    await runStore.createRun({ id: runId, projectId, kind: "preview", status: "running" });
    const domains = Object.fromEntries(DOMAIN_NAMES.map((domain) => [domain, { status: "pass", evidence_code: "verified" }]));
    for (const beat of storyboard.beats) {
      const { step } = await runStore.upsertStep(runId, {
        stepKey: `image:page:${beat.imagePageNumber}`,
        stepType: "page_image",
        status: "completed",
        maxAttempts: 2,
      });
      await runStore.recordCandidate({
        runId,
        stepId: step.id,
        projectId,
        pageNumber: beat.imagePageNumber,
        candidateNumber: 1,
        status: "accepted",
        storageKey: `ebooks/previews/${projectId}/scene-${beat.sceneNumber}.png`,
        previewUrl: `/api/projects/${projectId}/preview-assets/scene-${beat.sceneNumber}.png`,
        metadata: {
          providerModel: "gpt-image-2",
          asset: {
            sha256: crypto.createHash("sha256").update(`production-${beat.sceneNumber}`).digest("hex"),
            mimeType: "image/png",
            width: 1024,
            height: 1024,
            byteLength: 120000 + beat.sceneNumber,
          },
          strictEvidence: { version: 2, approved: true, domains },
        },
      });
    }
    const draftPages = spec.pages
      .filter((page) => page.kind !== "scene_image")
      .map((page) => {
        const guidance = getWordsTargetByAge(spec.book.audienceAge, page.kind === "scene_text" ? "text" : page.kind);
        return {
          page_number: page.pageNumber,
          page_type: page.kind === "scene_text" ? "text" : page.kind,
          text: Array(guidance.target).fill("aventure").join(" "),
        };
      });
    const sealed = await sealNarrativeV3ProductionPreview({
      projectId,
      runId,
      spec,
      draftPages,
      artifactStore,
      runStore,
    });
    assert.equal(sealed.status, "sealed");
    assert.equal(sealed.sceneCount, storyboard.beats.length);
    assert.match(sealed.artifactDigest, /^[a-f0-9]{64}$/);
    const manifestPointer = await artifactStore.getCurrentPointer(projectId, "delivery_manifest_v2");
    const manifest = (await artifactStore.getArtifact(manifestPointer.artifactId)).payload;
    assert.equal(manifest.book.ready, true);
    assert.ok(manifest.pages.filter((page) => page.kind === "scene_image").every((page) => (
      page.privateAsset.storageKey.startsWith("ebooks/previews/")
    )));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
