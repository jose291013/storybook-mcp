import { storyScenarioAgent } from "../agents/storyScenario.js";
import { storyScenarioAuditAgent } from "../agents/storyScenarioAudit.js";
import { createPagePlan } from "../config/bookStructure.js";
import {
  applyCreatorStoryScenarioEdits,
  normalizeStoryScenario,
  scenarioCharacterRegistry,
  stabilizeStoryScenario,
  validateStoryScenario,
  withStoryScenarioAuditEvidence,
} from "./storyScenario.js";
import {
  applyStoryScenarioRepairDirectives,
  buildStoryScenarioRepairDirectives,
} from "./storyScenarioRepairs.js";
import { generationCostPolicy } from "./generationCostPolicy.js";

export function scenarioGenerationRoute(previousScenario = null) {
  return previousScenario
    ? { phase: "revision", modelRole: "story_repair" }
    : { phase: "architect", modelRole: "story_architect" };
}

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
  const policy = generationCostPolicy().scenario;
  let scenario = null;
  let validation = { valid: false, issues: ["scenario has not been generated"] };
  let repairDirectives = [];
  let editorCalls = 0;
  const normalizeCandidate = (candidate, directives = []) => (
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
    ), directives, { language: normalized.answers.language })
  );

  const generationRoute = scenarioGenerationRoute(previousScenario);
  await onStep({ phase: generationRoute.phase, attempt: 1 });
  const candidate = await storyScenarioAgent(
    {
      ...input,
      structural_repair_attempt: 1,
    },
    {
      backgroundExecution,
      backgroundStep: `${generationRoute.phase}:1`,
      modelRole: generationRoute.modelRole,
    },
  );
  normalizeCandidate(candidate);
  await onStep({ phase: "validation", attempt: 1 });
  validation = validateStoryScenario(scenario);

  let repairCalls = 0;
  const repairScenario = async () => {
    if (repairCalls >= policy.repairCalls) return false;
    repairCalls += 1;
    repairDirectives = [
      ...repairDirectives,
      ...buildStoryScenarioRepairDirectives(scenario, validation),
    ].slice(0, 12);
    await onStep({ phase: "repair", attempt: repairCalls });
    const repaired = await storyScenarioAgent(
      {
        ...input,
        previous_scenario: scenario,
        validation_issues: validation.issues,
        repair_directives: repairDirectives,
        structural_repair_attempt: repairCalls,
      },
      {
        backgroundExecution,
        backgroundStep: `repair:${repairCalls}`,
        modelRole: "story_repair",
      },
    );
    normalizeCandidate(repaired, repairDirectives);
    await onStep({ phase: "validation", attempt: repairCalls + 1 });
    validation = validateStoryScenario(scenario);
    return true;
  };

  const auditScenario = async () => {
    editorCalls += 1;
    await onStep({ phase: "editor", attempt: editorCalls });
    const audit = await storyScenarioAuditAgent(
      {
        intake: normalized.answers,
        scenario,
      },
      {
        backgroundExecution,
        backgroundStep: `editor:${editorCalls}`,
      },
    );
    validation = {
      valid: audit.status === "approved",
      issues: audit.issues.map((issue) => (
        `${issue.sceneNumber ? `scene-${issue.sceneNumber}: ` : ""}${issue.code}: ${issue.explanation}`
      )),
      diagnostics: audit.issues,
    };
    repairDirectives = audit.repairDirectives;
    if (validation.valid) scenario = withStoryScenarioAuditEvidence(scenario);
    else if (scenario?.auditEvidence) delete scenario.auditEvidence;
    return audit;
  };

  if (!validation.valid) await repairScenario();

  if (validation.valid && policy.editorCalls > 0) {
    await auditScenario();
    if (!validation.valid && repairCalls < policy.repairCalls) {
      const repaired = await repairScenario();
      if (repaired && validation.valid && policy.finalAuditCalls > 0) {
        await auditScenario();
      } else if (repaired && validation.valid) {
        validation = {
          valid: false,
          issues: ["scenario final semantic audit is required after repair"],
          diagnostics: [],
        };
      }
    }
  }
  await onStep({ phase: "finalizing", attempt: 0 });
  return { scenario, validation };
}
