import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { compileNarrativeBookSpecV3 } from "../src/contracts/narrativeBookSpecV3.js";
import { compileObjectLifecycleProjection } from "../src/contracts/objectLifecycleProjection.js";
import {
  compileSceneProseAuthority,
  mentionedCharacterIds,
  sceneProseCharacterIssues,
} from "../src/contracts/sceneProseAuthorityV1.js";
import { manuscriptSceneContract } from "../src/services/narrativeBookSpecLifecycle.js";
import { buildNarrativeV3ObjectFixture } from "../src/services/narrativeV3ObjectLifecycleMatrix.js";
import {
  manuscriptSceneCastIssues,
  normalizeManuscriptSceneCast,
} from "../src/services/manuscriptSceneCastPreflight.js";

function fixture() {
  const source = buildNarrativeV3ObjectFixture({ language: "FR", universeId: "coral_ocean" });
  const spec = compileNarrativeBookSpecV3({
    intent: source.intent,
    graph: source.graph,
    objectProjection: compileObjectLifecycleProjection({ graph: source.graph }),
    profileBindings: source.profileBindings,
  });
  return structuredClone(spec);
}

function withContextualTraveler() {
  const spec = {
    registries: {
      characters: [
        { id: "character_hero", displayName: "Mathéo", familyAddress: "" },
        { id: "character_companion", displayName: "Nolan", familyAddress: "son frère" },
      ],
    },
    scenes: [{
      sceneNumber: 2,
      presences: [{ characterId: "character_hero", mode: "physical" }],
      transition: { travelerCharacterIds: ["character_companion"] },
      movements: [],
    }],
  };
  const scene = spec.scenes[0];
  return { spec, scene };
}

function withAbsentCharacter() {
  const spec = fixture();
  const scene = spec.scenes.find((entry) => (
    spec.registries.characters.some((character) => (
      !(entry.presences || []).some((presence) => presence.characterId === character.id)
    ))
  ));
  const forbidden = spec.registries.characters.find((character) => (
    !(scene.presences || []).some((presence) => presence.characterId === character.id)
  ));
  assert.ok(scene);
  assert.ok(forbidden);
  return { spec, scene, forbidden };
}

test("V22 keeps a contextual transition traveler out of the page prose registry", () => {
  const { spec, scene } = withContextualTraveler();
  const authority = compileSceneProseAuthority({ spec, sceneNumber: scene.sceneNumber });
  assert.ok(authority.contextual_traveler_character_ids.includes("character_companion"));
  assert.ok(!authority.allowed_character_ids.includes("character_companion"));
});

test("V22 gives the manuscript contract only the exact scene cast", () => {
  const { spec, scene, forbidden } = withAbsentCharacter();
  const authority = compileSceneProseAuthority({ spec, sceneNumber: scene.sceneNumber });
  const contract = manuscriptSceneContract(spec, scene.sceneNumber);
  assert.ok(!contract.registry.characters.some((character) => character.id === forbidden.id));
  assert.deepEqual(contract.prose_authority, authority);
});

test("V22 recognizes canonical names and family forms through one mention authority", () => {
  const characters = [{
    id: "character_parent",
    displayName: "Alexandra",
    canonicalName: "Alexandra",
    familyAddress: "Maman",
  }];
  assert.deepEqual(mentionedCharacterIds("Maman sourit à Alexandra.", characters), ["character_parent"]);
});

test("V22 detects the production counterexample before word normalization", () => {
  const { spec, scene, forbidden } = withAbsentCharacter();
  const forbiddenName = forbidden.displayName;
  const pageNumber = scene.pageBinding.textPageNumber;
  const issues = manuscriptSceneCastIssues({ spec, pageTexts: { [pageNumber]: `${forbiddenName} traverse le passage.` } });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].pageNumber, pageNumber);
  assert.deepEqual(issues[0].unexpectedCharacterIds, [forbidden.id]);
  assert.equal(sceneProseCharacterIssues({
    spec,
    sceneNumber: scene.sceneNumber,
    pageNumber,
    text: `${forbiddenName} traverse le passage.`,
  }).length, 1);
});

test("V22 repairs only the invalid page and preserves authorized named mentions", async () => {
  const { spec, scene, forbidden } = withAbsentCharacter();
  const pageNumber = scene.pageBinding.textPageNumber;
  const allowed = spec.registries.characters.find((character) => (
    scene.presences.some((presence) => presence.characterId === character.id)
  ));
  const otherPage = spec.pages.find((page) => page.kind === "scene_text" && page.pageNumber !== pageNumber).pageNumber;
  const texts = {
    [pageNumber]: `${allowed.displayName} avance avec ${forbidden.displayName}.`,
    [otherPage]: "Texte intact.",
  };
  const result = await normalizeManuscriptSceneCast({
    spec,
    pageTexts: texts,
    repair: async ({ pages }) => ({
      pages: pages.map((page) => ({
        page_number: page.page_number,
        text: `${allowed.displayName} avance avec prudence.`,
      })),
    }),
  });
  assert.equal(result.status, "normalized");
  assert.deepEqual(result.changedPageNumbers, [pageNumber]);
  assert.equal(result.pageTexts[otherPage], texts[otherPage]);
  assert.equal(manuscriptSceneCastIssues({ spec, pageTexts: result.pageTexts }).length, 0);
});

test("V22 rejects a cast repair that removes an authorized named person", async () => {
  const { spec, scene, forbidden } = withAbsentCharacter();
  const pageNumber = scene.pageBinding.textPageNumber;
  const allowed = spec.registries.characters.find((character) => (
    scene.presences.some((presence) => presence.characterId === character.id)
  ));
  await assert.rejects(
    normalizeManuscriptSceneCast({
      spec,
      pageTexts: { [pageNumber]: `${allowed.displayName} avance avec ${forbidden.displayName}.` },
      repair: async () => ({ pages: [{ page_number: pageNumber, text: "Une silhouette avance." }] }),
    }),
    (error) => error.code === "manuscript_scene_cast_allowed_mention_drift",
  );
});

test("production orders scene-cast authority before V21 words and V20 text authority", () => {
  const source = fs.readFileSync(new URL("../src/routes/preview.js", import.meta.url), "utf8");
  const cast = source.indexOf("normalizeManuscriptSceneCast({");
  const words = source.indexOf("normalizeManuscriptWordTargets({");
  const authority = source.indexOf("prepareNarrativeV3ProductionTextAuthority({");
  assert.ok(cast > 0);
  assert.ok(words > cast);
  assert.ok(authority > words);
});
