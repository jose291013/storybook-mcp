import { runAgent } from "../services/agentRunner.js";
import { bookLanguageInstruction, normalizeBookLanguage } from "../config/bookLanguages.js";
import { loadPrompt } from "../services/loadPrompt.js";

export async function manuscriptPreflightNormalizerAgent({
  language = "FR",
  hero = {},
  pages = [],
  priorFailure = "",
} = {}, {
  backgroundExecution = null,
  backgroundStep = "",
} = {}) {
  const targetLanguage = normalizeBookLanguage(language);
  const result = await runAgent({
    name: "manuscriptPreflightNormalizer",
    clientKind: "story",
    modelRole: "manuscript_editor",
    jsonRepairModelRole: "manuscript_editor",
    system: `${bookLanguageInstruction(targetLanguage)}\n\n${loadPrompt("manuscript_preflight_normalizer.txt")}`,
    user: (input) => `MANUSCRIPT_WORD_PREFLIGHT_JSON:\n${JSON.stringify(input, null, 2)}\n\nReturn ONLY the requested JSON object.`,
    input: {
      language: targetLanguage,
      hero,
      pages,
      prior_failure: String(priorFailure || ""),
    },
    backgroundExecution,
    backgroundStep,
  });
  return {
    pages: (Array.isArray(result?.pages) ? result.pages : []).map((page) => ({
      page_number: Number(page?.page_number || 0),
      text: String(page?.text || "").trim(),
    })).filter((page) => page.page_number > 0 && page.text),
  };
}
