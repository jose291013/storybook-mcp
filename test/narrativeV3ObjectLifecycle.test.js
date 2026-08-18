import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  compileObjectLifecycleProjection,
  loadObjectLifecycleProjection,
} from "../src/contracts/objectLifecycleProjection.js";
import { canonicalStoryGraphDigest } from "../src/contracts/narrativeV3Canonical.js";
import { JsonNarrativeV3ArtifactStore } from "../src/services/narrativeV3ArtifactStore.js";
import {
  buildNarrativeV3ObjectFixture,
  narrativeV3ObjectAdversarialCases,
  narrativeV3ObjectLifecycleMatrix,
  runNarrativeV3ObjectLifecycleFixture,
} from "../src/services/narrativeV3ObjectLifecycleMatrix.js";
import { JsonNarrativeV3RunStore } from "../src/services/narrativeV3StateMachine.js";

async function withStores(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-v3-object-test-"));
  try {
    return await run({
      artifactStore: new JsonNarrativeV3ArtifactStore(path.join(directory, "artifacts.json")),
      runStore: new JsonNarrativeV3RunStore(path.join(directory, "runs.json")),
    });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test("object projection proves exact quantity, owner, location and render visibility", () => {
  const fixture = buildNarrativeV3ObjectFixture({ language: "FR", universeId: "dinosaur_valley" });
  const projection = compileObjectLifecycleProjection({ graph: fixture.graph });
  const state = (sceneIndex, objectId) => projection.scenes[sceneIndex].states.find((entry) => entry.objectId === objectId);

  assert.equal(projection.objects.length, 3);
  assert.deepEqual(
    state(fixture.indexes.preparationIndex, "object_unique_map"),
    {
      objectId: "object_unique_map",
      stateId: "carried",
      quantity: 1,
      ownerCharacterId: "character_hero",
      locationId: "location_origin",
      visibility: "required",
      visibilityReason: "event_scene",
    },
  );
  assert.equal(state(fixture.indexes.adventureIndex, "object_fixed_landmark").visibility, "required");
  assert.equal(state(fixture.indexes.returnIndex, "object_fixed_landmark").visibility, "forbidden");
  assert.equal(state(fixture.indexes.climaxIndex, "object_consumable_seed").quantity, 0);
  assert.equal(state(fixture.indexes.returnIndex, "object_consumable_seed").visibilityReason, "consumed");
  assert.equal(Object.isFrozen(projection), true);
});

test("projection compilation is byte-identical and digest tampering fails closed", () => {
  const { graph } = buildNarrativeV3ObjectFixture({ language: "ES", universeId: "wonder_city" });
  const first = compileObjectLifecycleProjection({ graph });
  const replay = compileObjectLifecycleProjection({ graph: structuredClone(graph) });
  assert.deepEqual(replay, first);

  const tampered = structuredClone(first);
  tampered.scenes[0].states[0].quantity = 0;
  assert.throws(
    () => loadObjectLifecycleProjection(tampered),
    (error) => error.code === "object_projection_digest_mismatch",
  );
});

test("five adversarial lifecycle corruptions are rejected with stable exact codes", () => {
  const fixture = buildNarrativeV3ObjectFixture({ language: "EN", universeId: "starry_space" });
  const cases = narrativeV3ObjectAdversarialCases(fixture.graph, fixture.indexes);
  assert.equal(cases.length, 5);
  for (const candidate of cases) {
    assert.throws(
      () => compileObjectLifecycleProjection({ graph: candidate.graph }),
      (error) => error.code === candidate.expectedCode,
      candidate.id,
    );
  }
});

test("an object event cannot involve an off-camera owner", () => {
  const fixture = buildNarrativeV3ObjectFixture({ language: "FR", universeId: "cloud_castle" });
  const graph = structuredClone(fixture.graph);
  const eventScene = graph.scenes[fixture.indexes.preparationIndex];
  const mapEvent = eventScene.objectEvents.find((event) => event.objectId === "object_unique_map");
  mapEvent.toOwnerCharacterId = "character_family";
  graph.validation.artifactDigest = canonicalStoryGraphDigest(graph);

  assert.throws(
    () => compileObjectLifecycleProjection({ graph }),
    (error) => error.code === "object_event_owner_not_visible",
  );
});

test("the object projection is committed through the real ledger and durable step exactly once", async () => {
  await withStores(async ({ artifactStore, runStore }) => {
    const projectId = crypto.randomUUID();
    const input = {
      projectId,
      artifactStore,
      runStore,
      fixture: { language: "FR", universeId: "coral_ocean", pageCount: 32 },
    };
    const first = await runNarrativeV3ObjectLifecycleFixture(input);
    const replay = await runNarrativeV3ObjectLifecycleFixture(input);
    assert.deepEqual(replay, first);
    assert.equal(first.objectCount, 3);
    assert.equal(first.adversarialCases, 5);
    assert.equal((await artifactStore.listArtifacts(projectId)).length, 5);
    const pointer = await artifactStore.getCurrentPointer(projectId, "object_lifecycle_projection");
    const artifact = await artifactStore.getArtifact(pointer.artifactId);
    assert.equal(pointer.pointerRevision, 1);
    assert.deepEqual(artifact.parents.map((parent) => parent.artifactType), ["canonical_story_graph"]);
    assert.equal(artifact.parents[0].payloadDigest, artifact.payload.sourceGraph.artifactDigest);
    const releasePointer = await artifactStore.getCurrentPointer(projectId, "narrative_book_spec_v3");
    const release = await artifactStore.getArtifact(releasePointer.artifactId);
    assert.equal(releasePointer.pointerRevision, 1);
    assert.deepEqual(
      release.parents.map((parent) => parent.artifactType),
      ["creation_intent", "canonical_story_graph", "object_lifecycle_projection"],
    );
    assert.equal(release.payload.sources.objectLifecycleProjection.artifactDigest, artifact.payloadDigest);
  });
});

test("the complete 32-page language and universe matrix stays local and deterministic", async () => {
  const matrix = narrativeV3ObjectLifecycleMatrix();
  assert.equal(matrix.length, 18);
  for (const fixture of matrix) {
    await withStores(async ({ artifactStore, runStore }) => {
      const report = await runNarrativeV3ObjectLifecycleFixture({
        projectId: crypto.randomUUID(), artifactStore, runStore, fixture,
      });
      assert.equal(report.status, "passed", report.fixtureId);
      assert.equal(report.providerCalls, 0);
      assert.equal(report.paidModelCalls, 0);
      assert.equal(report.customerRoutesTouched, false);
    });
  }
});

test("the object matrix imports no production route, credit, model or environment dependency", async () => {
  const implementation = await fs.readFile("src/services/narrativeV3ObjectLifecycleMatrix.js", "utf8");
  const script = await fs.readFile("scripts/runNarrativeV3ObjectLifecycleMatrix.js", "utf8");
  assert.doesNotMatch(implementation, /from ["'][^"']*(openai|routes|credits|server)/i);
  assert.doesNotMatch(script, /from ["'][^"']*(openai|routes|credits|server)/i);
  assert.doesNotMatch(`${implementation}\n${script}`, /process\.env/);
});

test("migration 020 expands only isolated V3 artifact and step constraints", async () => {
  const migration = await fs.readFile("db/migrations/020_narrative_v3_object_lifecycle.sql", "utf8");
  assert.match(migration, /'object_lifecycle_projection'/);
  assert.match(migration, /'compile_object_lifecycle'/);
  assert.doesNotMatch(migration, /book_projects\s+ADD|UPDATE\s+book_projects/i);
});
