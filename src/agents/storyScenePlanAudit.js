import { runAgent } from "../services/agentRunner.js";
import { loadPrompt } from "../services/loadPrompt.js";

function clean(value, maximum = 700) {
  return String(value || "").trim().slice(0, maximum);
}

export async function storyScenePlanAuditAgent({ approvedScenario, pageTexts, sceneContracts }) {
  if (!approvedScenario) return { status: "approved", issues: [] };
  const result = await runAgent({
    name: "storyScenePlanAudit",
    clientKind: "qa",
    system: loadPrompt("story_scene_plan_audit.txt"),
    user: (input) => `FINAL_STORY_PLAN_JSON:\n${JSON.stringify(input, null, 2)}\n\nReturn ONLY the requested JSON object.`,
    input: {
      approved_scenario: approvedScenario,
      page_texts: pageTexts,
      scene_contracts: sceneContracts,
    },
  });
  const audit = result?.audit || {};
  const issues = (Array.isArray(audit.issues) ? audit.issues : []).slice(0, 8).map((issue) => ({
    sceneNumber: Math.max(0, Number(issue?.scene_number || 0)),
    code: clean(issue?.code, 80) || "scenario_fidelity",
    explanation: clean(issue?.explanation),
  })).filter((issue) => issue.explanation);
  return {
    status: audit.status === "rejected" || issues.length ? "rejected" : "approved",
    issues,
  };
}
