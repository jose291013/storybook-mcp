import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  compileCanonicalStoryGraph,
  parseStoryConceptWire,
} from "../src/contracts/narrativeV3Canonical.js";
import {
  JsonNarrativeV3ArtifactStore,
  NarrativeV3ArtifactStoreError,
} from "../src/services/narrativeV3ArtifactStore.js";

function wireConcept(title = "La vallée aux lucioles") {
  return {
    schema_version: 1,
    contract_id: "calitiki.story-concept-wire.v1",
    language: "FR",
    title,
    premise: "Noa apprend à avancer sans devoir réussir du premier coup.",
    theme_proof: "Noa essaie deux chemins, choisit le sien puis explique ce qu'elle a appris.",
    hero_arc: {
      desire: "Trouver la lumière du vallon.",
      initial_doubt: "Elle craint de choisir le mauvais chemin.",
      decisive_choice: "Elle observe les traces et choisit elle-même.",
      earned_change: "Elle sait désormais essayer, observer et ajuster.",
    },
    beats: [
      {
        beat_key: "quiet_opening",
        purpose: "opening",
        summary: "Noa et Eva observent une lueur depuis la maison.",
        emotional_shift: "curiosité calme",
        distinctive_image: "une luciole dessine un cercle près de la fenêtre",
        participant_keys: ["hero", "guide"],
      },
      {
        beat_key: "valley_crossing",
        purpose: "crossing",
        summary: "Noa franchit le passage vers la vallée avec Eva.",
        emotional_shift: "de l'hésitation à l'élan",
        distinctive_image: "une arche de feuilles ouvre la vallée lumineuse",
        participant_keys: ["hero", "guide"],
      },
      {
        beat_key: "chosen_attempt",
        purpose: "attempt",
        summary: "Noa compare deux pistes et teste celle qu'elle comprend le mieux.",
        emotional_shift: "de la précipitation à l'attention",
        distinctive_image: "deux chemins de lucioles se séparent autour d'un rocher",
        participant_keys: ["hero", "guide"],
      },
      {
        beat_key: "home_return",
        purpose: "return",
        summary: "Noa revient à la maison en gardant sa propre méthode.",
        emotional_shift: "de la tension à la confiance",
        distinctive_image: "la même arche ramène une lumière douce vers la maison",
        participant_keys: ["hero", "guide"],
      },
      {
        beat_key: "earned_resolution",
        purpose: "resolution",
        summary: "Noa prépare seule une petite carte pour son prochain essai.",
        emotional_shift: "fierté tranquille",
        distinctive_image: "une carte simple éclairée par une luciole",
        participant_keys: ["hero", "guide"],
      },
    ],
  };
}

function visibleScene({ id, beatKey, act, before, after, purpose }) {
  const movement = purpose === "crossing"
    ? [{
      sequence: 1,
      kind: "cross_passage",
      travelerCharacterIds: ["character_hero", "character_guide"],
      fromLocationId: before,
      toLocationId: after,
      passageId: "passage_leaf_arch",
    }]
    : purpose === "return"
      ? [{
        sequence: 1,
        kind: "return_travel",
        travelerCharacterIds: ["character_hero", "character_guide"],
        fromLocationId: before,
        toLocationId: after,
        passageId: "passage_leaf_arch",
      }]
      : [];
  return {
    id,
    beatKey,
    act,
    timeline: {
      locationBeforeId: before,
      locationAfterId: after,
      visiblePhase: purpose === "crossing" || purpose === "return" ? "during" : "end",
    },
    presences: [
      { characterId: "character_hero", mode: "physical", phase: "throughout", locationId: after },
      { characterId: "character_guide", mode: "physical", phase: "throughout", locationId: after },
    ],
    movements: movement,
    objectEvents: [],
    wardrobeStates: [
      { characterId: "character_hero", outfitStateId: "outfit_explorer", equipmentStateIds: [] },
      { characterId: "character_guide", outfitStateId: "outfit_explorer", equipmentStateIds: [] },
    ],
    illustration: {
      visibleCharacterIds: ["character_hero", "character_guide"],
      forbiddenCharacterIds: [],
      mainAction: { subjectCharacterId: "character_hero", action: "observe et choisit", targetId: "" },
    },
  };
}

function mechanics() {
  return {
    schemaVersion: 1,
    contractId: "calitiki.canonical-story-mechanics.v1",
    book: { audienceAge: 8, pageCount: 24, universeId: "luminous_valley" },
    registries: {
      characters: [
        { id: "character_hero", semanticKey: "hero", canonicalName: "Noa", role: "hero", initialLocationId: "location_home" },
        { id: "character_guide", semanticKey: "guide", canonicalName: "Eva", role: "guide", initialLocationId: "location_home" },
      ],
      locations: [
        { id: "location_home", name: "la maison", kind: "origin" },
        { id: "location_valley", name: "la vallée lumineuse", kind: "adventure" },
      ],
      objects: [],
      passages: [{
        id: "passage_leaf_arch",
        name: "l'arche de feuilles",
        sideALocationId: "location_home",
        sideBLocationId: "location_valley",
      }],
    },
    scenes: [
      visibleScene({ id: "scene_opening", beatKey: "quiet_opening", act: 1, before: "location_home", after: "location_home", purpose: "opening" }),
      visibleScene({ id: "scene_crossing", beatKey: "valley_crossing", act: 1, before: "location_home", after: "location_valley", purpose: "crossing" }),
      visibleScene({ id: "scene_attempt", beatKey: "chosen_attempt", act: 2, before: "location_valley", after: "location_valley", purpose: "attempt" }),
      visibleScene({ id: "scene_return", beatKey: "home_return", act: 3, before: "location_valley", after: "location_home", purpose: "return" }),
      visibleScene({ id: "scene_resolution", beatKey: "earned_resolution", act: 3, before: "location_home", after: "location_home", purpose: "resolution" }),
    ],
  };
}

function provenance(producer = "server_parser") {
  return { producer, producerVersion: "v1", runId: "synthetic-run-1", stepId: "concept" };
}

async function withStore(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-v3-artifacts-"));
  const filePath = path.join(directory, "artifacts.json");
  try {
    return await run(new JsonNarrativeV3ArtifactStore(filePath), filePath);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test("append-only StoryConcept creation is idempotent and allocates revisions", async () => {
  await withStore(async (store) => {
    const projectId = crypto.randomUUID();
    const concept = parseStoryConceptWire(wireConcept());
    const first = await store.createArtifact({ projectId, artifactType: "story_concept", payload: concept, provenance: provenance() });
    const replay = await store.createArtifact({ projectId, artifactType: "story_concept", payload: concept, provenance: provenance() });
    const second = await store.createArtifact({
      projectId,
      artifactType: "story_concept",
      payload: parseStoryConceptWire(wireConcept("Le vallon des deux chemins")),
      provenance: provenance(),
    });

    assert.equal(first.created, true);
    assert.equal(replay.created, false);
    assert.equal(replay.artifact.id, first.artifact.id);
    assert.equal(first.artifact.revision, 1);
    assert.equal(second.artifact.revision, 2);
    assert.equal((await store.listArtifacts(projectId, "story_concept")).length, 2);
    assert.equal(Object.isFrozen(first.artifact.payload), true);
  });
});

test("a canonical graph can be stored only behind its exact persisted concept parent", async () => {
  await withStore(async (store) => {
    const projectId = crypto.randomUUID();
    const concept = parseStoryConceptWire(wireConcept());
    const conceptRecord = (await store.createArtifact({
      projectId,
      artifactType: "story_concept",
      payload: concept,
      provenance: provenance(),
    })).artifact;
    const graph = compileCanonicalStoryGraph({ concept, mechanics: mechanics() });
    const graphRecord = await store.createArtifact({
      projectId,
      artifactType: "canonical_story_graph",
      payload: graph,
      parents: [{
        artifactId: conceptRecord.id,
        artifactType: conceptRecord.artifactType,
        payloadDigest: conceptRecord.payloadDigest,
      }],
      provenance: provenance("deterministic_compiler"),
    });

    assert.equal(graphRecord.created, true);
    assert.equal(graphRecord.artifact.parents[0].artifactId, conceptRecord.id);
    assert.equal(graphRecord.artifact.parents[0].payloadDigest, graph.sourceConcept.artifactDigest);
  });
});

test("a missing, foreign or digest-mismatched graph parent fails closed", async () => {
  await withStore(async (store) => {
    const projectId = crypto.randomUUID();
    const concept = parseStoryConceptWire(wireConcept());
    const graph = compileCanonicalStoryGraph({ concept, mechanics: mechanics() });
    await assert.rejects(
      store.createArtifact({
        projectId,
        artifactType: "canonical_story_graph",
        payload: graph,
        parents: [{ artifactId: crypto.randomUUID(), artifactType: "story_concept", payloadDigest: concept.validation.artifactDigest }],
        provenance: provenance("deterministic_compiler"),
      }),
      (error) => error instanceof NarrativeV3ArtifactStoreError && error.code === "artifact_parent_missing",
    );
    await assert.rejects(
      store.createArtifact({
        projectId,
        artifactType: "canonical_story_graph",
        payload: graph,
        parents: [{ artifactId: crypto.randomUUID(), artifactType: "story_concept", payloadDigest: "f".repeat(64) }],
        provenance: provenance("deterministic_compiler"),
      }),
      (error) => error instanceof NarrativeV3ArtifactStoreError && error.code === "artifact_parent_digest_mismatch",
    );
  });
});

test("concurrent compare-and-set promotion has exactly one winner", async () => {
  await withStore(async (store) => {
    const projectId = crypto.randomUUID();
    const first = (await store.createArtifact({
      projectId,
      artifactType: "story_concept",
      payload: parseStoryConceptWire(wireConcept("Premier concept")),
      provenance: provenance(),
    })).artifact;
    const second = (await store.createArtifact({
      projectId,
      artifactType: "story_concept",
      payload: parseStoryConceptWire(wireConcept("Concept concurrent")),
      provenance: provenance(),
    })).artifact;
    const results = await Promise.all([
      store.promoteArtifact({ projectId, artifactType: "story_concept", artifactId: first.id, expectedPointerRevision: 0 }),
      store.promoteArtifact({ projectId, artifactType: "story_concept", artifactId: second.id, expectedPointerRevision: 0 }),
    ]);
    const winner = results.find((result) => result.promoted);
    const loser = results.find((result) => !result.promoted);

    assert.ok(winner);
    assert.equal(loser.reason, "cas_mismatch");
    assert.equal((await store.getCurrentPointer(projectId, "story_concept")).artifactId, winner.pointer.artifactId);
    const replay = await store.promoteArtifact({
      projectId,
      artifactType: "story_concept",
      artifactId: winner.pointer.artifactId,
      expectedPointerRevision: 0,
    });
    assert.equal(replay.promoted, true);
    assert.equal(replay.idempotent, true);
    assert.equal(replay.pointer.pointerRevision, 1);
    assert.equal(replay.pointer.artifactRevision, winner.pointer.artifactRevision);
  });
});

test("a current pointer can advance but can never roll back to an older artifact revision", async () => {
  await withStore(async (store) => {
    const projectId = crypto.randomUUID();
    const older = (await store.createArtifact({
      projectId,
      artifactType: "story_concept",
      payload: parseStoryConceptWire(wireConcept("Ancienne version")),
      provenance: provenance(),
    })).artifact;
    const newer = (await store.createArtifact({
      projectId,
      artifactType: "story_concept",
      payload: parseStoryConceptWire(wireConcept("Nouvelle version")),
      provenance: provenance(),
    })).artifact;
    const first = await store.promoteArtifact({
      projectId,
      artifactType: "story_concept",
      artifactId: newer.id,
      expectedPointerRevision: 0,
    });
    const rollback = await store.promoteArtifact({
      projectId,
      artifactType: "story_concept",
      artifactId: older.id,
      expectedPointerRevision: first.pointer.pointerRevision,
    });

    assert.equal(first.pointer.artifactRevision, 2);
    assert.equal(rollback.promoted, false);
    assert.equal(rollback.reason, "non_monotonic_artifact");
    assert.equal((await store.getCurrentPointer(projectId, "story_concept")).artifactId, newer.id);
  });
});

test("restart replay preserves exact artifacts and the current pointer", async () => {
  await withStore(async (store, filePath) => {
    const projectId = crypto.randomUUID();
    const artifact = (await store.createArtifact({
      projectId,
      artifactType: "story_concept",
      payload: parseStoryConceptWire(wireConcept()),
      provenance: provenance(),
    })).artifact;
    await store.promoteArtifact({ projectId, artifactType: "story_concept", artifactId: artifact.id, expectedPointerRevision: 0 });

    const restarted = new JsonNarrativeV3ArtifactStore(filePath);
    assert.deepEqual(await restarted.getArtifact(artifact.id), artifact);
    assert.equal((await restarted.getCurrentPointer(projectId, "story_concept")).artifactDigest, artifact.payloadDigest);
    assert.equal((await restarted.createArtifact({
      projectId,
      artifactType: "story_concept",
      payload: artifact.payload,
      provenance: provenance(),
    })).created, false);
  });
});

test("a persisted payload corruption is rejected on load instead of normalized", async () => {
  await withStore(async (store, filePath) => {
    const projectId = crypto.randomUUID();
    const artifact = (await store.createArtifact({
      projectId,
      artifactType: "story_concept",
      payload: parseStoryConceptWire(wireConcept()),
      provenance: provenance(),
    })).artifact;
    const ledger = JSON.parse(await fs.readFile(filePath, "utf8"));
    ledger.artifacts[artifact.id].payload.title = "Titre modifié après scellement";
    await fs.writeFile(filePath, JSON.stringify(ledger), "utf8");

    const restarted = new JsonNarrativeV3ArtifactStore(filePath);
    await assert.rejects(restarted.getArtifact(artifact.id), /strict Narrative V3 contract|digest/i);
  });
});

test("rejected artifacts and unbounded provenance cannot be promoted or persisted", async () => {
  await withStore(async (store) => {
    const projectId = crypto.randomUUID();
    await assert.rejects(
      store.createArtifact({
        projectId,
        artifactType: "story_concept",
        payload: parseStoryConceptWire(wireConcept()),
        provenance: { ...provenance(), customerText: "private" },
      }),
      (error) => error instanceof NarrativeV3ArtifactStoreError && error.code === "invalid_provenance",
    );
    const rejected = (await store.createArtifact({
      projectId,
      artifactType: "story_concept",
      payload: parseStoryConceptWire(wireConcept()),
      state: "rejected",
      provenance: provenance(),
    })).artifact;
    await assert.rejects(
      store.promoteArtifact({ projectId, artifactType: "story_concept", artifactId: rejected.id, expectedPointerRevision: 0 }),
      (error) => error instanceof NarrativeV3ArtifactStoreError && error.code === "artifact_not_promotable",
    );
  });
});

test("PostgreSQL migration enforces immutable ancestry and CAS pointer integrity", async () => {
  const migration = await fs.readFile("db/migrations/016_narrative_v3_artifacts.sql", "utf8");
  const implementation = await fs.readFile("src/services/narrativeV3ArtifactStore.js", "utf8");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS narrative_artifacts/);
  assert.match(migration, /UNIQUE \(project_id, artifact_type, payload_digest\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS narrative_artifact_parents/);
  assert.match(migration, /FOREIGN KEY \(parent_artifact_id, project_id, parent_digest\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS narrative_project_pointers/);
  assert.match(migration, /FOREIGN KEY \(artifact_id, project_id, artifact_type, artifact_digest, artifact_revision\)/);
  assert.match(implementation, /SELECT id FROM book_projects WHERE id=\$1 FOR UPDATE/);
  assert.match(implementation, /pointer_revision=\$6 RETURNING/);
  assert.match(implementation, /ON CONFLICT \(project_id,artifact_type\) DO NOTHING RETURNING/);
  assert.doesNotMatch(implementation, /UPDATE narrative_artifacts/);
  assert.doesNotMatch(implementation, /DELETE FROM narrative_artifacts/);
});
