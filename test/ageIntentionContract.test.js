import assert from "node:assert/strict";
import test from "node:test";

import { createPagePlan } from "../src/config/bookStructure.js";
import { readingAgeProfile } from "../src/config/readingGuidance.js";
import {
  AGE_INTENTION_CONTRACT_VERSION,
  ageIntentionContractIssues,
  ageIntentionContractStructuralIssues,
  createAgeIntentionContract,
} from "../src/services/ageIntentionContract.js";
import { normalizeStoryScenario, validateStoryScenario } from "../src/services/storyScenario.js";
import { scopeAutomaticRepairCandidate } from "../src/services/storyScenarioGeneration.js";

const COMPLETE_INTENTION = Object.freeze({
  story_intent_id: "approach_1",
  story_seed_id: "discovery",
  story_intent_desired_change: "PRIVATE_DESIRED_CHANGE",
  story_intent_protective_doubt: "PRIVATE_PROTECTIVE_DOUBT",
  story_intent_motivation: "PRIVATE_MOTIVATION",
  story_intent_first_step: "PRIVATE_FIRST_STEP",
  story_seed_effort: "PRIVATE_EFFORT",
  story_seed_active_role: "PRIVATE_ACTIVE_ROLE",
  story_intent_reward: "PRIVATE_REWARD",
  story_intent_message: "PRIVATE_MESSAGE",
});

test("exact ages select five deterministic conceptual-complexity profiles", () => {
  const cases = [
    [4, "early", 2],
    [6, "emerging", 3],
    [8, "independent", 4],
    [10, "advanced", 5],
    [12, "preteen", 6],
  ];
  for (const [age, profileId, maximumSteps] of cases) {
    const profile = readingAgeProfile(age);
    const contract = createAgeIntentionContract({ ...COMPLETE_INTENTION, age }, createPagePlan(44));
    assert.equal(profile.id, profileId);
    assert.equal(contract.ageProfile.id, profileId);
    assert.equal(contract.ageProfile.age, age);
    assert.equal(contract.ageProfile.maximumCausalStepsPerScene, maximumSteps);
    assert.deepEqual(ageIntentionContractStructuralIssues(
      contract,
      createPagePlan(44).filter((page) => page.page_type === "image"),
    ), []);
  }
});

test("the contract references authoritative fields without duplicating private answers", () => {
  const plan = createPagePlan(32);
  const contract = createAgeIntentionContract({ ...COMPLETE_INTENTION, age: 8 }, plan);
  const serialized = JSON.stringify(contract);
  assert.equal(contract.version, AGE_INTENTION_CONTRACT_VERSION);
  assert.match(serialized, /story_intent_desired_change/);
  assert.match(serialized, /story_intent_message/);
  assert.doesNotMatch(serialized, /PRIVATE_/);
  assert.equal(contract.childAgency.minimumDistinctAttempts, 3);
  assert.ok(contract.childAgency.attemptStoryRoles.includes("challenge_and_choice"));
  assert.deepEqual(ageIntentionContractIssues(contract, {
    answers: { ...COMPLETE_INTENTION, age: 8 },
    pagePlan: plan,
  }), []);
});

test("base questionnaire fields remain deterministic fallbacks when no intention was selected", () => {
  const contract = createAgeIntentionContract({
    age: 6,
    dream: "Créer un passage",
    challenge: "Oser recommencer",
    message: "On peut changer de stratégie",
  }, createPagePlan(24));
  const milestones = new Map(contract.intentionAuthority.milestones.map((item) => [item.id, item]));
  assert.equal(milestones.get("desired_change").authoritativeSourceField, "dream");
  assert.equal(milestones.get("protective_doubt").authoritativeSourceField, "challenge");
  assert.equal(milestones.get("inner_realization").authoritativeSourceField, "message");
  assert.equal(contract.childAgency.minimumDistinctAttempts, 2);
});

test("scenario normalization persists only the server contract and validation catches tampering", () => {
  const pagePlan = createPagePlan(24);
  const answers = { ...COMPLETE_INTENTION, age: 8 };
  const authoritative = createAgeIntentionContract(answers, pagePlan);
  const candidate = {
    title: "Synthetic arc",
    summary: "Synthetic arc for deterministic contract validation.",
    age_intention_contract: { version: 999 },
    scenes: pagePlan.filter((page) => page.page_type === "image").map((page) => ({
      scene_number: page.scene_number,
      title: `Scene ${page.scene_number}`,
      location_before: "atelier",
      location_after: "atelier",
      action: `Action ${page.scene_number}`,
      prerequisite_scene_ids: page.scene_number > 1 ? [`scene-${page.scene_number - 1}`] : [],
    })),
  };
  const scenario = normalizeStoryScenario(candidate, {
    pagePlan,
    ageIntentionContract: authoritative,
  });
  assert.deepEqual(scenario.ageIntentionContract, authoritative);
  scenario.ageIntentionContract.messageDelivery.maximumExplicitFormulations = 2;
  assert.ok(validateStoryScenario(scenario).issues.includes(
    "age-intention contract allows only one explicit message formulation",
  ));
});

test("targeted repair never migrates a legacy scenario contract implicitly", () => {
  const legacy = { scenes: [{ sceneNumber: 1, title: "Legacy" }] };
  const scoped = scopeAutomaticRepairCandidate({
    ageIntentionContract: createAgeIntentionContract({ age: 8 }, createPagePlan(24)),
    scenes: [{ sceneNumber: 1, title: "Candidate" }],
  }, legacy, { publicSummary: { sceneNumbers: [1] } });
  assert.equal(Object.hasOwn(scoped, "ageIntentionContract"), false);
});
