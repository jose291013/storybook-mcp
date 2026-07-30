import { storyScenarioAgent } from "../agents/storyScenario.js";
import { storyScenarioAuditAgent } from "../agents/storyScenarioAudit.js";
import { createPagePlan } from "../config/bookStructure.js";
import {
  applyCreatorStoryScenarioEdits,
  normalizeStoryScenario,
  scenarioCharacterRegistry,
  stabilizeStoryScenario,
  validateStoryScenario,
} from "./storyScenario.js";
import {
  applyStoryScenarioRepairDirectives,
  buildStoryScenarioRepairDirectives,
} from "./storyScenarioRepairs.js";

export async function generateValidatedScenario({
  normalized,
  previousScenario,
  creatorClarifications,
  sceneEdits,
  addedCharacters,
  feedback,
  safetyContract,
  sensitivityContract,
  onStep = async () => {},
  backgroundExecution = null,
}) {
  const pagePlan = createPagePlan(normalized.answers.page_count);
  const canonicalCharacters = [
    ...scenarioCharacterRegistry(normalized),
    ...(previousScenario?.characters || []),
    ...addedCharacters.map((character) => ({
      name: character.name,
      role: "story_character",
      storyRole: "guest",
      relationship: "story character",
    })),
  ].filter((character, index, all) => (
    character.name
    && all.findIndex((candidate) => candidate.name.localeCompare(
      character.name,
      undefined,
      { sensitivity: "base" },
    ) === 0) === index
  ));
  const input = {
    intake: normalized.answers,
    canonical_characters: canonicalCharacters,
    page_plan: pagePlan.filter((page) => page.page_type === "image"),
    creator_clarifications: creatorClarifications,
    creator_scene_edits: sceneEdits,
    creator_feedback: String(feedback || "").slice(0, 2000),
    child_safety_contract: safetyContract,
    sensitivity_contract: sensitivityContract,
    previous_scenario: previousScenario || null,
  };
  let scenario = null;
  let validation = { valid: false, issues: ["scenario has not been generated"] };
  let repairDirectives = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await onStep({ phase: "architect", attempt });
    const candidate = await storyScenarioAgent(
      {
        ...input,
        ...(scenario ? {
          previous_scenario: scenario,
          validation_issues: validation.issues,
          repair_directives: repairDirectives,
        } : {}),
        structural_repair_attempt: attempt,
      },
      {
        backgroundExecution,
        backgroundStep: `architect:${attempt}`,
      },
    );
    scenario = applyStoryScenarioRepairDirectives(stabilizeStoryScenario(
      applyCreatorStoryScenarioEdits(
        normalizeStoryScenario(candidate, {
          pagePlan,
          canonicalCharacters,
          creatorClarifications,
          worldContract: normalized.answers.universe_story_contract,
          language: normalized.answers.language,
          requireCausalGraph: true,
        }),
        { sceneEdits, addedCharacters },
      ),
    ), repairDirectives, { language: normalized.answers.language });
    await onStep({ phase: "validation", attempt });
    validation = validateStoryScenario(scenario);
    if (validation.valid) {
      await onStep({ phase: "editor", attempt });
      const audit = await storyScenarioAuditAgent(
        {
          intake: normalized.answers,
          scenario,
        },
        {
          backgroundExecution,
          backgroundStep: `editor:${attempt}`,
        },
      );
      validation = {
        valid: audit.status === "approved",
        issues: audit.issues.map((issue) => (
          `${issue.sceneNumber ? `scene-${issue.sceneNumber}: ` : ""}${issue.code}: ${issue.explanation}`
        )),
        diagnostics: audit.issues,
      };
      if (!validation.valid) repairDirectives = audit.repairDirectives;
    }
    if (validation.valid) break;
    repairDirectives = [
      ...repairDirectives,
      ...buildStoryScenarioRepairDirectives(scenario, validation),
    ].slice(0, 12);
  }
  await onStep({ phase: "finalizing", attempt: 0 });
  return { scenario, validation };
}
