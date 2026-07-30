import { runAgent } from "../services/agentRunner.js";
import { bookLanguageInstruction, normalizeBookLanguage } from "../config/bookLanguages.js";
import { loadPrompt } from "../services/loadPrompt.js";

export async function manuscriptWriterAgent({
  language = "FR",
  hero = {},
  act = 1,
  pages = [],
  storyContext = {},
  previousText = "",
} = {}, {
  backgroundExecution = null,
  backgroundStep = "",
} = {}) {
  const targetLanguage = normalizeBookLanguage(language);
  const result = await runAgent({
    name: "manuscriptWriter",
    clientKind: "story",
    modelRole: "story_writer",
    jsonRepairModelRole: "manuscript_editor",
    system: `${bookLanguageInstruction(targetLanguage)}\n\n${loadPrompt("manuscript_writer.txt")}`,
    user: (input) => `MANUSCRIPT_ACT_INPUT_JSON:\n${JSON.stringify(input, null, 2)}\n\nReturn ONLY the requested JSON object.`,
    input: {
      language: targetLanguage,
      hero,
      act,
      pages,
      story_context: storyContext,
      previous_text: previousText,
    },
    backgroundExecution,
    backgroundStep,
  });
  const outputPages = Array.isArray(result?.pages) ? result.pages : [];
  return {
    pages: outputPages.map((page) => ({
      page_number: Number(page?.page_number),
      text: String(page?.text || "").trim(),
    })),
  };
}
