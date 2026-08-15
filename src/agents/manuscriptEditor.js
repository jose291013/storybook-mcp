import { runAgent } from "../services/agentRunner.js";
import { bookLanguageInstruction, normalizeBookLanguage } from "../config/bookLanguages.js";
import { loadPrompt } from "../services/loadPrompt.js";

export async function manuscriptEditorAgent({
  language = "FR",
  pages = [],
  canonicalCharacters = [],
  approvedScenario = null,
  visualStoryboard = null,
} = {}, {
  backgroundExecution = null,
  backgroundStep = "",
} = {}) {
  const targetLanguage = normalizeBookLanguage(language);
  const result = await runAgent({
    name: "manuscriptEditor",
    clientKind: "story",
    modelRole: "manuscript_editor",
    jsonRepairModelRole: "manuscript_editor",
    system: `${bookLanguageInstruction(targetLanguage)}\n\n${loadPrompt("manuscript_editor.txt")}`,
    user: (input) => `COMPLETE_MANUSCRIPT_JSON:\n${JSON.stringify(input, null, 2)}\n\nReturn ONLY the requested JSON object.`,
    input: {
      language: targetLanguage,
      pages,
      canonical_characters: canonicalCharacters,
      approved_scenario: approvedScenario,
      visual_beats: (Array.isArray(visualStoryboard?.sceneContracts) ? visualStoryboard.sceneContracts : [])
        .map((contract) => ({
          page_number: Number(contract?.text_page_number || 0),
          main_action: contract?.main_action || {},
          named_characters: contract?.named_characters || [],
          object_states: contract?.object_states || [],
          causal_frame: contract?.causal_frame || {},
          render_snapshot: contract?.render_snapshot || {},
          forbidden_elements: contract?.forbidden_elements || [],
        }))
        .filter((beat) => beat.page_number > 0),
    },
    backgroundExecution,
    backgroundStep,
  });
  return {
    status: result?.status === "corrected" ? "corrected" : "approved",
    pages: (Array.isArray(result?.pages) ? result.pages : []).map((page) => ({
      page_number: Number(page?.page_number),
      text: String(page?.text || "").trim(),
      reason: String(page?.reason || "").trim(),
    })).filter((page) => page.page_number > 0 && page.text),
  };
}
