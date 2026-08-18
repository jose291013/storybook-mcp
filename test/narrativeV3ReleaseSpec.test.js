import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildCanonicalStoryMechanics } from "../src/contracts/buildCanonicalStoryMechanics.js";
import { buildCreationIntent } from "../src/contracts/creationIntent.js";
import {
  canonicalStoryGraphDigest,
  compileCanonicalStoryGraph,
} from "../src/contracts/narrativeV3Canonical.js";
import {
  compileNarrativeBookSpecV2,
  loadNarrativeBookSpecV2,
} from "../src/contracts/narrativeBookSpecV2.js";
import { JsonNarrativeV3ArtifactStore } from "../src/services/narrativeV3ArtifactStore.js";
import {
  buildNarrativeV3SyntheticFixture,
  runNarrativeV3SyntheticShadowFixture,
} from "../src/services/narrativeV3SyntheticShadow.js";
import {
  JsonNarrativeV3RunStore,
  NarrativeV3StateError,
  NarrativeV3StateMachine,
} from "../src/services/narrativeV3StateMachine.js";

function releaseFixture(options = { language: "FR", universeId: "coral_ocean", pageCount: 32 }) {
  const fixture = buildNarrativeV3SyntheticFixture(options);
  const mechanics = buildCanonicalStoryMechanics({ intent: fixture.intent, concept: fixture.concept });
  const graph = compileCanonicalStoryGraph({ concept: fixture.concept, mechanics });
  return {
    ...fixture,
    graph,
    spec: compileNarrativeBookSpecV2({
      intent: fixture.intent,
      graph,
      profileBindings: fixture.profileBindings,
    }),
  };
}

async function withStores(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-v3-release-test-"));
  try {
    const artifactStore = new JsonNarrativeV3ArtifactStore(path.join(directory, "artifacts.json"));
    const runStore = new JsonNarrativeV3RunStore(path.join(directory, "runs.json"));
    return await run({ artifactStore, runStore });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test("the release compiler binds immutable profiles, pages and one visual instant per scene", () => {
  const { spec, graph } = releaseFixture();

  assert.equal(spec.schemaVersion, 2);
  assert.equal(spec.pages.length, 32);
  assert.equal(spec.scenes.length, 15);
  assert.equal(spec.sources.canonicalStoryGraph.artifactDigest, graph.validation.artifactDigest);
  assert.deepEqual(spec.scenes[0].pageBinding, {
    spreadNumber: 1,
    textPageNumber: 2,
    imagePageNumber: 3,
    textSide: "left",
    imageSide: "right",
  });
  assert.deepEqual(spec.scenes[1].pageBinding, {
    spreadNumber: 2,
    textPageNumber: 5,
    imagePageNumber: 4,
    textSide: "right",
    imageSide: "left",
  });
  assert.equal(spec.registries.characters[0].profileRevision, 1);
  assert.equal(spec.registries.characters[0].displayName, "Synthetic 1");
  assert.equal(spec.scenes.find((scene) => scene.semantic.purpose === "crossing").illustrationInstant.physicalMediumId, "fully_underwater");
  assert.equal(Object.isFrozen(spec), true);
});

test("release compilation is byte-stable and never changes creator-visible semantics", () => {
  const { intent, graph, profileBindings, spec } = releaseFixture({ language: "ES", universeId: "dinosaur_valley", pageCount: 44 });
  const replay = compileNarrativeBookSpecV2({
    intent: structuredClone(intent),
    graph: structuredClone(graph),
    profileBindings: structuredClone(profileBindings),
  });

  assert.deepEqual(replay, spec);
  assert.equal(spec.title, graph.title);
  assert.equal(spec.premise, graph.premise);
  assert.deepEqual(spec.scenes.map((scene) => scene.semantic), graph.scenes.map((scene) => scene.semantic));
});

test("unknown fields, digest tampering and ambiguous profile identity fail closed", () => {
  const { intent, graph, profileBindings, spec } = releaseFixture();
  const unknown = structuredClone(spec);
  unknown.runtimeCheckpoint = "forbidden";
  assert.throws(() => loadNarrativeBookSpecV2(unknown), (error) => error.artifactType === "narrative_book_spec_v2");

  const tampered = structuredClone(spec);
  tampered.scenes[0].illustrationInstant.locationId = "location_adventure";
  assert.throws(() => loadNarrativeBookSpecV2(tampered), (error) => error.code === "release_spec_digest_mismatch");

  const duplicateNames = structuredClone(profileBindings);
  duplicateNames[1].displayName = duplicateNames[0].displayName;
  assert.throws(
    () => compileNarrativeBookSpecV2({ intent, graph, profileBindings: duplicateNames }),
    (error) => error.code === "release_display_name_ambiguous",
  );
});

test("a released identity cannot change the profile authorized by CreationIntent", () => {
  const { intent, graph, profileBindings } = releaseFixture();
  const changed = structuredClone(profileBindings);
  changed[0].profileRef = "synthetic-profile:other";
  assert.throws(
    () => compileNarrativeBookSpecV2({ intent, graph, profileBindings: changed }),
    (error) => error.code === "release_cast_binding_mismatch",
  );
});

test("object-bearing graphs fail closed until the complete visible-state projection exists", () => {
  const { intent, graph, profileBindings } = releaseFixture();
  const withObject = structuredClone(graph);
  withObject.registries.objects.push({ id: "object_token", name: "Synthetic token", kind: "portable" });
  withObject.validation.artifactDigest = canonicalStoryGraphDigest(withObject);

  assert.throws(
    () => compileNarrativeBookSpecV2({ intent, graph: withObject, profileBindings }),
    (error) => error.code === "release_object_projection_unavailable",
  );
});

test("the release artifact has the exact intent and graph parents and replays idempotently", async () => {
  await withStores(async ({ artifactStore, runStore }) => {
    const projectId = crypto.randomUUID();
    const fixture = { language: "EN", universeId: "starry_space", pageCount: 28 };
    const first = await runNarrativeV3SyntheticShadowFixture({ projectId, artifactStore, runStore, fixture });
    const replay = await runNarrativeV3SyntheticShadowFixture({ projectId, artifactStore, runStore, fixture });
    const pointer = await artifactStore.getCurrentPointer(projectId, "narrative_book_spec");
    const artifact = await artifactStore.getArtifact(pointer.artifactId);

    assert.deepEqual(replay, first);
    assert.equal(pointer.pointerRevision, 1);
    assert.deepEqual(artifact.parents.map((parent) => parent.artifactType), ["creation_intent", "canonical_story_graph"]);
    assert.equal(artifact.parents[0].payloadDigest, artifact.payload.sources.creationIntent.artifactDigest);
    assert.equal(artifact.parents[1].payloadDigest, artifact.payload.sources.canonicalStoryGraph.artifactDigest);
  });
});

test("a release cannot pair an intent with a graph descended from another intent", async () => {
  await withStores(async ({ artifactStore }) => {
    const projectId = crypto.randomUUID();
    const { intent, concept, graph, profileBindings } = releaseFixture({ language: "FR", universeId: "enchanted_forest", pageCount: 24 });
    const otherIntent = buildCreationIntent({
      language: intent.language,
      audienceAge: intent.audience.age,
      pageCount: intent.book.pageCount,
      universeId: intent.book.universeId,
      intentionId: intent.narrativeGoal.intentionId,
      approachId: intent.narrativeGoal.approachId,
      sensitivityLevel: intent.narrativeGoal.sensitivityLevel,
      castRefs: intent.cast,
      seriesRef: null,
      previousCanonDigest: null,
      questionnaireDigest: "f".repeat(64),
      safetyAssessmentDigest: intent.sourceRefs.safetyAssessmentDigest,
    });
    const provenance = { producer: "v3_release_test", producerVersion: "v1" };
    const intentArtifact = (await artifactStore.createArtifact({ projectId, artifactType: "creation_intent", payload: intent, provenance })).artifact;
    const otherIntentArtifact = (await artifactStore.createArtifact({ projectId, artifactType: "creation_intent", payload: otherIntent, provenance })).artifact;
    const conceptArtifact = (await artifactStore.createArtifact({
      projectId,
      artifactType: "story_concept",
      payload: concept,
      parents: [{ artifactId: otherIntentArtifact.id, artifactType: otherIntentArtifact.artifactType, payloadDigest: otherIntentArtifact.payloadDigest }],
      provenance,
    })).artifact;
    const graphArtifact = (await artifactStore.createArtifact({
      projectId,
      artifactType: "canonical_story_graph",
      payload: graph,
      parents: [{ artifactId: conceptArtifact.id, artifactType: conceptArtifact.artifactType, payloadDigest: conceptArtifact.payloadDigest }],
      provenance,
    })).artifact;
    const spec = compileNarrativeBookSpecV2({ intent, graph, profileBindings });

    await assert.rejects(
      artifactStore.createArtifact({
        projectId,
        artifactType: "narrative_book_spec",
        payload: spec,
        parents: [
          { artifactId: intentArtifact.id, artifactType: intentArtifact.artifactType, payloadDigest: intentArtifact.payloadDigest },
          { artifactId: graphArtifact.id, artifactType: graphArtifact.artifactType, payloadDigest: graphArtifact.payloadDigest },
        ],
        provenance,
      }),
      (error) => error.code === "artifact_release_lineage_mismatch",
    );
  });
});

test("the release state-machine step requires both immutable ancestors in order", async () => {
  await withStores(async ({ artifactStore, runStore }) => {
    const projectId = crypto.randomUUID();
    const fixture = { language: "FR", universeId: "wonder_city", pageCount: 24 };
    await runNarrativeV3SyntheticShadowFixture({ projectId, artifactStore, runStore, fixture });
    const graphPointer = await artifactStore.getCurrentPointer(projectId, "canonical_story_graph");
    const machine = new NarrativeV3StateMachine({ artifactStore, runStore });

    await assert.rejects(
      machine.enqueue({
        projectId,
        runKey: "invalid-release-step",
        steps: [{
          stepKey: "release-spec",
          stepType: "release_narrative_book_spec",
          inputs: [{ artifactId: graphPointer.artifactId, artifactType: "canonical_story_graph", artifactDigest: graphPointer.artifactDigest }],
        }],
      }),
      (error) => error instanceof NarrativeV3StateError && error.code === "invalid_step_inputs",
    );
  });
});

test("migration 019 expands only the isolated V3 release artifact and step types", async () => {
  const migration = await fs.readFile("db/migrations/019_narrative_v3_release_spec.sql", "utf8");
  assert.match(migration, /'narrative_book_spec'/);
  assert.match(migration, /'release_narrative_book_spec'/);
  assert.doesNotMatch(migration, /book_projects\s+ADD|UPDATE\s+book_projects/i);
});
