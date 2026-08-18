import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { getWordsTargetByAge } from "../src/config/readingGuidance.js";
import { parseManuscriptWire } from "../src/contracts/manuscriptV1.js";
import { compileNarrativeBookSpecV3 } from "../src/contracts/narrativeBookSpecV3.js";
import { compileObjectLifecycleProjection } from "../src/contracts/objectLifecycleProjection.js";
import { compileVisualStoryboard, loadVisualStoryboard } from "../src/contracts/visualStoryboardV1.js";
import { buildNarrativeV3ObjectFixture } from "../src/services/narrativeV3ObjectLifecycleMatrix.js";
import { JsonNarrativeV3RunStore } from "../src/services/narrativeV3StateMachine.js";

function fixture(raw = {}) {
  const source = buildNarrativeV3ObjectFixture(raw);
  const objectProjection = compileObjectLifecycleProjection({ graph: source.graph });
  const spec = compileNarrativeBookSpecV3({
    intent: source.intent,
    graph: source.graph,
    objectProjection,
    profileBindings: source.profileBindings,
  });
  const word = { FR: "histoire", ES: "historia", EN: "story" }[spec.book.language];
  const wire = {
    schema_version: 1,
    contract_id: "calitiki.manuscript-wire.v1",
    source_spec_digest: spec.validation.artifactDigest,
    language: spec.book.language,
    pages: spec.pages.filter((page) => ["opening_text", "scene_text", "closing_text"].includes(page.kind)).map((page) => {
      const guidance = getWordsTargetByAge(spec.book.audienceAge, page.kind === "scene_text" ? "text" : page.kind);
      return { page_number: page.pageNumber, text: Array(guidance.target).fill(word).join(" ") };
    }),
  };
  const manuscript = parseManuscriptWire({ spec, wire });
  return { ...source, spec, manuscript };
}

test("VisualStoryboard.v1 binds every image beat to exact prose, scene, cast, wardrobe and object state", () => {
  const { spec, manuscript } = fixture({ language: "FR", universeId: "coral_ocean" });
  const storyboard = compileVisualStoryboard({ spec, manuscript });
  assert.equal(storyboard.beats.length, spec.scenes.length);
  storyboard.beats.forEach((beat, index) => {
    const scene = spec.scenes[index];
    const page = manuscript.pages.find((entry) => entry.sceneNumber === scene.sceneNumber);
    assert.equal(beat.textPageNumber, page.pageNumber);
    assert.equal(beat.imagePageNumber, scene.pageBinding.imagePageNumber);
    assert.equal(beat.sourceSceneDigest, scene.sourceSceneDigest);
    assert.equal(beat.objectStateDigest, scene.objectStateDigest);
    assert.deepEqual(beat.cast.visibleCharacterIds, scene.illustrationInstant.visibleCharacterIds);
    assert.deepEqual(beat.cast.wardrobeStates, scene.illustrationInstant.wardrobeStates);
    assert.deepEqual(beat.objectStates, scene.objectStates);
    assert.equal(beat.physical.locationId, scene.illustrationInstant.locationId);
  });
  assert.equal(new Set(storyboard.beats.map((beat) => beat.composition.scaleFamily)).size >= 3, true);
  assert.equal(Object.isFrozen(storyboard), true);
});

test("adjacent storyboard beats expose one exact bidirectional physical handoff", () => {
  const { spec, manuscript } = fixture({ language: "ES", universeId: "starry_space" });
  const storyboard = compileVisualStoryboard({ spec, manuscript });
  storyboard.beats.slice(1).forEach((beat, index) => {
    const previous = storyboard.beats[index];
    assert.equal(previous.physical.locationAfterId, beat.physical.locationBeforeId);
    assert.equal(previous.handoff.nextBeatDigest, beat.beatDigest);
    assert.equal(beat.handoff.previousBeatDigest, previous.beatDigest);
    assert.equal(previous.handoff.nextLocationId, beat.physical.locationBeforeId);
  });
});

test("storyboard compilation is byte-identical and canonical loading rejects changed beats", () => {
  const { spec, manuscript } = fixture({ language: "EN", universeId: "dinosaur_valley" });
  const storyboard = compileVisualStoryboard({ spec, manuscript });
  assert.deepEqual(compileVisualStoryboard({ spec: structuredClone(spec), manuscript: structuredClone(manuscript) }), storyboard);
  assert.deepEqual(loadVisualStoryboard(structuredClone(storyboard)), storyboard);
  const changedCast = structuredClone(storyboard);
  changedCast.beats[0].cast.visibleCharacterIds.pop();
  assert.throws(() => loadVisualStoryboard(changedCast), (error) => error.code === "storyboard_beat_digest_mismatch");
  const changedDigest = structuredClone(storyboard);
  changedDigest.validation.artifactDigest = "f".repeat(64);
  assert.throws(() => loadVisualStoryboard(changedDigest), (error) => error.code === "storyboard_digest_mismatch");
});

test("a storyboard refuses a manuscript from another released book", () => {
  const first = fixture({ language: "FR", universeId: "enchanted_forest" });
  const second = fixture({ language: "FR", universeId: "wonder_city" });
  assert.throws(
    () => compileVisualStoryboard({ spec: first.spec, manuscript: second.manuscript }),
    (error) => error.code === "storyboard_manuscript_spec_mismatch",
  );
});

test("the storyboard durable step requires exact ordered spec and manuscript parents", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-v3-storyboard-step-"));
  try {
    const store = new JsonNarrativeV3RunStore(path.join(directory, "runs.json"));
    await assert.rejects(
      store.enqueue({
        projectId: crypto.randomUUID(),
        runKey: "invalid-storyboard-parent",
        steps: [{
          stepKey: "compile",
          stepType: "compile_visual_storyboard",
          inputs: [
            { artifactId: crypto.randomUUID(), artifactType: "manuscript", artifactDigest: "a".repeat(64) },
            { artifactId: crypto.randomUUID(), artifactType: "narrative_book_spec_v3", artifactDigest: "b".repeat(64) },
          ],
        }],
      }),
      (error) => error.code === "invalid_step_inputs",
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("migration 023 adds only the isolated visual storyboard artifact and step", async () => {
  const migration = await fs.readFile("db/migrations/023_narrative_v3_visual_storyboard.sql", "utf8");
  assert.match(migration, /'visual_storyboard'/);
  assert.match(migration, /'compile_visual_storyboard'/);
  assert.doesNotMatch(migration, /book_projects\s+ADD|UPDATE\s+book_projects/i);
});
