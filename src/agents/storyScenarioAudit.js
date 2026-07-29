import { runAgent } from "../services/agentRunner.js";
import { bookLanguageInstruction, normalizeBookLanguage } from "../config/bookLanguages.js";
import { loadPrompt } from "../services/loadPrompt.js";

function clean(value, maximum = 600) {
  return String(value || "").trim().slice(0, maximum);
}

export async function storyScenarioAuditAgent({ intake = {}, scenario = {} } = {}) {
  const language = normalizeBookLanguage(intake.language);
  const result = await runAgent({
    name: "storyScenarioAudit",
    clientKind: "scenario",
    modelRole: "story_editor",
    system: `${bookLanguageInstruction(language)}\n\n${loadPrompt("story_scenario_audit.txt")}`,
    user: (payload) => `SCENARIO_AUDIT_INPUT_JSON:\n${JSON.stringify(payload, null, 2)}\n\nReturn ONLY the requested JSON object.`,
    input: { intake, scenario },
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
  return {
    status: audit.status === "rejected" || issues.length ? "rejected" : "approved",
    issues,
    repairDirectives,
  };
}
