import { readingAgeProfile } from "../config/readingGuidance.js";

export const AGE_INTENTION_CONTRACT_VERSION = 1;

const AGE_RULES = Object.freeze({
  early: Object.freeze({
    conceptualComplexity: "one_concrete_problem",
    metaphorMode: "visible_and_immediate",
    emotionalReasoning: "name_one_feeling_then_show_one_action",
    maximumConcurrentGoals: 1,
    maximumCausalStepsPerScene: 2,
  }),
  emerging: Object.freeze({
    conceptualComplexity: "simple_linked_actions",
    metaphorMode: "simple_recurring_image",
    emotionalReasoning: "feeling_action_and_visible_consequence",
    maximumConcurrentGoals: 1,
    maximumCausalStepsPerScene: 3,
  }),
  independent: Object.freeze({
    conceptualComplexity: "linked_attempts_and_consequences",
    metaphorMode: "concrete_symbol_with_simple_subtext",
    emotionalReasoning: "mixed_feeling_resolved_through_choice",
    maximumConcurrentGoals: 2,
    maximumCausalStepsPerScene: 4,
  }),
  advanced: Object.freeze({
    conceptualComplexity: "layered_problem_with_clear_main_goal",
    metaphorMode: "layered_but_explainable_symbol",
    emotionalReasoning: "nuanced_feeling_choice_and_consequence",
    maximumConcurrentGoals: 2,
    maximumCausalStepsPerScene: 5,
  }),
  preteen: Object.freeze({
    conceptualComplexity: "nuanced_arc_with_one_coherent_main_goal",
    metaphorMode: "layered_symbolic_subtext",
    emotionalReasoning: "ambivalence_agency_and_earned_insight",
    maximumConcurrentGoals: 2,
    maximumCausalStepsPerScene: 6,
  }),
});

const MILESTONES = Object.freeze([
  Object.freeze({
    id: "desired_change",
    sourceFields: ["story_intent_desired_change", "dream"],
    storyRoles: ["character_and_desire"],
  }),
  Object.freeze({
    id: "protective_doubt",
    sourceFields: ["story_intent_protective_doubt", "challenge"],
    storyRoles: ["external_problem", "internal_problem"],
  }),
  Object.freeze({
    id: "positive_anticipation",
    sourceFields: ["story_intent_motivation", "story_seed_emotional_tone"],
    storyRoles: ["meeting_the_guide", "bond_with_the_guide"],
  }),
  Object.freeze({
    id: "accessible_first_step",
    sourceFields: ["story_intent_first_step", "story_seed_first_step"],
    storyRoles: ["simple_plan", "preparing_the_plan", "call_to_action"],
  }),
  Object.freeze({
    id: "progressive_attempts",
    sourceFields: ["story_seed_effort", "challenge"],
    storyRoles: ["first_attempt", "second_attempt", "clue_and_discovery", "setback_and_learning", "third_attempt"],
  }),
  Object.freeze({
    id: "child_owned_choice",
    sourceFields: ["story_seed_active_role", "story_seed_moment"],
    storyRoles: ["challenge_and_choice", "climax"],
  }),
  Object.freeze({
    id: "earned_reward",
    sourceFields: ["story_intent_reward", "story_seed_reward"],
    storyRoles: ["success_and_transformation", "celebration_with_loved_ones"],
  }),
  Object.freeze({
    id: "inner_realization",
    sourceFields: ["story_intent_message", "story_seed_message", "message"],
    storyRoles: ["return_home_and_moral"],
  }),
]);

function clean(value) {
  return String(value || "").trim();
}

function sceneRoles(pagePlan = []) {
  return new Set((Array.isArray(pagePlan) ? pagePlan : [])
    .filter((page) => page?.page_type === "image")
    .map((page) => clean(page.story_role))
    .filter(Boolean));
}

function authoritativeField(answers = {}, candidates = []) {
  return candidates.find((field) => clean(answers?.[field])) || "";
}

export function createAgeIntentionContract(answers = {}, pagePlan = []) {
  const profile = readingAgeProfile(answers.age);
  const rules = AGE_RULES[profile.id];
  const availableRoles = sceneRoles(pagePlan);
  const milestones = MILESTONES.map((milestone) => ({
    id: milestone.id,
    authoritativeSourceField: authoritativeField(answers, milestone.sourceFields),
    requiredStoryRoles: milestone.storyRoles.filter((role) => availableRoles.has(role)),
  }));
  const attemptRoles = [...new Set([
    ...(milestones
    .find((milestone) => milestone.id === "progressive_attempts")
      ?.requiredStoryRoles || []),
    ...["challenge_and_choice"].filter((role) => availableRoles.has(role)),
  ])];
  return {
    version: AGE_INTENTION_CONTRACT_VERSION,
    ageProfile: {
      id: profile.id,
      age: profile.age,
      ...rules,
    },
    intentionAuthority: {
      selectedIntentionId: clean(answers.story_intent_id),
      selectedSeedId: clean(answers.story_seed_id),
      milestones,
    },
    childAgency: {
      attemptStoryRoles: attemptRoles,
      minimumDistinctAttempts: Math.min(3, Math.max(2, attemptRoles.length)),
      decisiveStoryRoles: ["challenge_and_choice", "climax"].filter((role) => availableRoles.has(role)),
      guideMay: ["encourage", "model", "clarify", "enable"],
      guideMustNot: ["perform_the_decisive_action", "deliver_the_solution", "replace_the_childs_choice"],
    },
    messageDelivery: {
      demonstrateBeforeExplicitStatement: true,
      maximumExplicitFormulations: 1,
      allowedExplicitStoryRoles: ["return_home_and_moral"].filter((role) => availableRoles.has(role)),
      keepPrivateContextImplicit: true,
    },
  };
}

export function ageIntentionContractStructuralIssues(contract = {}, scenes = []) {
  const issues = [];
  if (Number(contract?.version) !== AGE_INTENTION_CONTRACT_VERSION) {
    issues.push("age-intention contract version is invalid");
    return issues;
  }
  const profileId = clean(contract?.ageProfile?.id);
  const rules = AGE_RULES[profileId];
  if (!rules) issues.push("age-intention profile id is invalid");
  if (!Number.isInteger(Number(contract?.ageProfile?.age))) issues.push("age-intention profile age is invalid");
  if (rules) {
    for (const [field, expected] of Object.entries(rules)) {
      if (contract?.ageProfile?.[field] !== expected) issues.push(`age-intention profile ${field} is invalid`);
    }
  }
  const availableRoles = new Set((Array.isArray(scenes) ? scenes : [])
    .map((scene) => clean(scene?.storyRole || scene?.story_role))
    .filter(Boolean));
  const milestones = Array.isArray(contract?.intentionAuthority?.milestones)
    ? contract.intentionAuthority.milestones
    : [];
  if (milestones.length !== MILESTONES.length) issues.push("age-intention contract requires eight narrative milestones");
  for (const definition of MILESTONES) {
    const milestone = milestones.find((item) => item?.id === definition.id);
    if (!milestone) {
      issues.push(`age-intention milestone ${definition.id} is missing`);
      continue;
    }
    if (
      milestone.authoritativeSourceField
      && !definition.sourceFields.includes(milestone.authoritativeSourceField)
    ) issues.push(`age-intention milestone ${definition.id} has an unsupported source field`);
    const requiredRoles = Array.isArray(milestone.requiredStoryRoles) ? milestone.requiredStoryRoles : [];
    if (requiredRoles.some((role) => !definition.storyRoles.includes(role) || (availableRoles.size && !availableRoles.has(role)))) {
      issues.push(`age-intention milestone ${definition.id} has an unsupported story role`);
    }
  }
  if (contract?.messageDelivery?.demonstrateBeforeExplicitStatement !== true) {
    issues.push("age-intention message must be demonstrated before it is stated");
  }
  if (Number(contract?.messageDelivery?.maximumExplicitFormulations) !== 1) {
    issues.push("age-intention contract allows only one explicit message formulation");
  }
  if (contract?.messageDelivery?.keepPrivateContextImplicit !== true) {
    issues.push("age-intention contract must keep private context implicit");
  }
  const attemptRoles = Array.isArray(contract?.childAgency?.attemptStoryRoles)
    ? contract.childAgency.attemptStoryRoles
    : [];
  if (attemptRoles.length < 2 || attemptRoles.some((role) => availableRoles.size && !availableRoles.has(role))) {
    issues.push("age-intention contract requires at least two valid child attempt roles");
  }
  if (![2, 3].includes(Number(contract?.childAgency?.minimumDistinctAttempts))) {
    issues.push("age-intention contract requires two or three distinct attempts");
  }
  return issues;
}

export function ageIntentionContractIssues(contract = {}, { pagePlan = [], answers = {} } = {}) {
  const planScenes = (Array.isArray(pagePlan) ? pagePlan : [])
    .filter((page) => page?.page_type === "image")
    .map((page) => ({ storyRole: page.story_role }));
  const issues = ageIntentionContractStructuralIssues(contract, planScenes);
  if (issues.some((issue) => issue === "age-intention contract version is invalid")) return issues;
  const expected = createAgeIntentionContract(answers, pagePlan);
  if (contract?.ageProfile?.id !== expected.ageProfile.id || Number(contract?.ageProfile?.age) !== expected.ageProfile.age) {
    issues.push("age-intention profile does not match the child age");
  }
  const milestones = Array.isArray(contract?.intentionAuthority?.milestones)
    ? contract.intentionAuthority.milestones
    : [];
  for (const expectedMilestone of expected.intentionAuthority.milestones) {
    const actual = milestones.find((milestone) => milestone?.id === expectedMilestone.id);
    if (!actual) {
      issues.push(`age-intention milestone ${expectedMilestone.id} is missing`);
      continue;
    }
    if (actual.authoritativeSourceField !== expectedMilestone.authoritativeSourceField) {
      issues.push(`age-intention milestone ${expectedMilestone.id} has the wrong source field`);
    }
    if (JSON.stringify(actual.requiredStoryRoles) !== JSON.stringify(expectedMilestone.requiredStoryRoles)) {
      issues.push(`age-intention milestone ${expectedMilestone.id} has the wrong story roles`);
    }
  }
  return [...new Set(issues)];
}
