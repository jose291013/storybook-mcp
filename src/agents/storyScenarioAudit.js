import { runAgent } from "../services/agentRunner.js";
import { bookLanguageInstruction, normalizeBookLanguage } from "../config/bookLanguages.js";
import { loadPrompt } from "../services/loadPrompt.js";

function clean(value, maximum = 600) {
  return String(value || "").trim().slice(0, maximum);
}

function key(value) {
  return clean(value, 1200)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function progressionStage(scene = {}) {
  const evidence = key([
    scene.title,
    scene.action,
    scene.narrativeFunction,
    scene.storyChange,
  ].filter(Boolean).join(" "));
  // Intentionally ordered: a preparation may mention the future intention to
  // share without yet performing the later invitation or shared celebration.
  if (/prepar|crea|termin|complet|elabor|mezcl|cocin|assemble|finish|make/.test(evidence)) return 1;
  if (/invit|propos|ofrec|conv|ask[^.]{0,30}join/.test(evidence)) return 2;
  if (/compart|repart|partag|share|distribu|celebr/.test(evidence)) return 3;
  return 0;
}

function isProgressionDuplicate(code = "") {
  return /duplicate|repeat|progress|narrative.?function|story.?change/i.test(code);
}

export function reconcileStoryScenarioAudit(audit = {}, scenario = {}) {
  const issues = Array.isArray(audit.issues) ? audit.issues : [];
  const directives = Array.isArray(audit.repairDirectives) ? audit.repairDirectives : [];
  const affectedNumbers = new Set();
  for (const issue of issues.filter((item) => isProgressionDuplicate(item?.code))) {
    if (Number(issue?.sceneNumber) > 0) affectedNumbers.add(Number(issue.sceneNumber));
    for (const directive of directives.filter((item) => item?.code === issue?.code)) {
      for (const number of directive.affectedSceneNumbers || []) affectedNumbers.add(Number(number));
    }
  }
  const affectedScenes = (scenario?.scenes || [])
    .filter((scene) => affectedNumbers.has(Number(scene?.sceneNumber)))
    .sort((left, right) => Number(left.sceneNumber) - Number(right.sceneNumber));
  const stages = affectedScenes.map(progressionStage).filter(Boolean);
  const legitimateChain = affectedScenes.length >= 2
    && stages.length === affectedScenes.length
    && new Set(stages).size === stages.length
    && stages.every((stage, index) => index === 0 || stage > stages[index - 1]);
  if (!legitimateChain) return { issues, repairDirectives: directives };
  const retainedIssues = issues.filter((issue) => !(
    isProgressionDuplicate(issue?.code)
    && affectedNumbers.has(Number(issue?.sceneNumber))
  ));
  const removedCodes = new Set(issues
    .filter((issue) => !retainedIssues.includes(issue))
    .map((issue) => issue.code));
  return {
    issues: retainedIssues,
    repairDirectives: directives.filter((directive) => !removedCodes.has(directive?.code)),
  };
}

export async function storyScenarioAuditAgent(
  { intake = {}, scenario = {} } = {},
  {
    backgroundExecution = null,
    backgroundStep = "",
    modelRole = "story_editor",
    jsonRepairModelRole = "story_repair",
  } = {},
) {
  const language = normalizeBookLanguage(intake.language);
  const result = await runAgent({
    name: "storyScenarioAudit",
    clientKind: "scenario",
    modelRole,
    jsonRepairModelRole,
    system: `${bookLanguageInstruction(language)}\n\n${loadPrompt("story_scenario_audit.txt")}`,
    user: (payload) => `SCENARIO_AUDIT_INPUT_JSON:\n${JSON.stringify(payload, null, 2)}\n\nReturn ONLY the requested JSON object.`,
    input: { intake, scenario },
    backgroundExecution,
    backgroundStep,
  });
  const audit = result?.audit || {};
  const issues = (Array.isArray(audit.issues) ? audit.issues : []).slice(0, 8).map((issue) => ({
    code: clean(issue?.code, 80) || "semantic_contradiction",
    sceneNumber: Math.max(0, Number(issue?.scene_number || 0)),
    explanation: clean(issue?.explanation),
  })).filter((issue) => issue.explanation);
  const repairDirectives = (Array.isArray(audit.repair_directives) ? audit.repair_directives : [])
    .slice(0, 8)
    .map((directive) => ({
      type: "editorial_causal_repair",
      code: clean(directive?.code, 80) || "semantic_contradiction",
      affectedSceneNumbers: (Array.isArray(directive?.affected_scene_numbers)
        ? directive.affected_scene_numbers
        : [])
        .map(Number)
        .filter((number) => Number.isInteger(number) && number > 0)
        .slice(0, 8),
      entityIds: (Array.isArray(directive?.entity_ids) ? directive.entity_ids : [])
        .map((value) => clean(value, 80))
        .filter(Boolean)
        .slice(0, 8),
      instruction: clean(directive?.instruction, 800),
    }))
    .filter((directive) => directive.instruction);
  const reconciled = reconcileStoryScenarioAudit({ issues, repairDirectives }, scenario);
  return {
    status: reconciled.issues.length ? "rejected" : "approved",
    issues: reconciled.issues,
    repairDirectives: reconciled.repairDirectives,
  };
}
