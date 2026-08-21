import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import {
  assertStoryConceptFollowsNarrativeBrief,
  buildNarrativeBriefV1,
  loadNarrativeBriefV1,
  narrativeBriefForModel,
} from "../src/contracts/narrativeBriefV1.js";
import { parseStoryConceptWire } from "../src/contracts/narrativeV3Canonical.js";
import { buildWorldLawContractV1 } from "../src/contracts/worldLawContractV1.js";
import { buildNarrativeV3ProjectSource } from "../src/services/narrativeV3ProductionShadow.js";

function project({ pageCount = 32, universeId = "coral_ocean" } = {}) {
  return {
    id: crypto.randomUUID(),
    questionnaire: {
      hero_name: "Mathéo",
      age: 8,
      favorite_activities: "inventer et observer",
      personality: "curieux et attentif",
      dream: "oser recommencer avec son frère",
      challenge: "il craint qu'une erreur déçoive les autres",
      message: "une erreur peut devenir une étape partagée",
      creator_situation: "Mathéo abandonne parfois après une erreur",
      story_intent_id: "shared_retry",
      story_intent_understanding: "Mathéo veut protéger sa confiance",
      story_intent_desired_change: "Mathéo choisit de recommencer calmement",
      story_intent_protective_doubt: "Il redoute de rater encore devant sa famille",
      story_intent_first_step: "Il nomme ce qui n'a pas fonctionné",
      story_intent_motivation: "Son frère accepte de chercher avec lui",
      story_intent_reward: "Ils réussissent une création qui leur appartient",
      story_intent_message: "On peut observer, ajuster et recommencer ensemble",
      story_seed_id: "coral_workshop",
      story_seed_approach: "action",
      story_seed_title: "Le trésor des bulles partagées",
      story_seed_starting_point: "Une carte de corail révèle un atelier sous-marin",
      story_seed_first_step: "Mathéo compare deux signes sur la carte",
      story_seed_effort: "Il teste trois pistes en observant leurs conséquences",
      story_seed_active_role: "Mathéo choisit la piste et explique son raisonnement",
      story_seed_reward: "Les deux frères ouvrent le jardin lumineux",
      story_seed_resolution: "Ils reviennent raconter leur méthode à leurs parents",
      story_seed_adaptation: "La quête utilise la flottabilité et des bulles individuelles",
      story_seed_moment: "Mathéo arrête le groupe et corrige lui-même le dernier trajet",
      story_seed_transformation: "Il comprend qu'ajuster son idée est une force",
      story_seed_message: "Recommencer autrement fait avancer",
      story_seed_emotional_tone: "merveilleux, rassurant et actif",
      universe_id: universeId,
      style_id: "soft_watercolor",
      language: "FR",
      page_count: pageCount,
      product_type: "ebook",
      font_style: "rounded",
      child_safety_profile: { version: 2, category: "general", action: "allow", restricted: false },
      story_sensitivity_profile: { version: 2, level: 1, category: "everyday_challenge", restricted: false },
    },
    photoRefs: [
      { id: "hero-photo", role: "child", story_role: "hero", name: "Mathéo", relationship: "héros" },
      { id: "brother-photo", role: "friend", story_role: "companion", name: "Nolan", relationship: "petit frère" },
      { id: "mother-photo", role: "family", story_role: "guide", name: "Alexandra", relationship: "maman" },
      { id: "father-photo", role: "family", story_role: "supporter", name: "Jérôme", relationship: "papa" },
    ],
  };
}

function briefFor(options) {
  const source = buildNarrativeV3ProjectSource(project(options));
  const worldLaw = buildWorldLawContractV1(source.intent);
  return buildNarrativeBriefV1({
    creationIntent: source.intent,
    worldLaw,
    normalized: source.normalized,
    semanticSource: source.semanticSource,
  });
}

function wireFromBrief(brief) {
  return {
    schema_version: 1,
    contract_id: "calitiki.story-concept-wire.v1",
    language: brief.language,
    title: "Le trésor des bulles partagées",
    premise: "Mathéo apprend à observer et recommencer avec Nolan.",
    theme_proof: "Son propre choix rend le dernier trajet possible.",
    hero_arc: {
      desire: brief.narrativeAuthority.desiredChange,
      initial_doubt: brief.narrativeAuthority.protectiveDoubt,
      decisive_choice: brief.narrativeAuthority.childOwnedAction,
      earned_change: brief.narrativeAuthority.transformation,
    },
    beats: brief.scenePlan.map((scene) => ({
      beat_key: scene.beatKey,
      purpose: scene.purpose,
      summary: `Mathéo accomplit l'étape ${scene.sceneNumber} en respectant le milieu.`,
      emotional_shift: `L'émotion évolue à l'étape ${scene.sceneNumber}.`,
      distinctive_image: `L'instant distinctif de l'étape ${scene.sceneNumber}.`,
      participant_keys: [...scene.participantKeys],
    })),
  };
}

test("NarrativeBrief.v1 preserves every selected intention and story-seed authority", () => {
  const brief = briefFor();
  assert.equal(brief.narrativeAuthority.protectiveDoubt, "Il redoute de rater encore devant sa famille");
  assert.equal(brief.narrativeAuthority.accessibleFirstStep, "Il nomme ce qui n'a pas fonctionné");
  assert.equal(brief.narrativeAuthority.childOwnedAction, "Mathéo choisit la piste et explique son raisonnement");
  assert.equal(brief.narrativeAuthority.adventureAdaptation, "La quête utilise la flottabilité et des bulles individuelles");
  assert.equal(brief.narrativeAuthority.peakMoment, "Mathéo arrête le groupe et corrige lui-même le dernier trajet");
  assert.equal(brief.narrativeAuthority.transformation, "Il comprend qu'ajuster son idée est une force");
  assert.equal(brief.provenance.find((entry) => entry.authorityKey === "child_owned_action").sourceField, "story_seed_active_role");
  assert.equal(loadNarrativeBriefV1(structuredClone(brief)).validation.artifactDigest, brief.validation.artifactDigest);
  assert.equal(Object.isFrozen(brief), true);
});

test("the brief exposes typed underwater physics before creative generation", () => {
  const brief = briefFor();
  assert.equal(brief.worldRules.adventure.mediumId, "fully_underwater");
  assert.equal(brief.worldRules.adventure.gravityModelId, "underwater_buoyancy");
  assert.ok(brief.worldRules.adventure.locomotionIds.includes("swim"));
  assert.ok(brief.worldRules.adventure.allowedPostureIds.includes("float"));
  assert.deepEqual(brief.worldRules.adventure.requiredSurvivalMechanismIds, ["breathing_voice_bubble"]);
  assert.ok(brief.worldRules.forbiddenElementIds.includes("unprotected_breathing_person"));
  assert.equal(narrativeBriefForModel(brief).world_rules.adventure.mediumId, "fully_underwater");
});

test("the deterministic participation plan separates travelers from origin witnesses", () => {
  const brief = briefFor();
  assert.deepEqual(brief.castPlan.travelerKeys, ["hero", "nolan"]);
  assert.deepEqual(brief.castPlan.originWitnessKeys, ["alexandra", "jerome"]);
  const crossing = brief.scenePlan.findIndex((scene) => scene.purpose === "crossing");
  const returning = brief.scenePlan.findIndex((scene) => scene.purpose === "return");
  assert.ok(crossing > 0 && returning > crossing);
  for (const scene of brief.scenePlan.slice(crossing, returning + 1)) {
    assert.deepEqual(scene.participantKeys, brief.castPlan.travelerKeys);
  }
  assert.ok(brief.scenePlan.some((scene) => scene.participantKeys.includes("alexandra")));
  assert.ok(brief.scenePlan.some((scene) => scene.participantKeys.includes("jerome")));
});

test("every sellable format receives one complete ordered narrative spine", () => {
  for (const pageCount of [24, 28, 32, 36, 40, 44]) {
    const brief = briefFor({ pageCount, universeId: "dinosaur_valley" });
    assert.equal(brief.scenePlan.length, (pageCount - 2) / 2);
    assert.deepEqual(brief.scenePlan.map((scene) => scene.sceneNumber), Array.from({ length: brief.sceneCount }, (_, index) => index + 1));
    for (const purpose of ["opening", "preparation", "crossing", "choice", "climax", "return", "resolution"]) {
      assert.equal(brief.scenePlan.filter((scene) => scene.purpose === purpose).length, 1, `${pageCount}:${purpose}`);
    }
    assert.equal(brief.milestones.length, 8);
    assert.ok(brief.milestones.every((milestone) => milestone.sceneNumbers.every((sceneNumber) => sceneNumber <= brief.sceneCount)));
  }
});

test("a creative response cannot reinterpret the selected arc, cast or scene spine", () => {
  const brief = briefFor();
  const valid = parseStoryConceptWire(wireFromBrief(brief));
  assert.equal(assertStoryConceptFollowsNarrativeBrief(brief, valid), true);

  const wrongArcWire = wireFromBrief(brief);
  wrongArcWire.hero_arc.decisive_choice = "Un adulte décide à la place de Mathéo.";
  assert.throws(
    () => assertStoryConceptFollowsNarrativeBrief(brief, parseStoryConceptWire(wrongArcWire)),
    (error) => error.code === "story_concept_narrative_brief_mismatch",
  );

  const wrongTravelerWire = wireFromBrief(brief);
  const crossing = wrongTravelerWire.beats.find((beat) => beat.purpose === "crossing");
  crossing.participant_keys.push("alexandra");
  assert.throws(
    () => assertStoryConceptFollowsNarrativeBrief(brief, parseStoryConceptWire(wrongTravelerWire)),
    (error) => error.code === "story_concept_narrative_brief_mismatch",
  );

  const wrongPurposeWire = wireFromBrief(brief);
  wrongPurposeWire.beats.find((beat) => beat.purpose === "choice").purpose = "attempt";
  assert.throws(
    () => assertStoryConceptFollowsNarrativeBrief(brief, parseStoryConceptWire(wrongPurposeWire)),
    (error) => error.code === "story_concept_narrative_brief_mismatch",
  );
});
