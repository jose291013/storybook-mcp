import { runAgent } from "../services/agentRunner.js";
import { loadPrompt } from "../services/loadPrompt.js";
import { parseJsonSafe } from "../services/parseJsonSafe.js";
import { extractBlueprintCandidate } from "../services/extractBlueprintCandidate.js";

export async function blueprintRepairAgent({ finalBlueprint, qa, pagePlan }, {
  backgroundExecution = null,
  backgroundStep = "",
} = {}) {
  const out = await runAgent({
    name: "blueprintRepair",
    clientKind: "story",
    modelRole: "blueprint",
    jsonRepairModelRole: "blueprint",
    system: loadPrompt("blueprint_repair.txt"),
    user: (input) => `REPAIR_INPUT_JSON:\n${JSON.stringify(input, null, 2)}\n\nReturn ONLY the complete corrected blueprint JSON.`,
    input: {
      final_blueprint: finalBlueprint,
      qa,
      page_plan: pagePlan,
    },
    backgroundExecution,
    backgroundStep,
  });
  const candidate = out?.json ?? out?.data ?? out?.output ?? out?.message ?? out?.text ?? out;
  if (candidate && typeof candidate === "object") return extractBlueprintCandidate(candidate);
  const parsed = parseJsonSafe(String(candidate || ""));
  if (!parsed) throw new Error("blueprintRepairAgent: could not parse repaired blueprint JSON");
  return extractBlueprintCandidate(parsed);
}
