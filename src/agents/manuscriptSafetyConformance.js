import { runAgent } from "../services/agentRunner.js";
import { bookLanguageInstruction, normalizeBookLanguage } from "../config/bookLanguages.js";
import { loadPrompt } from "../services/loadPrompt.js";

export async function manuscriptSafetyConformanceAgent({
  language = "FR",
  approvedSafety = {},
  pages = [],
  priorFailure = "",
} = {}, {
  backgroundExecution = null,
  backgroundStep = "",
} = {}) {
  const targetLanguage = normalizeBookLanguage(language);
  const result = await runAgent({
    name: "manuscriptSafetyConformance",
    clientKind: "story",
    modelRole: "manuscript_editor",
    jsonRepairModelRole: "manuscript_editor",
    system: `${bookLanguageInstruction(targetLanguage)}\n\n${loadPrompt("manuscript_safety_conformance.txt")}`,
    user: (input) => `MANUSCRIPT_SAFETY_CONFORMANCE_JSON:\n${JSON.stringify(input, null, 2)}\n\nReturn ONLY the requested JSON object.`,
    input: {
      language: targetLanguage,
      approved_safety: approvedSafety,
      pages,
      prior_failure: String(priorFailure || ""),
    },
    backgroundExecution,
    backgroundStep,
  });
  return {
    pages: (Array.isArray(result?.pages) ? result.pages : []).map((page) => ({
      page_number: Number(page?.page_number || 0),
      text: String(page?.text || "").replace(/\s+/gu, " ").trim(),
    })).filter((page) => page.page_number > 0 && page.text),
  };
}
