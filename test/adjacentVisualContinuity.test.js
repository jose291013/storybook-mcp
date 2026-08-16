import assert from "node:assert/strict";
import test from "node:test";
import {
  ADJACENT_VISUAL_CONTINUITY_VERSION,
  adjacentApprovedIllustrationReferences,
  adjacentContinuityPageNumbers,
} from "../src/services/adjacentVisualContinuity.js";
import { buildSceneContinuity } from "../src/services/visualContinuity.js";

const blueprintPages = [
  { page_number: 3, page_type: "image", scene_number: 1, scene_title: "Départ", cast_present: ["Bastien"] },
  { page_number: 5, page_type: "image", scene_number: 2, scene_title: "Passage", cast_present: ["Bastien", "Marie"] },
  { page_number: 7, page_type: "image", scene_number: 3, scene_title: "Arrivée", cast_present: ["Bastien", "Marie"] },
];

test("initial generation uses only the nearest previously accepted illustration", () => {
  const references = adjacentApprovedIllustrationReferences({
    blueprintPages,
    draftPages: [
      { page_number: 3, page_type: "image", imageStorageKey: "private/page-3", qualityStatus: "accepted" },
      { page_number: 5, page_type: "image", imageStorageKey: "private/page-5", qualityStatus: "review_required" },
    ],
    currentPageNumber: 7,
  });
  assert.equal(references.length, 1);
  assert.equal(references[0].storageKey, "private/page-3");
  assert.equal(references[0].kind, "adjacent_scene");
  assert.equal(references[0].continuityVersion, ADJACENT_VISUAL_CONTINUITY_VERSION);
  assert.deepEqual(adjacentContinuityPageNumbers(references), [3]);
  assert.match(references[0].label, /current scene contract is authoritative/i);
});

test("a revision may compare the nearest accepted scene on both sides", () => {
  const references = adjacentApprovedIllustrationReferences({
    blueprintPages,
    draftPages: [
      { page_number: 3, page_type: "image", imageStorageKey: "private/page-3", qualityStatus: "accepted" },
      { page_number: 5, page_type: "image", imageStorageKey: "private/page-5", qualityStatus: "accepted" },
      { page_number: 7, page_type: "image", imageStorageKey: "private/page-7", qualityStatus: "accepted_after_repair" },
    ],
    currentPageNumber: 5,
    includeNext: true,
  });
  assert.deepEqual(references.map((reference) => reference.sourcePageNumber), [3, 7]);
  assert.deepEqual(references.map((reference) => reference.relation), ["previous", "next"]);
});

test("paired reader text becomes bounded visual evidence beside the structured scene contract", () => {
  const continuity = buildSceneContinuity({
    blueprint: { hero: { name: "Bastien" }, approved_scenario: { characters: [{ name: "Bastien", role: "child" }] } },
    castPresent: ["Bastien"],
    pairedText: "Bastien pose la perle sur son dessin, près de la fenêtre.",
    structuredSceneContract: {
      main_action: { subject: "Bastien", verb: "pose", target: "la perle" },
      named_characters: [{ name: "Bastien", action: "pose la perle" }],
      required_elements: [{ description: "une perle", quantity: "1", scale: "petite" }],
      spatial_relationships: ["la perle est sur le dessin"],
    },
    adjacentReferenceImages: [{ kind: "adjacent_scene", storageKey: "private/page-3", label: "previous" }],
  });
  assert.equal(continuity.referenceImages[0].kind, "adjacent_scene");
  assert.match(continuity.sceneContract, /PAIRED READER TEXT EVIDENCE/);
  assert.match(continuity.sceneFidelityContract.paired_text_evidence, /pose la perle/);
  assert.ok(continuity.sceneFidelityContract.visual_evidence.some((item) => /pose la perle/i.test(item)));
});

test("visible people carry their active wardrobe into the existing scene-fidelity contract", () => {
  const continuity = buildSceneContinuity({
    blueprint: {
      hero: { name: "Mathéo", outfit_lock: "ordinary blue T-shirt" },
      cast: [
        { name: "Alexandra", role: "family", outfit_lock: "ordinary green blouse" },
        { name: "Kovu", role: "mascot", outfit_lock: "red collar" },
      ],
    },
    characterCanons: [
      { name: "Mathéo", role: "child", outfit_lock: "ordinary blue T-shirt" },
      { name: "Alexandra", role: "family", outfit_lock: "ordinary green blouse" },
      { name: "Kovu", role: "mascot", entity_type: "animal", outfit_lock: "red collar" },
    ],
    castPresent: ["Mathéo", "Alexandra", "Kovu"],
    wardrobeLocks: [
      { name: "Mathéo", outfit: "navy and turquoise full space suit" },
      { name: "Alexandra", outfit: "navy and turquoise full space suit" },
      { name: "Kovu", outfit: "red collar" },
    ],
    structuredSceneContract: {
      main_action: { subject: "Mathéo", verb: "observes", target: "the map" },
      named_characters: [
        { name: "Mathéo", action: "observes the map" },
        { name: "Alexandra", action: "guides Mathéo" },
      ],
    },
  });
  assert.deepEqual(
    continuity.sceneFidelityContract.wardrobe_contracts.map((item) => item.required_outfit),
    ["navy and turquoise full space suit", "navy and turquoise full space suit"],
  );
  assert.match(continuity.characterFingerprints.join("\n"), /FIXED OUTFIT FOR CURRENT SCENE: navy and turquoise full space suit/u);
});
