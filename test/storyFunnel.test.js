import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { UNIVERSE_OPTIONS } from "../src/config/bookOptions.js";
import { normalizeStorySuggestions } from "../src/services/storySuggestions.js";
import { normalizeStoryIntentions } from "../src/services/storyIntentions.js";
import { normalizeBookRequest } from "../src/services/normalizeBookRequest.js";
import { UI_TEXT } from "../public/i18n.js";

test("every universe has a likeness example and a causal story contract", async () => {
  assert.equal(UNIVERSE_OPTIONS.length, 6);
  for (const universe of UNIVERSE_OPTIONS) {
    assert.match(universe.previewImage, /-likeness\.webp$/);
    assert.ok(universe.referenceImage);
    assert.ok(universe.storyContract?.adventureZone);
    assert.ok(universe.storyContract?.entryRule);
    assert.ok(Array.isArray(universe.storyContract?.physicalRules));
    assert.ok(Array.isArray(universe.storyContract?.requiredMechanisms));
    await fs.access(`public${universe.previewImage}`);
    await fs.access(`public${universe.referenceImage}`);
  }
});

test("story suggestions require all three distinct inspiration lanes", () => {
  const complete = normalizeStorySuggestions({ suggestions: [
    { id: "creation", title: "C", dream: "d", challenge: "c", first_step: "f", effort: "e", reward: "r", adventure: "a", moment: "m", transformation: "t" },
    { id: "teamwork", title: "T", dream: "d", challenge: "c", first_step: "f", effort: "e", reward: "r", adventure: "a", moment: "m", transformation: "t" },
    { id: "discovery", title: "D", dream: "d", challenge: "c", first_step: "f", effort: "e", reward: "r", adventure: "a", moment: "m", transformation: "t" },
  ] });
  assert.deepEqual(complete.map((suggestion) => suggestion.id), ["teamwork", "discovery", "creation"]);
  assert.deepEqual(complete.map((suggestion) => suggestion.approach), ["relational", "symbolic", "action"]);
  assert.ok(complete.every((suggestion) => suggestion.starting_point && suggestion.active_role && suggestion.resolution && suggestion.message && suggestion.emotional_tone));
  assert.equal(normalizeStorySuggestions({ suggestions: complete.slice(0, 2) }).length, 2);
});

test("parent situation is normalized into exactly three intention approaches", () => {
  const complete = normalizeStoryIntentions({ intentions: [
    { id: "approach_3", title: "C", understanding: "u", desired_change: "d", protective_doubt: "p", first_step: "f", motivation: "m", reward: "r", message: "x" },
    { id: "approach_1", title: "A", understanding: "u", desired_change: "d", protective_doubt: "p", first_step: "f", motivation: "m", reward: "r", message: "x" },
    { id: "approach_2", title: "B", understanding: "u", desired_change: "d", protective_doubt: "p", first_step: "f", motivation: "m", reward: "r", message: "x" },
  ] });
  assert.deepEqual(complete.map((intention) => intention.id), ["approach_1", "approach_2", "approach_3"]);
  assert.equal(normalizeStoryIntentions({ intentions: complete.slice(0, 2) }).length, 2);
});

test("the intention-first creator is fully localized in French, Spanish and English", () => {
  for (const locale of ["FR", "ES", "EN"]) {
    for (const key of ["stepIntention", "stepAdventure", "intentionAgeTitle", "intentionAgeLead", "intentionNeedsAge", "intentionQuestion", "interpretIntention", "moreIntentionPerspectives", "intentionPerspectiveLimit", "intentionPerspectivePage", "previousPerspectives", "nextPerspectives", "chooseIntention", "intentionFirstStep", "intentionMotivation", "intentionReward", "adventureProposalTitle", "suggestionEffort", "intentionSelectionRequired", "adventureSuggestionsLoading", "adventureSuggestionRequired"]) {
      assert.ok(UI_TEXT[locale][key], `${locale}.${key}`);
    }
  }
});

test("normalized intake locks the selected universe contract and story seed", () => {
  const normalized = normalizeBookRequest({ questionnaire: {
    hero_name: "Lina",
    age: "7",
    universe_id: "coral_ocean",
    story_seed_id: "discovery",
    story_seed_title: "Le jardin des voix",
    story_seed_approach: "symbolic",
    story_seed_starting_point: "Lina entend une note au bord du récif.",
    story_seed_first_step: "Écouter une note.",
    story_seed_effort: "Lina essaie, hésite et recommence.",
    story_seed_active_role: "Lina compare les sons et choisit une piste.",
    story_seed_reward: "Elle rejoint le concert du récif.",
    story_seed_adaptation: "Lina suit une mélodie dans le récif.",
    story_seed_moment: "Elle ouvre le passage.",
    story_seed_resolution: "Lina demande de l'aide puis ouvre le passage.",
    story_seed_message: "Demander de l'aide permet d'avancer.",
    story_seed_emotional_tone: "Hésitation, curiosité puis fierté.",
    story_seed_transformation: "Elle ose demander de l'aide.",
    creator_situation: "Lina n'ose pas demander de l'aide.",
    story_intent_id: "approach_1",
    story_intent_title: "Oser demander",
    story_intent_first_step: "Dire un mot à une personne de confiance.",
    story_intent_reward: "Se sentir entourée.",
  } });
  assert.equal(normalized.answers.story_seed_id, "discovery");
  assert.equal(normalized.answers.story_seed_title, "Le jardin des voix");
  assert.equal(normalized.answers.story_seed_approach, "symbolic");
  assert.match(normalized.answers.story_seed_active_role, /choisit/);
  assert.equal(normalized.answers.story_intent_id, "approach_1");
  assert.equal(normalized.answers.story_seed_reward, "Elle rejoint le concert du récif.");
  assert.match(normalized.answers.universe_story_contract.id, /coral_ocean/);
  assert.ok(normalized.answers.universe_story_contract.requiredMechanisms.length);
});

test("the creator exposes the seven-step intention-first adventure funnel", async () => {
  const [html, app, intentionRoute, intentionPrompt, suggestionRoute, auditPrompt] = await Promise.all([
    fs.readFile("public/index.html", "utf8"),
    fs.readFile("public/app.js", "utf8"),
    fs.readFile("src/routes/storyIntentions.js", "utf8"),
    fs.readFile("src/prompts/story_intentions.txt", "utf8"),
    fs.readFile("src/routes/storySuggestions.js", "utf8"),
    fs.readFile("src/prompts/story_scenario_audit.txt", "utf8"),
  ]);
  assert.equal((html.match(/data-panel="/g) || []).length, 7);
  assert.match(html, /data-panel="0"[\s\S]*id="intentionAgeQuestion"[\s\S]*id="creator_situation"[\s\S]*id="storyIntentionGrid"/);
  assert.match(html, /data-panel="2"[\s\S]*id="universeGrid"[\s\S]*id="storySuggestionGrid"/);
  assert.match(html, /id="scenarioWorldContract"/);
  assert.match(app, /const STEP_COUNT = 7/);
  assert.match(app, /const FLOW_VERSION = 6/);
  assert.match(app, /Number\(saved\.flowVersion \|\| 0\) >= 2 \? saved\.step/);
  assert.match(app, /requestStoryIntentions/);
  assert.match(app, /storyIntentionBatches/);
  assert.match(app, /intentionSessionId/);
  assert.match(app, /requestId: newIntentionSessionId\(\)/);
  assert.match(app, /previousIntentionPerspectives/);
  assert.match(app, /previousInterpretations: state\.storyIntentions/);
  assert.match(app, /childAge,/);
  assert.match(app, /selectedIntention: intention/);
  assert.match(app, /universe_story_contract/);
  assert.match(app, /message\.value = suggestion\.message \|\| suggestion\.transformation/);
  assert.match(app, /readingGuidanceProfiles/);
  assert.match(app, /suggestionApproach_/);
  assert.match(app, /selectedStoryIntention\(\)[\s\S]*state\.storySuggestions\.length/);
  assert.match(app, /elements\.nextButton\.disabled = state\.step === 2 && state\.storySuggestionsBusy/);
  assert.match(app, /state\.storySuggestionsError = activeSafetyIntervention\(\)/);
  assert.match(app, /tr\("intentionSelectionRequired"\)/);
  assert.match(app, /tr\("adventureSuggestionsLoading"\)/);
  assert.match(app, /tr\("adventureSuggestionRequired"\)/);
  assert.match(intentionRoute, /MAX_ATTEMPTS = 6/);
  assert.match(intentionRoute, /reserveIntentionIdeationRound/);
  assert.match(intentionRoute, /completeIntentionIdeationRound/);
  assert.match(intentionRoute, /releaseIntentionIdeationRound/);
  assert.match(intentionRoute, /intentions\.length !== 3/);
  assert.match(intentionRoute, /intention_ideation_limit_reached/);
  assert.match(intentionRoute, /childAge/);
  assert.doesNotMatch(intentionRoute, /findUniverse|heroName|favoriteActivities/);
  assert.match(intentionPrompt, /first step of the creator journey/i);
  assert.match(intentionPrompt, /exact age is known/i);
  assert.match(intentionPrompt, /adapt vocabulary, emotional nuance, expected autonomy/i);
  assert.match(intentionPrompt, /name, personality, interests and adventure universe have deliberately not been chosen/i);
  assert.match(suggestionRoute, /selectedIntention/);
  assert.match(auditPrompt, /universe_story_contract/);
  assert.match(auditPrompt, /confirmed story intention/);
  assert.match(auditPrompt, /decisive action instead of the child/);
  assert.match(auditPrompt, /merely decorative/);
  assert.match(auditPrompt, /sensitive family or psychological facts/i);
  assert.match(auditPrompt, /same narrative function/i);
});

test("secondary reference photos require an explicit relationship and narrative role", async () => {
  const app = await fs.readFile("public/app.js", "utf8");

  assert.match(app, /state\.photos\.some\(\(photo\) => photo\.role === "child"\) \? "" : "child"/);
  assert.match(app, /const storyRole = role === "child" \? "hero" : ""/);
  assert.match(app, /<option value=""[\s\S]*photoRoleChoice/);
  assert.match(app, /state\.photos\.some\(\(photo\) => !photo\.role\)/);
  assert.match(app, /state\.photos\.some\(\(photo\) => !photo\.storyRole\)/);
  assert.match(app, /\["family", "other"\]\.includes\(photo\.role\) && !photo\.relationship\.trim\(\)/);

  for (const locale of ["FR", "ES", "EN"]) {
    for (const key of ["photoRelationshipLabel", "photoRoleChoice", "photoStoryRoleLabel", "photoStoryRoleChoice", "invalidPhotoRole", "invalidPhotoStoryRole", "invalidPhotoRelationship"]) {
      assert.ok(UI_TEXT[locale][key], `${locale}.${key}`);
    }
  }
});
