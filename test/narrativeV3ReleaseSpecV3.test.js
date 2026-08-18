import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalDigest } from "../src/contracts/narrativeV3Canonical.js";
import {
  compileNarrativeBookSpecV3,
  loadNarrativeBookSpecV3,
} from "../src/contracts/narrativeBookSpecV3.js";
import {
  compileObjectLifecycleProjection,
  objectLifecycleProjectionDigest,
} from "../src/contracts/objectLifecycleProjection.js";
import { buildNarrativeV3ObjectFixture } from "../src/services/narrativeV3ObjectLifecycleMatrix.js";
import { JsonNarrativeV3RunStore } from "../src/services/narrativeV3StateMachine.js";

function releaseFixture(rawFixture = {}) {
  const fixture = buildNarrativeV3ObjectFixture(rawFixture);
  const objectProjection = compileObjectLifecycleProjection({ graph: fixture.graph });
  const spec = compileNarrativeBookSpecV3({
    intent: fixture.intent,
    graph: fixture.graph,
    objectProjection,
    profileBindings: fixture.profileBindings,
  });
  return { ...fixture, objectProjection, spec };
}

function resealProjection(projection) {
  projection.validation.artifactDigest = objectLifecycleProjectionDigest(projection);
  return projection;
}

test("NarrativeBookSpec.v3 binds the exact intent, graph and object projection", () => {
  const { intent, graph, objectProjection, spec } = releaseFixture({ language: "FR", universeId: "dinosaur_valley" });
  assert.equal(spec.schemaVersion, 3);
  assert.equal(spec.sources.creationIntent.artifactDigest, intent.validation.artifactDigest);
  assert.equal(spec.sources.canonicalStoryGraph.artifactDigest, graph.validation.artifactDigest);
  assert.equal(spec.sources.objectLifecycleProjection.artifactDigest, objectProjection.validation.artifactDigest);
  assert.equal(spec.registries.objects.length, 3);
  spec.scenes.forEach((scene, index) => {
    assert.equal(scene.sourceSceneDigest, canonicalDigest(graph.scenes[index]));
    assert.deepEqual(scene.objectStates, objectProjection.scenes[index].states);
    assert.equal(scene.objectEventDigest, objectProjection.scenes[index].eventDigest);
    assert.equal(scene.objectStateDigest, canonicalDigest(scene.objectStates));
    assert.equal(scene.illustrationInstant.objectStateDigest, scene.objectStateDigest);
  });
  assert.equal(Object.isFrozen(spec), true);
});

test("V3 release compilation and loading are byte-identical and fail closed on tampering", () => {
  const fixture = releaseFixture({ language: "ES", universeId: "starry_space" });
  const replay = compileNarrativeBookSpecV3({
    intent: structuredClone(fixture.intent),
    graph: structuredClone(fixture.graph),
    objectProjection: structuredClone(fixture.objectProjection),
    profileBindings: structuredClone(fixture.profileBindings),
  });
  assert.deepEqual(replay, fixture.spec);
  assert.deepEqual(loadNarrativeBookSpecV3(structuredClone(fixture.spec)), fixture.spec);

  const tampered = structuredClone(fixture.spec);
  tampered.scenes[0].objectStates[0].quantity = tampered.scenes[0].objectStates[0].quantity ? 0 : 1;
  assert.throws(
    () => loadNarrativeBookSpecV3(tampered),
    (error) => error.code === "release_object_state_digest_mismatch",
  );

  const unknown = structuredClone(fixture.spec);
  unknown.scenes[0].objectStates[0].confidence = 0.5;
  assert.throws(
    () => loadNarrativeBookSpecV3(unknown),
    (error) => error.artifactType === "narrative_book_spec_v3",
  );
});

test("a projection from another graph cannot enter the released spec", () => {
  const fixture = releaseFixture({ language: "EN", universeId: "wonder_city" });
  const foreign = structuredClone(fixture.objectProjection);
  foreign.sourceGraph.artifactDigest = "f".repeat(64);
  resealProjection(foreign);
  assert.throws(
    () => compileNarrativeBookSpecV3({
      intent: fixture.intent,
      graph: fixture.graph,
      objectProjection: foreign,
      profileBindings: fixture.profileBindings,
    }),
    (error) => error.code === "release_object_projection_graph_mismatch",
  );
});

test("stale scene or event projections are rejected before release", () => {
  const fixture = releaseFixture({ language: "FR", universeId: "cloud_castle" });
  const staleScene = structuredClone(fixture.objectProjection);
  staleScene.scenes[0].sourceSceneDigest = "e".repeat(64);
  resealProjection(staleScene);
  assert.throws(
    () => compileNarrativeBookSpecV3({ ...fixture, objectProjection: staleScene }),
    (error) => error.code === "release_object_scene_binding_mismatch",
  );

  const staleEvents = structuredClone(fixture.objectProjection);
  staleEvents.scenes[0].eventDigest = "d".repeat(64);
  resealProjection(staleEvents);
  assert.throws(
    () => compileNarrativeBookSpecV3({ ...fixture, objectProjection: staleEvents }),
    (error) => error.code === "release_object_scene_binding_mismatch",
  );
});

test("the V3 release step requires the three exact ordered artifact inputs", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-v3-release-step-"));
  try {
    const store = new JsonNarrativeV3RunStore(path.join(directory, "runs.json"));
    const ref = (artifactType) => ({
      artifactId: crypto.randomUUID(),
      artifactType,
      artifactDigest: "a".repeat(64),
    });
    await assert.rejects(
      store.enqueue({
        projectId: crypto.randomUUID(),
        runKey: "invalid-v3-release",
        steps: [{
          stepKey: "release",
          stepType: "release_narrative_book_spec_v3",
          inputs: [ref("creation_intent"), ref("object_lifecycle_projection"), ref("canonical_story_graph")],
        }],
      }),
      (error) => error.code === "invalid_step_inputs",
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("migration 021 adds only the isolated V3 release artifact and step", async () => {
  const migration = await fs.readFile("db/migrations/021_narrative_v3_object_aware_release.sql", "utf8");
  assert.match(migration, /'narrative_book_spec_v3'/);
  assert.match(migration, /'release_narrative_book_spec_v3'/);
  assert.doesNotMatch(migration, /book_projects\s+ADD|UPDATE\s+book_projects/i);
});
