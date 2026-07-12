import { runAgent } from "../services/agentRunner.js";
import { loadPrompt } from "../services/loadPrompt.js";
import { bookLanguageInstruction, normalizeBookLanguage } from "../config/bookLanguages.js";

export async function intakeAgent(rawAnswers) {
  const system = loadPrompt("intake.txt");
  const language = normalizeBookLanguage(rawAnswers?.language);

  const result = await runAgent({
    name: "intake",
    system: `${bookLanguageInstruction(language)}\n\n${system}`,
    user: (input) =>
      `RAW_ANSWERS_JSON:\n${JSON.stringify(input, null, 2)}\n\nReturn ONLY the JSON object specified by the system instructions.`,
    input: rawAnswers
  });
  result.intake ||= {};
  result.intake.language = language;
  return result;
}
